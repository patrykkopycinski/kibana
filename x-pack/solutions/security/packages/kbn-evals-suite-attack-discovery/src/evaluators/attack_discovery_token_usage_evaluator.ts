/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import type { EsClient } from '@kbn/scout';
import type { ToolingLog } from '@kbn/tooling-log';
import type { AttackDiscoveryDatasetExample, AttackDiscoveryTaskOutput } from '../types';

const TOKEN_USAGE_INDEX = '.kibana-inference-token-usage';
const MAX_USAGE_DOCS = 10_000;
const PEAK_WINDOW_MS = 60_000;

const GATE_FEATURE_ID = 'attack_discovery_gate';
const REPORT_FEATURE_ID = 'attack_discovery_report';
const PARENT_FEATURE_ID = 'attack_discovery';

export const ATTACK_DISCOVERY_TOKEN_PHASES = ['gate', 'report', 'generation', 'untagged'] as const;

export type AttackDiscoveryTokenPhase = (typeof ATTACK_DISCOVERY_TOKEN_PHASES)[number];

export interface TokenUsageDoc {
  '@timestamp': string;
  token_usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cached_tokens?: number;
  };
  inference?: {
    connector_id?: string;
    feature_id?: string;
    parent_feature_id?: string;
  };
}

export interface PhaseTokenUsage {
  inputTokens: number;
  cachedTokens: number;
  uncachedTokens: number;
  outputTokens: number;
  calls: number;
  peak60sInputTokens: number;
  maxCallInputTokens: number;
}

/**
 * `gate` and `report` are the agent steps tagged with their own plugin id.
 * `generation` is every other call under the `attack_discovery` parent feature.
 * Anything else, including calls with no feature id, is `untagged`.
 */
const phaseOf = (doc: TokenUsageDoc): AttackDiscoveryTokenPhase => {
  const featureId = doc.inference?.feature_id;
  if (featureId === GATE_FEATURE_ID) return 'gate';
  if (featureId === REPORT_FEATURE_ID) return 'report';
  if (doc.inference?.parent_feature_id === PARENT_FEATURE_ID) return 'generation';
  return 'untagged';
};

const emptyUsage = (): PhaseTokenUsage => ({
  inputTokens: 0,
  cachedTokens: 0,
  uncachedTokens: 0,
  outputTokens: 0,
  calls: 0,
  peak60sInputTokens: 0,
  maxCallInputTokens: 0,
});

/** Largest input sum over any window of `PEAK_WINDOW_MS` (start inclusive, end exclusive). */
const peakWindowInput = (calls: ReadonlyArray<{ at: number; input: number }>): number => {
  const sorted = [...calls].sort((a, b) => a.at - b.at);
  let peak = 0;
  let windowSum = 0;
  let tail = 0;
  for (const { at, input } of sorted) {
    windowSum += input;
    while (sorted[tail].at <= at - PEAK_WINDOW_MS) {
      windowSum -= sorted[tail].input;
      tail += 1;
    }
    peak = Math.max(peak, windowSum);
  }
  return peak;
};

export const computePhaseTokenUsage = (
  docs: ReadonlyArray<TokenUsageDoc>
): Record<AttackDiscoveryTokenPhase, PhaseTokenUsage> => {
  const usage = Object.fromEntries(
    ATTACK_DISCOVERY_TOKEN_PHASES.map((phase) => [phase, emptyUsage()])
  ) as Record<AttackDiscoveryTokenPhase, PhaseTokenUsage>;
  const calls = Object.fromEntries(
    ATTACK_DISCOVERY_TOKEN_PHASES.map((phase) => [
      phase,
      [] as Array<{ at: number; input: number }>,
    ])
  ) as Record<AttackDiscoveryTokenPhase, Array<{ at: number; input: number }>>;

  for (const doc of docs) {
    const phase = phaseOf(doc);
    const input = doc.token_usage?.prompt_tokens ?? 0;
    const cached = doc.token_usage?.cached_tokens ?? 0;
    const bucket = usage[phase];

    bucket.inputTokens += input;
    bucket.cachedTokens += cached;
    bucket.outputTokens += doc.token_usage?.completion_tokens ?? 0;
    bucket.calls += 1;
    bucket.maxCallInputTokens = Math.max(bucket.maxCallInputTokens, input);
    calls[phase].push({ at: Date.parse(doc['@timestamp']), input });
  }

  for (const phase of ATTACK_DISCOVERY_TOKEN_PHASES) {
    // `cached_tokens` is a subset of `prompt_tokens`, not additive.
    usage[phase].uncachedTokens = usage[phase].inputTokens - usage[phase].cachedTokens;
    usage[phase].peak60sInputTokens = peakWindowInput(calls[phase]);
  }

  return usage;
};

interface RunWindow {
  startedAt: string;
  connectorId?: string;
}

const readRunWindow = (
  output: AttackDiscoveryTaskOutput,
  connectorId: string | undefined
): RunWindow | undefined => {
  const raw = output?.raw as { started_at?: unknown; workflow_runs?: unknown } | undefined;
  if (typeof raw?.started_at !== 'string' || raw.workflow_runs === undefined) return undefined;
  return { startedAt: raw.started_at, connectorId };
};

const isIndexMissing = (e: unknown): boolean => {
  const err = e as { meta?: { statusCode?: number }; message?: string };
  return err?.meta?.statusCode === 404 || /index_not_found/.test(err?.message ?? '');
};

type UsageLookup =
  | { kind: 'ok'; usage: Record<AttackDiscoveryTokenPhase, PhaseTokenUsage> }
  | { kind: 'unavailable'; reason: string };

/**
 * One evaluator per phase, report-only: the score is the phase's total input tokens, the full
 * breakdown (input, cached, uncached, output, calls, peak 60s input, max per-call input) is in
 * `metadata`. Direction is `neutral`, so no pass/fail or regression semantics apply.
 *
 * Token usage documents carry no execution or conversation id, so the run is attributed by time
 * window (from the run's start, with no upper bound because the report phase runs in the
 * background after the workflow run completes) and by connector id. Concurrent runs on the same
 * connector are counted together, and report calls still running at evaluation time are missing.
 * Only populated for `workflowApi` outputs.
 */
export const createAttackDiscoveryTokenUsageEvaluators = ({
  esClient,
  log,
}: {
  esClient: EsClient;
  log: ToolingLog;
}): Array<Evaluator<AttackDiscoveryDatasetExample, AttackDiscoveryTaskOutput>> => {
  const lookups = new WeakMap<AttackDiscoveryTaskOutput, Promise<UsageLookup>>();

  const lookup = (window: RunWindow): Promise<UsageLookup> =>
    esClient
      .search<TokenUsageDoc>({
        index: TOKEN_USAGE_INDEX,
        ignore_unavailable: true,
        size: MAX_USAGE_DOCS,
        sort: [{ '@timestamp': 'asc' }],
        _source: ['@timestamp', 'token_usage', 'inference'],
        query: {
          bool: {
            filter: [
              { range: { '@timestamp': { gte: window.startedAt } } },
              ...(window.connectorId
                ? [{ term: { 'inference.connector_id': window.connectorId } }]
                : []),
            ],
          },
        },
      })
      .then(
        (response): UsageLookup => ({
          kind: 'ok',
          usage: computePhaseTokenUsage(
            response.hits.hits.flatMap((hit) => (hit._source ? [hit._source] : []))
          ),
        }),
        (e: unknown): UsageLookup => {
          if (isIndexMissing(e)) return { kind: 'ok', usage: computePhaseTokenUsage([]) };
          const reason = e instanceof Error ? e.message : String(e);
          log.warning(`token usage lookup failed: ${reason}`);
          return { kind: 'unavailable', reason };
        }
      );

  return ATTACK_DISCOVERY_TOKEN_PHASES.map((phase) => ({
    name: `AttackDiscoveryTokens:${phase}`,
    kind: 'CODE',
    direction: 'neutral',
    evaluate: async ({ input, output }) => {
      const connectorId =
        typeof (input as { connectorId?: unknown })?.connectorId === 'string'
          ? (input as { connectorId: string }).connectorId
          : undefined;
      const window = readRunWindow(output, connectorId);
      if (!window) {
        return { score: null, label: 'not_applicable' };
      }

      let pending = lookups.get(output);
      if (!pending) {
        pending = lookup(window);
        lookups.set(output, pending);
      }
      const result = await pending;

      if (result.kind === 'unavailable') {
        return {
          score: null,
          label: 'unavailable',
          explanation: `token usage lookup failed: ${result.reason}`,
        };
      }

      const phaseUsage = result.usage[phase];
      return {
        score: phaseUsage.inputTokens,
        label: phaseUsage.calls === 0 ? 'no_usage' : 'ok',
        metadata: { phase, ...phaseUsage },
      };
    },
  }));
};

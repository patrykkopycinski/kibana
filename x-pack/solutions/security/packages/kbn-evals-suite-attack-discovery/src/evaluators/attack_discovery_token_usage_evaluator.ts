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

/** Must equal the `plugin-id` / `aggregate-by` of the managed workflows (asserted in the tests). */
export const ATTACK_DISCOVERY_GATE_FEATURE_ID = 'attack_discovery_gate';
export const ATTACK_DISCOVERY_REPORT_FEATURE_ID = 'attack_discovery_report';
export const ATTACK_DISCOVERY_GENERATION_FEATURE_ID = 'attack_discovery_generation';
export const ATTACK_DISCOVERY_PARENT_FEATURE_ID = 'attack_discovery';

const TOKEN_USAGE_TRACKING_SETTING = 'genAiSettings:tokenUsageTracking';

// Fallback after the client has waited for the report run: 2 min quiet, 5 min cap (the cap is part
// of the 30-min Playwright budget documented in the workflow API client).
const DEFAULT_SETTLE: SettleOptions = {
  quietMs: 120_000,
  maxWaitMs: 300_000,
  pollIntervalMs: 10_000,
};

/**
 * Feature id the evals harness tags its own judge/evaluator inference calls with. Same logic as
 * `getTelemetryPluginId` in `@kbn/evals` (not exported): env override, trimmed, default `kbn_evals`.
 */
const getEvalsFeatureId = (): string =>
  process.env.KBN_EVALS_TELEMETRY_PLUGIN_ID?.trim() || 'kbn_evals';

const GENERATION_UNTAGGED_NOTE =
  'generation calls are untagged on this build and are counted in `untagged`';

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

export interface SettleOptions {
  /** No new usage docs for this long means the run's usage has settled. */
  quietMs: number;
  /** Give up waiting for the usage to settle after this long. */
  maxWaitMs: number;
  pollIntervalMs: number;
}

/**
 * Each phase is matched on its exact feature id. The parent feature alone is not enough to call
 * a doc `generation`: anything else, including calls with no feature id, is `untagged`.
 */
const phaseOf = (doc: TokenUsageDoc): AttackDiscoveryTokenPhase => {
  switch (doc.inference?.feature_id) {
    case ATTACK_DISCOVERY_GATE_FEATURE_ID:
      return 'gate';
    case ATTACK_DISCOVERY_REPORT_FEATURE_ID:
      return 'report';
    case ATTACK_DISCOVERY_GENERATION_FEATURE_ID:
      return 'generation';
    default:
      return 'untagged';
  }
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
  const sorted = calls.filter(({ at }) => Number.isFinite(at)).sort((a, b) => a.at - b.at);
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
  trackingEnabled?: boolean;
  reportRunId?: string;
  reportRunStatus?: string;
}

const readRunWindow = (
  output: AttackDiscoveryTaskOutput,
  connectorId: string | undefined
): RunWindow | undefined => {
  const raw = output?.raw as
    | {
        started_at?: unknown;
        workflow_runs?: unknown;
        token_usage_tracking_enabled?: unknown;
        report_run_id?: unknown;
        report_run_status?: unknown;
      }
    | undefined;
  if (typeof raw?.started_at !== 'string' || raw.workflow_runs === undefined) return undefined;
  return {
    startedAt: raw.started_at,
    connectorId,
    trackingEnabled:
      typeof raw.token_usage_tracking_enabled === 'boolean'
        ? raw.token_usage_tracking_enabled
        : undefined,
    reportRunId: typeof raw.report_run_id === 'string' ? raw.report_run_id : undefined,
    reportRunStatus: typeof raw.report_run_status === 'string' ? raw.report_run_status : undefined,
  };
};

const totalOf = (total: number | { value?: number } | undefined, fallback: number): number =>
  typeof total === 'number' ? total : total?.value ?? fallback;

type UsageLookup =
  | {
      kind: 'ok';
      usage: Record<AttackDiscoveryTokenPhase, PhaseTokenUsage>;
      totalHits: number;
      truncated: boolean;
      usageWindowEnd: string;
      settled: boolean;
    }
  | { kind: 'unavailable'; reason: string };

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One evaluator per phase, report-only: the score is the phase's total input tokens, the full
 * breakdown (input, cached, uncached, output, calls, peak 60s input, max per-call input) is in
 * `metadata`. Direction is `neutral`, so no pass/fail or regression semantics apply.
 *
 * Token usage documents carry no execution or conversation id, so the run is attributed by time
 * window and connector id. The window starts at the run's start. Its end is found by waiting for
 * the usage to settle (no new docs for `settle.quietMs`, capped at `settle.maxWaitMs`), because
 * the report phase keeps running in the background after the workflow run completes. The end of
 * the window is the newest doc seen, `usage_window_end` in the metadata. Concurrent runs on the
 * same connector are still counted together.
 *
 * A run with tracking off or no docs (a missing index included, via `ignore_unavailable`) is `unavailable`, never 0. Until the
 * generation step is tagged with `ATTACK_DISCOVERY_GENERATION_FEATURE_ID`, its calls land in
 * `untagged` and both phases carry a note saying so. Only populated for `workflowApi` outputs.
 */
export const createAttackDiscoveryTokenUsageEvaluators = ({
  esClient,
  log,
  settle = DEFAULT_SETTLE,
  now = Date.now,
  sleep = defaultSleep,
}: {
  esClient: EsClient;
  log: ToolingLog;
  settle?: SettleOptions;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Array<Evaluator<AttackDiscoveryDatasetExample, AttackDiscoveryTaskOutput>> => {
  const lookups = new WeakMap<AttackDiscoveryTaskOutput, Promise<UsageLookup>>();

  const baseQuery = (window: RunWindow, upperBound?: string) => ({
    bool: {
      filter: [
        {
          range: {
            '@timestamp': { gte: window.startedAt, ...(upperBound ? { lte: upperBound } : {}) },
          },
        },
        ...(window.connectorId ? [{ term: { 'inference.connector_id': window.connectorId } }] : []),
      ],
      // The evals' own judge calls share the connector and the time window.
      must_not: [{ term: { 'inference.feature_id': getEvalsFeatureId() } }],
    },
  });

  /** Waits until no new usage docs arrive for `quietMs`; returns the newest doc's timestamp. */
  const settleUsage = async (
    window: RunWindow
  ): Promise<{ lastDocAt?: number; settled: boolean }> => {
    const startedWaiting = now();
    let lastCount = -1;
    let lastChangeAt = startedWaiting;
    let lastDocAt: number | undefined;

    for (;;) {
      const response = await esClient.search({
        index: TOKEN_USAGE_INDEX,
        ignore_unavailable: true,
        size: 0,
        track_total_hits: true,
        query: baseQuery(window),
        aggs: { last_doc: { max: { field: '@timestamp' } } },
      });
      const count = totalOf(response.hits.total as number | { value?: number }, 0);
      const maxValue = (response.aggregations as { last_doc?: { value?: number | null } })?.last_doc
        ?.value;
      lastDocAt = typeof maxValue === 'number' ? maxValue : undefined;

      const at = now();
      if (count !== lastCount) {
        lastCount = count;
        lastChangeAt = at;
      }
      if (at - lastChangeAt >= settle.quietMs) return { lastDocAt, settled: true };
      if (at - startedWaiting >= settle.maxWaitMs) return { lastDocAt, settled: false };
      await sleep(settle.pollIntervalMs);
    }
  };

  const lookup = async (window: RunWindow): Promise<UsageLookup> => {
    if (window.trackingEnabled === false) {
      return {
        kind: 'unavailable',
        reason: `${TOKEN_USAGE_TRACKING_SETTING} is off for this run, so no token usage was recorded`,
      };
    }

    try {
      const { lastDocAt, settled } = await settleUsage(window);
      if (lastDocAt === undefined) {
        return {
          kind: 'unavailable',
          reason:
            `no token usage docs found for this run in ${TOKEN_USAGE_INDEX} ` +
            `(check ${TOKEN_USAGE_TRACKING_SETTING} and the connector id)`,
        };
      }
      const usageWindowEnd = new Date(lastDocAt).toISOString();

      const response = await esClient.search<TokenUsageDoc>({
        index: TOKEN_USAGE_INDEX,
        ignore_unavailable: true,
        size: MAX_USAGE_DOCS,
        track_total_hits: true,
        sort: [{ '@timestamp': 'asc' }],
        _source: ['@timestamp', 'token_usage', 'inference'],
        query: baseQuery(window, usageWindowEnd),
      });
      const docs = response.hits.hits.flatMap((hit) => (hit._source ? [hit._source] : []));
      const totalHits = totalOf(response.hits.total as number | { value?: number }, docs.length);
      const truncated = totalHits > docs.length;
      if (truncated) {
        log.warning(
          `token usage truncated: ${totalHits} docs match the run window but only ${docs.length} were read`
        );
      }
      if (!settled) {
        log.warning(
          `token usage did not settle within ${
            settle.maxWaitMs / 1000
          }s; later calls may be missing`
        );
      }
      return {
        kind: 'ok',
        usage: computePhaseTokenUsage(docs),
        totalHits,
        truncated,
        usageWindowEnd,
        settled,
      };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      log.warning(`token usage lookup failed: ${reason}`);
      return { kind: 'unavailable', reason };
    }
  };

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
        return { score: null, label: 'unavailable', explanation: result.reason };
      }

      const phaseUsage = result.usage[phase];
      const generationUntagged =
        (phase === 'generation' || phase === 'untagged') &&
        result.usage.generation.calls === 0 &&
        result.usage.untagged.calls > 0;

      let label = 'ok';
      if (generationUntagged) label = 'generation_untagged';
      else if (phaseUsage.calls === 0) label = 'no_usage';

      return {
        score: phaseUsage.inputTokens,
        label,
        metadata: {
          phase,
          ...phaseUsage,
          total_hits: result.totalHits,
          truncated: result.truncated,
          usage_window_end: result.usageWindowEnd,
          settled: result.settled,
          ...(window.reportRunId ? { report_run_id: window.reportRunId } : {}),
          ...(window.reportRunStatus ? { report_run_status: window.reportRunStatus } : {}),
          ...(generationUntagged ? { note: GENERATION_UNTAGGED_NOTE } : {}),
        },
      };
    },
  }));
};

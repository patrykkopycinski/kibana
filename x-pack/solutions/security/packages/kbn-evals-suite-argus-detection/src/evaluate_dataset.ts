/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Evaluator, EvaluationResult, Example, EvaluationDataset } from '@kbn/evals';
import type { CandidateRule } from '../datasets/rule_pack';
import { MYTHOS_DETECTION_RULES } from '../datasets/rule_pack';
import type { ReplayClient, ReplayRuleResult } from './replay_rule';
import { variantDocId } from './replay_rule';
import {
  DEFAULT_GATE_THRESHOLDS,
  computeGateDecision,
  computeScores,
  resolveGateThresholds,
  type AggregateCounts,
  type AggregateScores,
  type GateDecision,
  type GateThresholds,
  type GateThresholdsOrigin,
  type GateThresholdsOverride,
} from './evaluators';

// ---------------------------------------------------------------------------
// Data contracts kept compatible with the original skeleton.
// ---------------------------------------------------------------------------

export interface DetectionRuleExampleInput {
  rule_id: string;
  rule_version: string;
  corpus_id: string;
  primitive_id: string;
  variant_index: number;
  variant_axis: string;
}

export interface DetectionRuleExpected {
  should_fire: boolean;
  expected_rule_ids: string[];
  mutation_axes: string[];
}

export interface DetectionRuleExampleMetadataShape {
  primitive_id: string;
  variant_index: number;
  variant_axis: string;
}

export type DetectionRuleExampleMetadata =
  | (DetectionRuleExampleMetadataShape & Record<string, unknown>)
  | null;

export type DetectionRuleExample = Example<
  DetectionRuleExampleInput & Record<string, unknown>,
  DetectionRuleExpected,
  DetectionRuleExampleMetadata
>;

export interface DetectionRuleTaskOutput {
  observed_fire: boolean;
  observed_rule_ids: string[];
  signals_produced: number;
  replay_error?: string;
}

export type DetectionRuleDataset = EvaluationDataset<DetectionRuleExample>;

/**
 * Per-example evaluator: a boolean "did the observed fire match the expected
 * fire for this rule on this variant?". The aggregate math (precision, recall,
 * FP rate, variant coverage) lives in `src/evaluators.ts` so the per-example
 * evaluator stays cheap and re-usable.
 */
export const correctClassificationEvaluator: Evaluator<
  DetectionRuleExample,
  DetectionRuleTaskOutput
> = {
  name: 'CorrectClassification',
  kind: 'CODE',
  async evaluate({ output, expected }): Promise<EvaluationResult> {
    const obs = output as DetectionRuleTaskOutput | undefined;
    const exp = expected as DetectionRuleExpected | undefined;
    if (!obs || !exp) {
      return { score: null, label: 'missing-data', explanation: 'output or expected missing' };
    }
    const ok = obs.observed_fire === exp.should_fire;
    return {
      score: ok ? 1 : 0,
      label: ok ? 'correct' : obs.observed_fire ? 'false-positive' : 'false-negative',
      metadata: {
        observed_fire: obs.observed_fire,
        should_fire: exp.should_fire,
        expected_rule_ids: exp.expected_rule_ids,
      },
    };
  },
};

/** Retained for backward compatibility with the original skeleton imports. */
export const detectionRuleEvaluators = [correctClassificationEvaluator];
export const precisionEvaluator = correctClassificationEvaluator;
export const recallEvaluator = correctClassificationEvaluator;
export const fpRateBaselineEvaluator = correctClassificationEvaluator;
export const variantCoverageEvaluator = correctClassificationEvaluator;

// ---------------------------------------------------------------------------
// Corpus loader
// ---------------------------------------------------------------------------

interface CorpusVariantLabel {
  variant_id: string;
  corpus_id: string;
  primitive_id: string;
  variant_axis: string;
  variant_index: number;
  should_fire: boolean;
  expected_rule_ids: string[];
  mutation_axes: string[];
}

interface CorpusHitSource {
  _argus: {
    corpus_id: string;
    primitive_id: string;
    variant_axis: string;
    variant_index: number;
    should_fire?: boolean;
    expected_rule_ids?: string[];
    mutation_axes?: string[];
    is_simulation_emission?: boolean;
  };
}

export const DETECTION_EVAL_RUNS_INDEX = '.soc-argus-eval-runs';

/**
 * Load labelled variants for a corpus, skipping re-emissions from the
 * frontier simulator. The loader is memoised per call (not across calls)
 * so a CLI run can call it twice cheaply if needed.
 */
export const loadCorpusLabels = async (
  esClient: Client,
  corpusIndex: string,
  corpusId: string
): Promise<CorpusVariantLabel[]> => {
  const response = await esClient.search<CorpusHitSource>({
    index: corpusIndex,
    size: 10_000,
    query: {
      bool: {
        filter: [
          { term: { '_argus.corpus_id': corpusId } },
          { bool: { must_not: { term: { '_argus.is_simulation_emission': true } } } },
        ],
      },
    },
    _source: [
      '_argus.corpus_id',
      '_argus.primitive_id',
      '_argus.variant_axis',
      '_argus.variant_index',
      '_argus.should_fire',
      '_argus.expected_rule_ids',
      '_argus.mutation_axes',
    ],
    track_total_hits: true,
  });

  const hits = response.hits?.hits ?? [];
  const bySeenId = new Map<string, CorpusVariantLabel>();
  for (const hit of hits) {
    const argus = hit._source?._argus;
    if (!argus) {
      // Skip hits without the expected shape; _source may be absent under
      // certain projection/mapping conditions.
    } else {
      const variantId = variantDocId(argus.primitive_id, argus.variant_axis, argus.variant_index);
      if (!bySeenId.has(variantId)) {
        bySeenId.set(variantId, {
          variant_id: variantId,
          corpus_id: argus.corpus_id,
          primitive_id: argus.primitive_id,
          variant_axis: argus.variant_axis,
          variant_index: argus.variant_index,
          should_fire: Boolean(argus.should_fire),
          expected_rule_ids: Array.isArray(argus.expected_rule_ids) ? argus.expected_rule_ids : [],
          mutation_axes: Array.isArray(argus.mutation_axes) ? argus.mutation_axes : [],
        });
      }
    }
  }
  return [...bySeenId.values()];
};

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface RuleEvaluationRow {
  '@timestamp': string;
  run_kind: 'detection';
  run_id: string;
  suite_id: string;
  corpus_id: string;
  corpus_index: string;
  rule_id: string;
  rule_version: string;
  rule_name: string;
  counts: AggregateCounts;
  scores: AggregateScores;
  variants: {
    positive_total: number;
    positive_axes: string[];
    fired_axes: string[];
    fired_variant_ids: string[];
  };
  gate_decision: GateDecision;
  gate_thresholds: GateThresholds;
  /**
   * Highest-precedence layer that contributed to the resolved
   * `gate_thresholds`. Surfaces in `.soc-argus-eval-runs` so an analyst can
   * see *why* a rule was scored under non-default thresholds without having
   * to cross-reference the rule pack (B6).
   */
  gate_thresholds_origin: GateThresholdsOrigin;
  replay_error?: string;
}

export const aggregateRuleRun = ({
  rule,
  replay,
  labels,
  corpusIndex,
  corpusId,
  runId,
  suiteId,
  nowIso,
  defaultThresholds = DEFAULT_GATE_THRESHOLDS,
  runOverride,
}: {
  rule: CandidateRule;
  replay: ReplayRuleResult;
  labels: readonly CorpusVariantLabel[];
  corpusIndex: string;
  corpusId: string;
  runId: string;
  suiteId: string;
  nowIso: string;
  /**
   * Defaults the resolution should fall back to. Tests pass a known-good
   * frozen object; production callers leave this unset so
   * `DEFAULT_GATE_THRESHOLDS` is used.
   */
  defaultThresholds?: GateThresholds;
  /**
   * Run-wide override (e.g. a tuned per-corpus gate). Per-rule overrides on
   * `rule.gate_overrides` win over this. See
   * {@link resolveGateThresholds}.
   */
  runOverride?: GateThresholdsOverride;
}): RuleEvaluationRow => {
  const firedIds = new Set(replay.fired_variant_ids);
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  const positiveAxes = new Set<string>();
  const firedAxes = new Set<string>();

  for (const label of labels) {
    const fired = firedIds.has(label.variant_id);
    if (label.should_fire) {
      positiveAxes.add(label.variant_axis);
      if (fired) {
        tp += 1;
        firedAxes.add(label.variant_axis);
      } else {
        fn += 1;
      }
    } else {
      if (fired) fp += 1;
      else tn += 1;
    }
  }

  const counts: AggregateCounts = {
    true_positives: tp,
    false_positives: fp,
    false_negatives: fn,
    true_negatives: tn,
  };
  const scores = computeScores(counts, [...positiveAxes], [...firedAxes]);
  const { thresholds: resolvedThresholds, origin: thresholdsOrigin } = resolveGateThresholds(
    defaultThresholds,
    runOverride,
    rule.gate_overrides
  );
  const gateDecision = computeGateDecision(scores, resolvedThresholds);

  return {
    '@timestamp': nowIso,
    run_kind: 'detection',
    run_id: runId,
    suite_id: suiteId,
    corpus_id: corpusId,
    corpus_index: corpusIndex,
    rule_id: rule.rule_id,
    rule_version: rule.rule_version,
    rule_name: rule.name,
    counts,
    scores,
    variants: {
      positive_total: tp + fn,
      positive_axes: [...positiveAxes].sort(),
      fired_axes: [...firedAxes].sort(),
      fired_variant_ids: replay.fired_variant_ids,
    },
    gate_decision: gateDecision,
    gate_thresholds: resolvedThresholds,
    gate_thresholds_origin: thresholdsOrigin,
    replay_error: replay.error,
  };
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface CreateEvaluateDetectionRulesDeps {
  esClient: Client;
  replayClient: ReplayClient;
  log: ToolingLog;
  /** Override rule pack — defaults to {@link MYTHOS_DETECTION_RULES}. */
  rules?: readonly CandidateRule[];
  /**
   * Run-level override for promotion thresholds (e.g. a tuned per-corpus
   * gate). Per-rule overrides on `CandidateRule.gate_overrides` win over
   * this. Both layers are validated by {@link resolveGateThresholds} —
   * out-of-range values throw. (B6.)
   */
  gateThresholdsOverride?: GateThresholdsOverride;
  /** Injected for deterministic tests. */
  now?: () => Date;
  /** Injected for deterministic tests. */
  generateRunId?: () => string;
}

export interface EvaluateDetectionRulesArgs {
  corpusId: string;
  corpusIndex?: string;
  suiteId?: string;
  runsIndex?: string;
}

export interface EvaluateDetectionRulesResult {
  run_id: string;
  suite_id: string;
  corpus_id: string;
  corpus_index: string;
  runs_index: string;
  rows: RuleEvaluationRow[];
}

const defaultCorpusIndex = (corpusId: string) => `.soc-eval-corpus-${corpusId}`;

const defaultRunId = () => `argus-deteng-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Run the ARGUS Detection Eval Vertical end-to-end: load labelled corpus,
 * replay each rule, aggregate the math, persist one row per rule to
 * `.soc-argus-eval-runs` (run_kind=detection), and return the rows for in-process callers
 * (the Playwright spec uses them for expect() assertions).
 */
export const createEvaluateDetectionRules = ({
  esClient,
  replayClient,
  log,
  rules = MYTHOS_DETECTION_RULES,
  gateThresholdsOverride,
  now = () => new Date(),
  generateRunId = defaultRunId,
}: CreateEvaluateDetectionRulesDeps) => {
  return async ({
    corpusId,
    corpusIndex = defaultCorpusIndex(corpusId),
    suiteId = 'argus-detection-vertical',
    runsIndex = DETECTION_EVAL_RUNS_INDEX,
  }: EvaluateDetectionRulesArgs): Promise<EvaluateDetectionRulesResult> => {
    const runId = generateRunId();
    const nowIso = now().toISOString();
    log.info(
      `[argus-deteng] run_id=${runId} suite=${suiteId} corpus=${corpusId} index=${corpusIndex} rules=${rules.length}`
    );

    const labels = await loadCorpusLabels(esClient, corpusIndex, corpusId);
    log.info(`[argus-deteng] loaded ${labels.length} labelled variants`);
    if (labels.length === 0) {
      log.warning(
        `[argus-deteng] corpus ${corpusIndex} has no labelled variants — did setup.sh seed the variant bank?`
      );
    }

    const rows: RuleEvaluationRow[] = [];
    for (const rule of rules) {
      const replay = await replayClient.replayRule({ rule, corpusIndex, corpusId });
      if (replay.error) {
        log.warning(`[argus-deteng] rule ${rule.rule_id} replay failed: ${replay.error}`);
      }
      const row = aggregateRuleRun({
        rule,
        replay,
        labels,
        corpusIndex,
        corpusId,
        runId,
        suiteId,
        nowIso,
        runOverride: gateThresholdsOverride,
      });
      log.info(
        `[argus-deteng] rule=${rule.rule_id} gate=${row.gate_decision} ` +
          `thresholds_origin=${row.gate_thresholds_origin} ` +
          `precision=${row.scores.precision.toFixed(2)} ` +
          `recall=${row.scores.recall.toFixed(2)} ` +
          `fp_rate=${row.scores.fp_rate_baseline.toFixed(3)} ` +
          `coverage=${row.scores.variant_coverage.toFixed(2)} ` +
          `(tp=${row.counts.true_positives}, fp=${row.counts.false_positives}, ` +
          `fn=${row.counts.false_negatives}, tn=${row.counts.true_negatives})`
      );
      rows.push(row);
    }

    if (rows.length > 0) {
      const operations: unknown[] = [];
      for (const row of rows) {
        operations.push({
          create: { _index: runsIndex, _id: `${row.run_id}-${row.rule_id}` },
        });
        operations.push(row);
      }
      try {
        const bulkResponse = await esClient.bulk({ operations, refresh: 'wait_for' });
        if (bulkResponse.errors) {
          const firstErr = bulkResponse.items.find((item) =>
            Object.values(item).some((v) => v && (v as { error?: unknown }).error)
          );
          log.warning(
            `[argus-deteng] bulk persist reported errors: ${JSON.stringify(firstErr ?? {})}`
          );
        } else {
          log.info(`[argus-deteng] persisted ${rows.length} run row(s) to ${runsIndex}`);
        }
      } catch (error) {
        log.error(
          `[argus-deteng] failed to persist runs to ${runsIndex}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        throw error;
      }
    }

    return {
      run_id: runId,
      suite_id: suiteId,
      corpus_id: corpusId,
      corpus_index: corpusIndex,
      runs_index: runsIndex,
      rows,
    };
  };
};

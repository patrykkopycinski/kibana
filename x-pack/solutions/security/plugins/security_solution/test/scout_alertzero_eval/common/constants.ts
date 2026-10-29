/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Ids are inlined rather than imported from `@kbn/alertzero-common` / `@kbn/workflows`: Playwright's
 * esbuild transform cannot load the managed-workflow YAML those barrels pull in. The same reason
 * applies to the sweep ids below.
 */

/** Space the eval seeds into and drives the sweeps in. */
export const EVAL_SPACE_ID = process.env.ALERTZERO_EVAL_SPACE_ID?.trim() || 'default';

export const ALERTS_INDEX = `.alerts-security.alerts-${EVAL_SPACE_ID}`;

/** Backing store of the `security-investigations` AI index the coverage sweep polls. */
export const COVERAGE_KI_INDEX = 'ai-index-idx-security-investigations';
export const COVERAGE_KI_TYPE = 'security.coverage';

export const RULE_TUNING_WORKER_ID = 'system-security-detection-rule-tuning';
export const RULE_COVERAGE_WORKER_ID = 'system-security-detection-rule-coverage';

/** Global sweeps: manual-only triggers, so the eval starts each one by hand. */
export const RULE_TUNING_SWEEP_WORKFLOW_ID = 'system-security-detection-rule-tuning';
export const RULE_COVERAGE_SWEEP_WORKFLOW_ID = 'system-security-detection-rule-coverage';

/** Review sub-workflows the sweeps fan out to; their model calls are what the eval measures. */
export const RULE_TUNING_REVIEW_WORKFLOW_ID = 'system-security-rule-tuning-review';
export const COVERAGE_REVIEW_WORKFLOW_ID = 'system-security-coverage-review';

/**
 * Workflow step `plugin-id`s. The inference plugin records the step's plugin-id as
 * `inference.feature_id` on every `.kibana-inference-token-usage` row, so a row without one of
 * these is a row whose cost cannot be attributed to a Worker.
 */
export const RULE_TUNING_PLUGIN_ID = 'alertzero_rule_tuning_review';
export const COVERAGE_PLUGIN_ID = 'alertzero_detection_coverage';
export const RULE_CREATION_PLUGIN_ID = 'alertzero_rule_creation';

export const EXPECTED_PLUGIN_IDS = [
  RULE_TUNING_PLUGIN_ID,
  COVERAGE_PLUGIN_ID,
  RULE_CREATION_PLUGIN_ID,
] as const;

/** An AlertZero inference tier: the feature whose endpoints `/internal/search_inference_endpoints/settings` assigns. */
export const ALERTZERO_TIER_FEATURE_IDS = [
  'alertzero_fast',
  'alertzero_reasoning',
  'alertzero_agentic',
] as const;

export const TOKEN_USAGE_DATA_STREAM = '.kibana-inference-token-usage';

/** `Workflow.spaceId` the eval runs in; the KI seeder has to match it or the sweep ignores the gap. */
export const EVAL_RUN_MARKER_PREFIX = 'alertzero-eval';

/**
 * Worker caps, read off the managed workflow definitions:
 * - `max_rules_per_sweep` is 10 in `rule_tuning_worker.yaml` and its input's maximum is 10 too, so
 *   no run can raise it (`detection_rule_workflows.test.ts` asserts the pair).
 * - the coverage sweep's `batch_size` input is capped at 50, and its search always returns at most
 *   50 candidates (`coverage_worker.yaml`); `detection_rule_coverage.yaml` forwards
 *   `maxGapsPerRun` into it.
 */
export const MAX_RULES_PER_SWEEP = 10;
export const MAX_GAPS_PER_SWEEP = 50;

export type ScaleTier = 'small' | 'medium' | 'large';

/** How much data each tier seeds. `large` is the Worker cap, so a tier can never exceed one sweep. */
export const SCALE_TIERS: Record<ScaleTier, { rules: number; fpPerRule: number; gaps: number }> = {
  small: { rules: 2, fpPerRule: 2, gaps: 5 },
  medium: { rules: 5, fpPerRule: 3, gaps: 25 },
  large: { rules: MAX_RULES_PER_SWEEP, fpPerRule: 4, gaps: MAX_GAPS_PER_SWEEP },
};

export const SCALE_TIER_ORDER: ScaleTier[] = ['small', 'medium', 'large'];

export const parseScaleTiers = (raw: string | undefined): ScaleTier[] => {
  const requested = (raw ?? 'small')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const tiers = requested.filter((value): value is ScaleTier =>
    (SCALE_TIER_ORDER as string[]).includes(value)
  );
  if (tiers.length !== requested.length) {
    throw new Error(
      `ALERTZERO_EVAL_SCALES must be a comma-separated subset of ${SCALE_TIER_ORDER.join(
        ','
      )}; got "${raw}"`
    );
  }
  return tiers;
};

/**
 * #19901's seeder is Hannah's bash script (a single-file gist), not a JSON alert corpus, so the eval
 * runs the script itself: `seed <scenario> <rule name>` creates a real rule, 12 closed false-positive
 * alerts and the source events for that scenario. The raw URL is pinned to a revision and verified
 * against a digest, so a later edit to the gist can never change what a measured run seeded.
 */
export const BACKTEST_SEED_SCRIPT_URL =
  'https://gist.githubusercontent.com/hannahbrooks/f8c00154b0d454ee8821adc607070574/raw/b6ffd285f0971c269e9f2c8f10d17586fe25166d/seed-tuning-backtests.sh';
export const BACKTEST_SEED_SCRIPT_SHA256 =
  'a965954d1c33c35cc810f70d12eb9eeed325126cd236bcfaedaa9acaa32b4dce';

/** Comma-separated script scenarios the backtest-seeded tuning test seeds; one rule per scenario. */
export const BACKTEST_SCENARIOS_ENV = 'ALERTZERO_EVAL_BACKTEST_SCENARIOS';
export const BACKTEST_SCENARIOS = [
  'exception',
  'risk_score',
  'threshold',
  'threshold_query',
  'schedule',
  'data_view',
  'timestamp_override',
  'alert_suppression',
  'eql',
  'esql',
  'new_terms',
  'threat_match',
] as const;
export type BacktestScenario = (typeof BACKTEST_SCENARIOS)[number];
export const DEFAULT_BACKTEST_SCENARIOS: BacktestScenario[] = [
  'exception',
  'risk_score',
  'threshold',
  'schedule',
];

export const parseBacktestScenarios = (raw: string | undefined): BacktestScenario[] => {
  const requested = (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (requested.length === 0) {
    return DEFAULT_BACKTEST_SCENARIOS;
  }
  const valid = requested.filter((value): value is BacktestScenario =>
    (BACKTEST_SCENARIOS as readonly string[]).includes(value)
  );
  if (valid.length !== requested.length || valid.length > MAX_RULES_PER_SWEEP) {
    throw new Error(
      `${BACKTEST_SCENARIOS_ENV} must be at most ${MAX_RULES_PER_SWEEP} of ${BACKTEST_SCENARIOS.join(
        ','
      )}; got "${raw}"`
    );
  }
  return valid;
};

/**
 * Sweeps run real models over every seeded row, so the budget is per sweep rather than per test.
 * A timeout is a failure, never a skip: the point of the eval is the timing of a completed sweep.
 *
 * Defaults fit TWO sweep tests (tuning + coverage) plus seeding inside the cell lane's 2700s test
 * budget. The first live run died on Playwright's 60s default test cap, so the spec also raises its
 * own timeout from these values — keep them in step if you raise them.
 */
export const SWEEP_TIMEOUT_MS = Number(process.env.ALERTZERO_EVAL_SWEEP_TIMEOUT_MS ?? 12 * 60_000);
export const REVIEW_TIMEOUT_MS = Number(process.env.ALERTZERO_EVAL_REVIEW_TIMEOUT_MS ?? 8 * 60_000);

/** The tuning sweep's own defaults are 7d / 10 FPs, which a scale-tier seed cannot reach cheaply. */
export const TUNING_INPUTS = {
  analysis_window_days: 1,
  min_fp_count: 2,
  min_fp_rate_pct: 0,
} as const;

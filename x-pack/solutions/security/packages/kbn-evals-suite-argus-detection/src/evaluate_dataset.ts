/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DefaultEvaluators,
  EvalsExecutorClient,
  Evaluator,
  EvaluationDataset,
  EvaluationResult,
  Example,
} from '@kbn/evals';
import type { ToolingLog } from '@kbn/tooling-log';
import type { ReplayClient } from './replay_rule';

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export interface DetectionRuleExampleInput {
  rule_id: string;
  rule_version: string;
  corpus_id: string;
  primitive_id: string;
  variant_index: number;
}

export interface DetectionRuleExpected {
  should_fire: boolean;
  expected_rule_ids: string[];
  mutation_axes: string[];
}

export interface DetectionRuleExampleMetadataShape {
  primitive_id: string;
  variant_index: number;
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

// ---------------------------------------------------------------------------
// Evaluators
// ---------------------------------------------------------------------------

type DetectionRuleEvaluator = Evaluator<DetectionRuleExample, DetectionRuleTaskOutput>;

function notImplementedEvaluator(name: string): DetectionRuleEvaluator {
  return {
    name,
    kind: 'CODE',
    async evaluate(): Promise<EvaluationResult> {
      throw new Error(`NotImplemented: ${name} — M2.1 day-1 skeleton`);
    },
  };
}

export const precisionEvaluator: DetectionRuleEvaluator = notImplementedEvaluator('Precision');
export const recallEvaluator: DetectionRuleEvaluator = notImplementedEvaluator('Recall');
export const fpRateBaselineEvaluator: DetectionRuleEvaluator =
  notImplementedEvaluator('FP Rate (baseline)');
export const variantCoverageEvaluator: DetectionRuleEvaluator =
  notImplementedEvaluator('Variant Coverage');

export const detectionRuleEvaluators: DetectionRuleEvaluator[] = [
  precisionEvaluator,
  recallEvaluator,
  fpRateBaselineEvaluator,
  variantCoverageEvaluator,
];

// ---------------------------------------------------------------------------
// Dataset task + runner
// ---------------------------------------------------------------------------

export interface CreateEvaluateDetectionRulesDeps {
  executorClient: EvalsExecutorClient;
  evaluators: DefaultEvaluators;
  replayClient: ReplayClient;
  log: ToolingLog;
}

export interface EvaluateDetectionRulesArgs {
  dataset: DetectionRuleDataset;
}

/**
 * Day-1 skeleton of the Argus Detection Eval Vertical runner.
 *
 * The real implementation will:
 *   1. Materialise the labelled Mythos-era corpus examples (one per primitive × variant).
 *   2. Build a `task(example)` that replays the event through `replayClient` to get
 *      a `DetectionRuleTaskOutput` (observed fires + rule IDs).
 *   3. Run `executorClient.runExperiment({ dataset, task }, [precision, recall,
 *      fpRateBaseline, variantCoverage])` so each evaluator scores its dimension.
 *   4. In an `onEvaluationComplete` side-channel, aggregate per-(rule_id, run_id)
 *      tuples and persist one row to `.soc-detection-eval-runs` so
 *      `soc-detection-eval.yaml` (acting as a poller) can propagate to the
 *      regression gate. The gate_decision (`pass | fail | marginal`) is computed
 *      here from the aggregated scores — it is deliberately not an evaluator.
 *
 * Day-1 intentionally throws so the wiring is proven to be real but the logic
 * is clearly absent; M2.1 phase 2 of the milestone issue fills this body in.
 */
export function createEvaluateDetectionRules({
  executorClient: _executorClient,
  evaluators: _evaluators,
  replayClient: _replayClient,
  log,
}: CreateEvaluateDetectionRulesDeps) {
  return async ({ dataset }: EvaluateDetectionRulesArgs): Promise<void> => {
    log.info(
      `Argus detection eval — dataset "${dataset.name}" (${dataset.examples.length} example(s)) — skeleton`
    );
    throw new Error(
      'NotImplemented: createEvaluateDetectionRules — M2.1 day-1 skeleton. ' +
        'See x-pack/solutions/security/packages/kbn-evals-suite-argus-detection/README.md.'
    );
  };
}

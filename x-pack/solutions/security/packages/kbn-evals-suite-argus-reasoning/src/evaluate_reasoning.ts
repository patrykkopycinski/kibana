/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { loadReasoningTraces } from './load_trace';
import {
  DEFAULT_REASONING_THRESHOLDS,
  computeReasoningAggregate,
  computeReasoningGate,
  type ReasoningGateDecision,
  type ReasoningSpanAggregate,
  type ReasoningThresholds,
} from './evaluators';
import { createHeuristicJudge, scoreAllSpans, type ReasoningJudge } from './judge';

export interface EvaluateReasoningDeps {
  esClient: Client;
  judge?: ReasoningJudge;
  log?: ToolingLog;
}

export interface EvaluateReasoningOptions {
  /** Optional run_id. Defaults to "sample the most recent spans". */
  runId?: string;
  /** Defaults to `.soc-reasoning-trace`. */
  traceIndex?: string;
  /** Defaults to `.soc-argus-eval-runs`. */
  runsIndex?: string;
  /** Elasticsearch time floor (default `now-24h`). */
  since?: string;
  /** Thresholds override (defaults to `DEFAULT_REASONING_THRESHOLDS`). */
  thresholds?: ReasoningThresholds;
  /** Identifier written into the eval-runs row. */
  suiteId?: string;
  /** Deterministic run_id override (e.g. for tests). */
  overrideRunId?: string;
}

export interface ReasoningEvalRow {
  run_kind: 'reasoning';
  suite_kind: 'reasoning';
  run_id: string;
  suite_id: string;
  trace_run_id?: string;
  traces_index: string;
  aggregate: ReasoningSpanAggregate;
  gate_decision: ReasoningGateDecision;
  thresholds: ReasoningThresholds;
  spans_evaluated: number;
  '@timestamp': string;
}

const DEFAULT_TRACE_INDEX = '.soc-reasoning-trace';
const DEFAULT_RUNS_INDEX = '.soc-argus-eval-runs';

export const evaluateReasoning = async (
  deps: EvaluateReasoningDeps,
  options: EvaluateReasoningOptions = {}
): Promise<ReasoningEvalRow> => {
  const {
    runId,
    traceIndex = DEFAULT_TRACE_INDEX,
    runsIndex = DEFAULT_RUNS_INDEX,
    since = 'now-24h',
    thresholds = DEFAULT_REASONING_THRESHOLDS,
    suiteId = 'argus-reasoning-vertical',
    overrideRunId,
  } = options;

  const judge = deps.judge ?? createHeuristicJudge();

  const spans = await loadReasoningTraces({
    esClient: deps.esClient,
    index: traceIndex,
    since,
    runId,
  });

  const scores = await scoreAllSpans(judge, spans);
  const aggregate = computeReasoningAggregate(scores);
  const gateDecision = computeReasoningGate(aggregate, thresholds);

  const evalRunId =
    overrideRunId ?? `argus-reasoning-${new Date().toISOString().replace(/[:.]/g, '-')}`;

  const row: ReasoningEvalRow = {
    run_kind: 'reasoning',
    suite_kind: 'reasoning',
    run_id: evalRunId,
    suite_id: suiteId,
    trace_run_id: runId,
    traces_index: traceIndex,
    aggregate,
    gate_decision: gateDecision,
    thresholds,
    spans_evaluated: aggregate.spans_evaluated,
    '@timestamp': new Date().toISOString(),
  };

  await deps.esClient.index({
    index: runsIndex,
    document: row,
    refresh: 'wait_for',
  });

  deps.log?.info?.(
    `[argus-reasoning-eval] run=${evalRunId} spans=${aggregate.spans_evaluated} gate=${gateDecision}`
  );

  return row;
};

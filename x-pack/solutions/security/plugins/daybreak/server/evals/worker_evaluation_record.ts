/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DaybreakGoldenExample, ExpectedProposalShape } from "./golden_dataset";
import type {
  DaybreakEvalReport,
  EvalReportExampleResult,
  EvalReportProvenance,
} from "./generate_eval_report";

/**
 * Human reviewer decision captured as an evaluation label (project-daybreak
 * `docs/daybreak-worker-testing-pyramid.md` / evaluation-plan trust metrics).
 */
export type HumanDecision =
  | "approve"
  | "modify"
  | "dismiss"
  | "escalate"
  | "defer"
  | "pending";

/** Cost attribution basis for an eval run. */
export type CostBasis = "priced" | "unknown" | "self-hosted";

/**
 * Model / connector provenance for a single worker evaluation run.
 * Mirrors the WorkerEvaluationRecord `provenance` block in project-daybreak.
 */
export interface WorkerEvaluationProvenance {
  modelId?: string;
  connectorId?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  costBasis: CostBasis;
}

/**
 * Shared run-record primitive for worker evals (L4 round-trip target).
 * Structural mirror of project-daybreak `WorkerEvaluationRecord` — capability-scoped,
 * dataset-grounded, with human-decision labels and model provenance.
 */
export interface WorkerEvaluationRecord<TActual = ExpectedProposalShape, TExpected = ExpectedProposalShape> {
  capability: string;
  runId: string;
  dataset: string;
  environment: string;
  actual: TActual;
  expected: TExpected;
  humanDecision?: HumanDecision;
  score: number;
  provenance: WorkerEvaluationProvenance;
}

/** Serialize a record to deterministic JSON (stable for round-trip tests). */
export const serializeWorkerEvaluationRecord = (
  record: WorkerEvaluationRecord,
): string => JSON.stringify(record);

/** Deserialize a record from JSON. */
export const deserializeWorkerEvaluationRecord = (
  json: string,
): WorkerEvaluationRecord => JSON.parse(json) as WorkerEvaluationRecord;

const provenanceFromEvalReport = (
  provenance: EvalReportProvenance,
): WorkerEvaluationProvenance => ({
  modelId: provenance.modelId,
  connectorId: provenance.connectorId,
  inputTokens: provenance.inputTokens,
  outputTokens: provenance.outputTokens,
  latencyMs: provenance.latencyMs,
  costBasis: provenance.costBasis,
});

/**
 * Build a {@link WorkerEvaluationRecord} from a golden example row and the
 * matching per-example eval report result (L4 offline gate path).
 */
export const buildWorkerEvaluationRecord = (params: {
  example: DaybreakGoldenExample;
  exampleResult: EvalReportExampleResult;
  report: DaybreakEvalReport;
  environment?: string;
  humanDecision?: HumanDecision;
}): WorkerEvaluationRecord => {
  const { example, exampleResult, report, environment = "offline-gate", humanDecision } = params;

  return {
    capability: example.output.capability,
    runId: exampleResult.exampleId,
    dataset: report.datasetName,
    environment,
    actual: exampleResult.actual,
    expected: exampleResult.expected,
    humanDecision: humanDecision ?? "pending",
    score: exampleResult.score,
    provenance: provenanceFromEvalReport(report.provenance),
  };
};

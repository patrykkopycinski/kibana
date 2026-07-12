/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { NOMINAL_EXAMPLE_IDS, daybreakGoldenDataset } from "./golden_dataset";
import {
  EVAL_REPORT_SCHEMA_VERSION,
  OFFLINE_GATE_DEFAULT_PROVENANCE,
  generateEvalReport,
} from "./generate_eval_report";
import {
  buildWorkerEvaluationRecord,
  deserializeWorkerEvaluationRecord,
  serializeWorkerEvaluationRecord,
} from "./worker_evaluation_record";

describe("L4 WorkerEvaluationRecord round-trip", () => {
  const fixedNow = new Date("2026-07-12T12:00:00.000Z");

  it("builds a WorkerEvaluationRecord from a golden example and eval report", () => {
    const report = generateEvalReport({ now: fixedNow });
    const exampleId = NOMINAL_EXAMPLE_IDS[0];
    const example = daybreakGoldenDataset.examples.find((e) => e.id === exampleId);
    const exampleResult = report.examples.find((e) => e.exampleId === exampleId);

    expect(example).toBeDefined();
    expect(exampleResult).toBeDefined();

    const record = buildWorkerEvaluationRecord({
      example: example!,
      exampleResult: exampleResult!,
      report,
    });

    expect(record.capability).toBe(example!.output.capability);
    expect(record.runId).toBe(exampleId);
    expect(record.dataset).toBe(report.datasetName);
    expect(record.environment).toBe("offline-gate");
    expect(record.actual).toEqual(exampleResult!.actual);
    expect(record.expected).toEqual(exampleResult!.expected);
    expect(record.score).toBe(exampleResult!.score);
    expect(record.humanDecision).toBe("pending");
    expect(record.provenance).toEqual(OFFLINE_GATE_DEFAULT_PROVENANCE);
  });

  it("serializes and deserializes a WorkerEvaluationRecord without loss", () => {
    const report = generateEvalReport({ now: fixedNow });
    const example = daybreakGoldenDataset.examples[0];
    const exampleResult = report.examples[0];

    const record = buildWorkerEvaluationRecord({
      example,
      exampleResult,
      report,
      humanDecision: "approve",
    });

    const roundTripped = deserializeWorkerEvaluationRecord(
      serializeWorkerEvaluationRecord(record),
    );

    expect(roundTripped).toEqual(record);
  });

  it("eval report schema v2 includes provenance defaults", () => {
    const report = generateEvalReport({ now: fixedNow });

    expect(report.schemaVersion).toBe(EVAL_REPORT_SCHEMA_VERSION);
    expect(report.schemaVersion).toBe(2);
    expect(report.provenance).toEqual(OFFLINE_GATE_DEFAULT_PROVENANCE);
  });
});

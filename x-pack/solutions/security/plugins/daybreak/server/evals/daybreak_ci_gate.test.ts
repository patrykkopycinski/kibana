/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BROKEN_EXAMPLE_IDS, NOMINAL_EXAMPLE_IDS } from "./golden_dataset";
import { EVAL_REPORT_SCHEMA_VERSION, generateEvalReport } from "./generate_eval_report";

/**
 * Jest parity with scripts/daybreak_eval_gate.mjs (Gap #8).
 * Fails CI when the offline golden gate regresses.
 */
describe("daybreak CI gate parity (Gap #8)", () => {
  it("generateEvalReport passes the offline golden gate", () => {
    const report = generateEvalReport({ now: new Date("2026-07-13T12:00:00.000Z") });

    expect(report.schemaVersion).toBe(EVAL_REPORT_SCHEMA_VERSION);
    expect(report.summary.gatePassed).toBe(true);
    expect(report.summary.nominalPassed).toBe(NOMINAL_EXAMPLE_IDS.length);
    expect(report.summary.brokenFailed).toBe(BROKEN_EXAMPLE_IDS.length);
    expect(report.provenance.costBasis).toBe("self-hosted");
  });
});

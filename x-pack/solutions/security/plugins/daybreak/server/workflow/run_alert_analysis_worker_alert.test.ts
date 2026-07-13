/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildSyntheticAlertEvent,
  getAlertAnalysisWorkerAlertWorkflow,
} from "./run_alert_analysis_worker_alert";

describe("run_alert_analysis_worker_alert", () => {
  it("parses alert-trigger workflow with type: alert", () => {
    const workflow = getAlertAnalysisWorkerAlertWorkflow();
    expect(workflow.triggers?.[0]?.type).toBe("alert");
    expect(workflow.steps.map((s) => s.name)).toEqual(["setup", "enrich", "reason", "act"]);
  });

  it("builds synthetic alert event for manual smoke", () => {
    const event = buildSyntheticAlertEvent("alert-qualys-scan-app01");
    expect(event.alerts[0]._id).toBe("alert-qualys-scan-app01");
    expect(event.rule.consumer).toBe("securitySolution");
  });
});

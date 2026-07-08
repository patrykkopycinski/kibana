/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { WorkflowSchema, type WorkflowYaml } from '@kbn/workflows';
import YAML from 'yaml';

/**
 * Minimal experimental workflow definition exercising three step types to
 * validate the Kibana Workflow Engine can express the alert-analysis worker
 * shape (PD-1; FR-001):
 *
 * 1. HTTP-fetch step    — type: kibana.request  (FR-002)
 * 2. Conditional guard  — type: if + condition:  (FR-003)
 * 3. Stub AI invocation — type: inference        (FR-004)
 *
 * Uses shipped YAML syntax (FR-005), not the README illustrative form.
 * Gated behind the daybreak experimental flag, default off (FR-007).
 */
export const ALERT_ANALYSIS_WORKFLOW_YAML = `
version: '1'
name: Daybreak Alert Analysis Spike
description: >-
  Minimal workflow exercising HTTP fetch, conditional guard, and AI inference
  step types to validate the Kibana Workflow Engine can express the
  alert-analysis worker shape (PD-1).
enabled: false
triggers:
  - type: manual
steps:
  # Step 1 — HTTP fetch (FR-002): kibana.request step type.
  - name: fetch_alert_summary
    type: kibana.request
    with:
      method: GET
      path: /internal/detection_engine/signals/_alerts_summary
      headers:
        x-elastic-internal-origin: kibana

  # Step 2 — Conditional guard (FR-003): if step with condition expression.
  - name: guard_has_alerts
    type: if
    condition: 'steps.fetch_alert_summary.output.total:*'
    steps:
      # Step 3 — Stub AI invocation (FR-004): connector step with connector-id.
      - name: analyze_alert
        type: inference
        connector-id: inference_connector
        with:
          text: 'Analyze alert summary for triage insights.'
`;

/**
 * Parse and validate the alert-analysis workflow YAML against the engine's
 * schema, returning a strongly-typed workflow definition (FR-005).
 *
 * The returned object conforms to the shipped WorkflowYaml schema, proving
 * the engine can express the HTTP → guard → AI step shape.
 */
export const getAlertAnalysisWorkflow = (): WorkflowYaml => {
  const parsed = YAML.parse(ALERT_ANALYSIS_WORKFLOW_YAML);
  return WorkflowSchema.parse(parsed);
};

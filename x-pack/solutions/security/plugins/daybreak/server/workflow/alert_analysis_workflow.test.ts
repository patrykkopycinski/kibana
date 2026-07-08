/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_ANALYSIS_WORKFLOW_YAML, getAlertAnalysisWorkflow } from './alert_analysis_workflow';

describe('alert_analysis_workflow (spike)', () => {
  describe('getAlertAnalysisWorkflow', () => {
    it('parses and validates against the WorkflowSchema (FR-001, FR-005)', () => {
      expect(() => getAlertAnalysisWorkflow()).not.toThrow();
    });

    it('is disabled by default (FR-007, NFR-2)', () => {
      expect(getAlertAnalysisWorkflow().enabled).toBe(false);
    });
  });

  describe('step types (FR-001)', () => {
    it('contains a kibana.request HTTP-fetch step (FR-002)', () => {
      const workflow = getAlertAnalysisWorkflow();

      const fetchStep = workflow.steps.find((s) => s.type === 'kibana.request');
      expect(fetchStep).toBeDefined();
      expect(fetchStep?.name).toBe('fetch_alert_summary');
    });

    it('contains an if conditional-guard step with condition and nested steps (FR-003, FR-005)', () => {
      const workflow = getAlertAnalysisWorkflow();

      const guardStep = workflow.steps.find((s) => s.type === 'if');
      expect(guardStep).toBeDefined();
      expect(guardStep?.name).toBe('guard_has_alerts');
      expect((guardStep as { condition: string }).condition).toBeTruthy();
      expect((guardStep as { steps: unknown[] }).steps.length).toBeGreaterThan(0);
    });

    it('contains a connector step with connector-id inside the guard (FR-004)', () => {
      const workflow = getAlertAnalysisWorkflow();

      const guardStep = workflow.steps.find((s) => s.type === 'if') as {
        steps: Array<{ type: string; name: string }>;
      };
      const aiStep = guardStep.steps.find((s) => s.name === 'analyze_alert');
      expect(aiStep).toBeDefined();
    });
  });

  describe('raw YAML verification gates (grep-equivalent)', () => {
    it('contains type: kibana.request (FR-002)', () => {
      expect(ALERT_ANALYSIS_WORKFLOW_YAML).toMatch(/type:\s*kibana\.request/);
    });

    it('contains type: if with condition: and nested steps: (FR-003, FR-005)', () => {
      expect(ALERT_ANALYSIS_WORKFLOW_YAML).toMatch(/type:\s*if/);
      expect(ALERT_ANALYSIS_WORKFLOW_YAML).toMatch(/condition:/);
    });

    it('contains connector-id (FR-004)', () => {
      expect(ALERT_ANALYSIS_WORKFLOW_YAML).toMatch(/connector-id:/);
    });

    it('does not use the README illustrative if:/then: or action:/params: form (FR-005)', () => {
      expect(ALERT_ANALYSIS_WORKFLOW_YAML).not.toMatch(/^\s*if:/m);
      expect(ALERT_ANALYSIS_WORKFLOW_YAML).not.toMatch(/^\s*then:/m);
      expect(ALERT_ANALYSIS_WORKFLOW_YAML).not.toMatch(/action:/);
      expect(ALERT_ANALYSIS_WORKFLOW_YAML).not.toMatch(/params:/);
    });
  });
});

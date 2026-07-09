/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';

import { ALERT_ANALYSIS_WORKFLOW_YAML, getAlertAnalysisWorkflow } from './alert_analysis_workflow';
import { collectStepLogs, runSpikeWorkflow } from './run_spike_workflow';

const createMockLogger = (): jest.Mocked<Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>> => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

const createMockRequest = (): KibanaRequest => ({} as unknown as KibanaRequest);

describe('run_spike_workflow (FR-008, FR-009, FR-010)', () => {
  describe('collectStepLogs', () => {
    it('flattens top-level and nested steps for logging (FR-009)', () => {
      const workflow = getAlertAnalysisWorkflow();
      const logs = collectStepLogs(workflow.steps);

      expect(logs.map((l) => l.name)).toEqual([
        'fetch_alert_summary',
        'guard_has_alerts',
        'analyze_alert',
      ]);
    });

    it('records the correct type for each step (FR-001)', () => {
      const workflow = getAlertAnalysisWorkflow();
      const logs = collectStepLogs(workflow.steps);

      expect(logs).toContainEqual(
        expect.objectContaining({ name: 'fetch_alert_summary', type: 'kibana.request' })
      );
      expect(logs).toContainEqual(
        expect.objectContaining({ name: 'guard_has_alerts', type: 'if' })
      );
    });

    it('captures the condition for the if guard step (FR-003, FR-009)', () => {
      const workflow = getAlertAnalysisWorkflow();
      const logs = collectStepLogs(workflow.steps);

      const guardLog = logs.find((l) => l.name === 'guard_has_alerts');
      expect(guardLog?.input).toBe('steps.fetch_alert_summary.output.total:*');
    });
  });

  describe('runSpikeWorkflow', () => {
    it('delegates to the provided executeWorkflow entry point (FR-010)', async () => {
      const executeWorkflow = jest.fn().mockResolvedValue({ workflowExecutionId: 'exec-fr010' });
      const logger = createMockLogger();

      await runSpikeWorkflow({
        executeWorkflow: executeWorkflow as never,
        logger: logger as unknown as Logger,
        request: createMockRequest(),
      });

      expect(executeWorkflow).toHaveBeenCalledTimes(1);

      const [model, context, request] = executeWorkflow.mock.calls[0];
      expect(model.id).toBe('daybreak-alert-analysis-spike');
      expect(model.name).toBe('Daybreak Alert Analysis Spike');
      expect(model.enabled).toBe(false);
      expect(model.yaml).toBe(ALERT_ANALYSIS_WORKFLOW_YAML);
      expect(model.definition).toEqual(getAlertAnalysisWorkflow());
      expect(context).toEqual({});
      expect(request).toBeDefined();
    });

    it('logs each step input before execution (FR-009)', async () => {
      const executeWorkflow = jest.fn().mockResolvedValue({ workflowExecutionId: 'exec-logging' });
      const logger = createMockLogger();

      await runSpikeWorkflow({
        executeWorkflow: executeWorkflow as never,
        logger: logger as unknown as Logger,
        request: createMockRequest(),
      });

      const stepInputLogs = logger.info.mock.calls
        .map((c) => c[0] as string)
        .filter((msg) => msg.includes('step input'));

      expect(stepInputLogs).toHaveLength(3);
      expect(stepInputLogs[0]).toContain('fetch_alert_summary');
      expect(stepInputLogs[1]).toContain('guard_has_alerts');
      expect(stepInputLogs[2]).toContain('analyze_alert');
    });

    it('logs the execution result after completion (FR-009)', async () => {
      const executeWorkflow = jest
        .fn()
        .mockResolvedValue({ workflowExecutionId: 'exec-result-99' });
      const logger = createMockLogger();

      await runSpikeWorkflow({
        executeWorkflow: executeWorkflow as never,
        logger: logger as unknown as Logger,
        request: createMockRequest(),
      });

      const resultLog = logger.info.mock.calls
        .map((c) => c[0] as string)
        .find((msg) => msg.includes('workflow executed'));

      expect(resultLog).toContain('exec-result-99');
    });

    it('returns the execution response from executeWorkflow (FR-008)', async () => {
      const executeWorkflow = jest.fn().mockResolvedValue({ workflowExecutionId: 'exec-return-1' });

      const result = await runSpikeWorkflow({
        executeWorkflow: executeWorkflow as never,
        logger: createMockLogger() as unknown as Logger,
        request: createMockRequest(),
      });

      expect(result).toEqual({ workflowExecutionId: 'exec-return-1' });
    });

    it('logs step inputs before executeWorkflow is called (ordering, FR-009)', async () => {
      const callOrder: string[] = [];
      const executeWorkflow = jest.fn().mockImplementation(() => {
        callOrder.push('executeWorkflow');
        return Promise.resolve({ workflowExecutionId: 'exec-order' });
      });
      const logger = createMockLogger();
      const originalInfo = logger.info;
      logger.info = jest.fn((msg: string) => {
        if (typeof msg === 'string' && msg.includes('step input')) {
          callOrder.push('stepInput');
        }
        return originalInfo(msg);
      }) as never;

      await runSpikeWorkflow({
        executeWorkflow: executeWorkflow as never,
        logger: logger as unknown as Logger,
        request: createMockRequest(),
      });

      const lastStepInputIndex = callOrder.map((c) => c === 'stepInput').lastIndexOf(true);
      const executeIndex = callOrder.indexOf('executeWorkflow');
      expect(lastStepInputIndex).toBeLessThan(executeIndex);
    });
  });
});

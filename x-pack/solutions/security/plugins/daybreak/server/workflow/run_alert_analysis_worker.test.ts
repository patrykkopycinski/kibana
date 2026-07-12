/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse } from 'yaml';
import type { KibanaRequest, Logger } from '@kbn/core/server';

import ALERT_ANALYSIS_WORKER_YAML from './alert_analysis_worker.yaml';
import {
  getAlertAnalysisWorkerWorkflow,
  runAlertAnalysisWorker,
} from './run_alert_analysis_worker';

const createMockLogger = (): jest.Mocked<Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>> => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

const createMockRequest = (): KibanaRequest => ({} as unknown as KibanaRequest);

/**
 * Walks the raw (pre-Zod) worker YAML to the Reason step (nested under two
 * `if` guards — `guard_enabled` → `guard` → children). Returns the step as a
 * Record so the assertions can read the `on-failure.retry` block. Uses the raw
 * YAML because the engine's `WorkflowSchema` parses nested steps via the
 * narrower `BaseStepSchema` (name/type only) at depth > 1, which would strip
 * `on-failure` from the Reason step at parse time. The engine's runtime graph
 * builder ingests the raw YAML directly, so the raw shape is the source of
 * truth for what the engine actually executes.
 */
type RawWorkflowStep = { name: string; type?: string } & Record<string, unknown>;

const getRawReasonStep = (): Record<string, unknown> => {
  const raw = parse(ALERT_ANALYSIS_WORKER_YAML) as { steps: RawWorkflowStep[] };
  const guardEnabled = raw.steps.find((s) => s.name === 'guard_enabled')!;
  const guard = (guardEnabled.steps as RawWorkflowStep[]).find((s) => s.name === 'guard')!;
  return (guard.steps as RawWorkflowStep[]).find((s) => s.name === 'reason')!;
};

describe('run_alert_analysis_worker', () => {
  describe('YAML schema validation', () => {
    it('parses and validates the worker YAML against the WorkflowSchema', () => {
      expect(() => getAlertAnalysisWorkerWorkflow()).not.toThrow();
    });

    it('is disabled by default (FR-007, NFR-2)', () => {
      expect(getAlertAnalysisWorkerWorkflow().enabled).toBe(false);
    });
  });

  describe('Reason-phase retry/backoff wiring (A-4)', () => {
    it('declares the ai.agent step type for the Reason phase (FR-010, FR-011)', () => {
      expect(getRawReasonStep().type).toBe('ai.agent');
    });

    it('wires on-failure.retry on the Reason step via the engine generic step props (A-4)', () => {
      const reason = getRawReasonStep();
      const onFailure = reason['on-failure'] as Record<string, unknown> | undefined;
      expect(onFailure).toBeDefined();
      expect(onFailure?.retry).toBeDefined();
    });

    it('configures exponential backoff with bounded max-attempts and max-delay (A-4)', () => {
      const reason = getRawReasonStep();
      const retry = (reason['on-failure'] as Record<string, unknown>).retry as Record<
        string,
        unknown
      >;

      expect(retry['max-attempts']).toBe(3);
      expect(retry.strategy).toBe('exponential');
      expect(retry.delay).toBe('2s');
      expect(retry.multiplier).toBe(2);
      expect(retry['max-delay']).toBe('30s');
      expect(retry.jitter).toBe(true);
    });

    it('fail-closes on retry exhaustion (continue: false) — no Proposal on model error (A-4)', () => {
      const reason = getRawReasonStep();
      expect((reason['on-failure'] as Record<string, unknown>).continue).toBe(false);
    });
  });

  describe('raw YAML verification gates (grep-equivalent)', () => {
    it('declares on-failure on the reason step (A-4)', () => {
      expect(ALERT_ANALYSIS_WORKER_YAML).toMatch(/on-failure:/);
    });

    it('declares exponential retry strategy (A-4)', () => {
      expect(ALERT_ANALYSIS_WORKER_YAML).toMatch(/strategy:\s*exponential/);
    });

    it('declares jitter: true to avoid thundering herd (A-4)', () => {
      expect(ALERT_ANALYSIS_WORKER_YAML).toMatch(/jitter:\s*true/);
    });

    it('fail-closes via continue: false (A-4)', () => {
      expect(ALERT_ANALYSIS_WORKER_YAML).toMatch(/continue:\s*false/);
    });
  });

  describe('runAlertAnalysisWorker', () => {
    it('delegates to the provided executeWorkflow entry point (FR-017)', async () => {
      const executeWorkflow = jest.fn().mockResolvedValue({ workflowExecutionId: 'worker-exec-1' });
      const logger = createMockLogger();

      await runAlertAnalysisWorker({
        executeWorkflow: executeWorkflow as never,
        logger: logger as unknown as Logger,
        request: createMockRequest(),
      });

      expect(executeWorkflow).toHaveBeenCalledTimes(1);

      const [model, context, request] = executeWorkflow.mock.calls[0];
      expect(model.id).toBe('daybreak-alert-analysis-worker');
      expect(model.name).toBe('Daybreak Alert Analysis Worker');
      expect(model.enabled).toBe(false);
      expect(model.yaml).toBe(ALERT_ANALYSIS_WORKER_YAML);
      expect(model.definition).toEqual(getAlertAnalysisWorkerWorkflow());
      expect(context).toEqual({});
      expect(request).toBeDefined();
    });

    it('enables the worker model when an enabled Daybreak workflow dispatches it', async () => {
      const executeWorkflow = jest
        .fn()
        .mockResolvedValue({ workflowExecutionId: 'worker-exec-enabled' });

      await runAlertAnalysisWorker({
        executeWorkflow: executeWorkflow as never,
        logger: createMockLogger() as unknown as Logger,
        request: createMockRequest(),
        enabled: true,
      });

      expect(executeWorkflow.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          id: 'daybreak-alert-analysis-worker',
          enabled: true,
          definition: expect.objectContaining({ enabled: true }),
          isEphemeral: true,
        })
      );
    });

    it('logs each flattened step input before execution (FR-009)', async () => {
      const executeWorkflow = jest
        .fn()
        .mockResolvedValue({ workflowExecutionId: 'worker-exec-logging' });
      const logger = createMockLogger();

      await runAlertAnalysisWorker({
        executeWorkflow: executeWorkflow as never,
        logger: logger as unknown as Logger,
        request: createMockRequest(),
      });

      const stepInputLogs = logger.info.mock.calls
        .map((c) => c[0] as string)
        .filter((msg) => msg.includes('step input'));

      // collectStepLogs flattens top-level + first-level nested steps. The
      // worker's nested Reason step lives two `if` levels deep, so only the
      // outer guard chain is logged here; the retry config is asserted above.
      expect(stepInputLogs.some((m) => m.includes('setup'))).toBe(true);
      expect(stepInputLogs.some((m) => m.includes('guard_enabled'))).toBe(true);
    });

    it('logs the execution result after completion (FR-009)', async () => {
      const executeWorkflow = jest
        .fn()
        .mockResolvedValue({ workflowExecutionId: 'worker-exec-result' });
      const logger = createMockLogger();

      await runAlertAnalysisWorker({
        executeWorkflow: executeWorkflow as never,
        logger: logger as unknown as Logger,
        request: createMockRequest(),
      });

      const resultLog = logger.info.mock.calls
        .map((c) => c[0] as string)
        .find((msg) => msg.includes('workflow executed'));

      expect(resultLog).toContain('worker-exec-result');
    });

    it('returns the execution response from executeWorkflow (FR-017)', async () => {
      const executeWorkflow = jest
        .fn()
        .mockResolvedValue({ workflowExecutionId: 'worker-exec-return' });

      const result = await runAlertAnalysisWorker({
        executeWorkflow: executeWorkflow as never,
        logger: createMockLogger() as unknown as Logger,
        request: createMockRequest(),
      });

      expect(result).toEqual({ workflowExecutionId: 'worker-exec-return' });
    });

    it('propagates executeWorkflow errors to the caller (fail-loud, not swallowed)', async () => {
      const executeWorkflow = jest.fn().mockRejectedValue(new Error('engine down'));

      await expect(
        runAlertAnalysisWorker({
          executeWorkflow: executeWorkflow as never,
          logger: createMockLogger() as unknown as Logger,
          request: createMockRequest(),
        })
      ).rejects.toThrow('engine down');
    });
  });
});

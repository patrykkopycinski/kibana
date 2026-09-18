/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import { runWatchWorkflow, WatchWorkflowTimeoutError } from './workflow_task';

const log = {
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
} as unknown as ToolingLog;

const fetchReturningStatus = (status: string): HttpHandler =>
  jest.fn(async (path: string) =>
    path.includes('/run') ? { workflowExecutionId: 'exec-1' } : { status }
  ) as unknown as HttpHandler;

describe('runWatchWorkflow', () => {
  it('returns the execution once it reaches a terminal status', async () => {
    const execution = await runWatchWorkflow({
      fetch: fetchReturningStatus('completed'),
      log,
      workflowId: 'system-security-watch-dark',
      inputs: {},
      maxWaitMs: 1_000,
      pollIntervalMs: 1,
    });

    expect(execution).toEqual({ executionId: 'exec-1', status: 'completed', error: undefined });
  });

  it('throws instead of returning a non-terminal status when the wait runs out', async () => {
    // Regression: the timeout only logged a warning and returned the last
    // observed status, so a still-running (or stuck) execution was handed to
    // the caller as if the chain had finished.
    const promise = runWatchWorkflow({
      fetch: fetchReturningStatus('running'),
      log,
      workflowId: 'system-security-watch-dark',
      inputs: {},
      maxWaitMs: 20,
      pollIntervalMs: 1,
    });

    await expect(promise).rejects.toBeInstanceOf(WatchWorkflowTimeoutError);
    await expect(
      runWatchWorkflow({
        fetch: fetchReturningStatus('waiting_for_child'),
        log,
        workflowId: 'system-security-watch-dark',
        inputs: {},
        maxWaitMs: 20,
        pollIntervalMs: 1,
      })
    ).rejects.toThrow(
      /did not reach terminal status within 20ms \(last status: waiting_for_child\)/
    );
  });

  it('names the workflow and execution in the failure', async () => {
    await expect(
      runWatchWorkflow({
        fetch: fetchReturningStatus('queued'),
        log,
        workflowId: 'system-security-watch-deep',
        inputs: {},
        maxWaitMs: 10,
        pollIntervalMs: 1,
      })
    ).rejects.toMatchObject({
      name: 'WatchWorkflowTimeoutError',
      workflowId: 'system-security-watch-deep',
      executionId: 'exec-1',
      status: 'queued',
      maxWaitMs: 10,
    });
  });
});

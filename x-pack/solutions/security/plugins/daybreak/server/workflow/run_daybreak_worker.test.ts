/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';

import { DAYBREAK_INVESTIGATION_WORKER_YAML as INVESTIGATION_WORKER_YAML } from '@kbn/workflows/managed/definitions/daybreak';
import { runDaybreakWorker } from './run_daybreak_worker';

describe('run_daybreak_worker', () => {
  it('dispatches an ephemeral worker model with inputs and completion logging', async () => {
    const executeWorkflow = jest.fn().mockResolvedValue({ workflowExecutionId: 'shared-exec-1' });
    const logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const result = await runDaybreakWorker({
      workerId: 'daybreak-investigation-worker',
      workflowYaml: INVESTIGATION_WORKER_YAML,
      logLabel: 'daybreak investigation worker',
      executeWorkflow: executeWorkflow as never,
      logger: logger as unknown as Logger,
      request: {} as KibanaRequest,
      context: { inputs: { investigationId: 'inv-1' } },
      completionDetail: 'investigationId=inv-1',
    });

    expect(result).toEqual({ workflowExecutionId: 'shared-exec-1' });
    expect(executeWorkflow.mock.calls[0][0]).toEqual(
      expect.objectContaining({ id: 'daybreak-investigation-worker', isEphemeral: true })
    );
    expect(executeWorkflow.mock.calls[0][1]).toEqual({ inputs: { investigationId: 'inv-1' } });
    expect(logger.info.mock.calls.some(([msg]) => String(msg).includes('shared-exec-1'))).toBe(
      true
    );
  });
});

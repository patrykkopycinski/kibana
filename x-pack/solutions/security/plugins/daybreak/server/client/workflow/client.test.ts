/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { createWorkflowClient, type WorkflowClient } from './client';
import { WorkflowNotFoundError } from './errors';

const space = 'default';
const workflow = {
  id: 'workflow-1',
  name: 'Alert analysis',
  trigger: 'alert',
  skillId: 'alert-analysis',
  outcome: 'proposal',
  watchIds: ['watch-1'],
  enabled: true,
  priority: 10,
  auditTrail: [{ action: 'created' as const, timestamp: '2026-07-12T10:00:00.000Z' }],
  createdAt: '2026-07-12T10:00:00.000Z',
  updatedAt: '2026-07-12T10:00:00.000Z',
  space,
};

const mockEsClient = {
  search: jest.fn(),
  index: jest.fn(),
};

jest.mock('./storage', () => ({
  createWorkflowsStorage: jest.fn(() => ({
    getClient: jest.fn(() => mockEsClient),
  })),
}));

describe('WorkflowClient lifecycle', () => {
  let client: WorkflowClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = createWorkflowClient({
      space,
      logger: loggerMock.create(),
      esClient: {} as never,
    });
  });

  it('rejects duplicate active IDs without overwriting the record', async () => {
    mockEsClient.search.mockResolvedValue({ hits: { hits: [{ _id: 'es-1', _source: workflow }] } });

    await expect(client.create(workflow)).rejects.toMatchObject({ name: 'WorkflowConflictError' });
    expect(mockEsClient.index).not.toHaveBeenCalled();
  });

  it('appends an execution audit event when recording a successful execution', async () => {
    mockEsClient.search.mockResolvedValue({ hits: { hits: [{ _id: 'es-1', _source: workflow }] } });

    const result = await client.recordExecution(workflow.id, '2026-07-12T10:05:00.000Z');

    expect(result.lastRunAt).toBe('2026-07-12T10:05:00.000Z');
    expect(result.auditTrail.at(-1)).toEqual({
      action: 'executed',
      timestamp: '2026-07-12T10:05:00.000Z',
    });
    expect(mockEsClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'es-1',
        document: expect.objectContaining({ lastRunAt: '2026-07-12T10:05:00.000Z' }),
      })
    );
  });

  it('soft-deletes and hides the workflow from future reads', async () => {
    mockEsClient.search
      .mockResolvedValueOnce({ hits: { hits: [{ _id: 'es-1', _source: workflow }] } })
      .mockResolvedValueOnce({
        hits: {
          hits: [{ _id: 'es-1', _source: { ...workflow, deletedAt: '2026-07-12T10:05:00.000Z' } }],
        },
      });

    const deleted = await client.delete(workflow.id);

    expect(deleted.deletedAt).toEqual(expect.any(String));
    expect(deleted.auditTrail.at(-1)?.action).toBe('deleted');
    await expect(client.get(workflow.id)).rejects.toThrow(WorkflowNotFoundError);
  });
});

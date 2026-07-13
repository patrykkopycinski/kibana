/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { registerWorkflowRoutes } from './workflows';

const workflow = {
  id: 'workflow-1',
  name: 'Alert analysis',
  trigger: 'alert',
  skillId: 'alert-analysis',
  outcome: 'proposal',
  watchIds: ['watch-1'],
  enabled: true,
  priority: 10,
  createdAt: '2026-07-12T10:00:00.000Z',
  updatedAt: '2026-07-12T10:00:00.000Z',
  space: 'default',
};

const mockClient = {
  get: jest.fn(),
  list: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  recordExecution: jest.fn(),
};

jest.mock('../client/workflow/client', () => ({
  createWorkflowClient: jest.fn(() => mockClient),
}));

jest.mock('./wrap_handler', () => ({
  getHandlerWrapper: () => (handler: unknown) => handler,
}));

type Handler = (ctx: any, request: any, response: any) => Promise<unknown>;

const createResponse = () => ({
  ok: jest.fn((value) => value),
  conflict: jest.fn((value) => value),
  customError: jest.fn((value) => value),
});

const registerRoutes = (executeAlertAnalysisWorker?: jest.Mock) => {
  const handlers = new Map<string, Handler>();
  const router = {
    get: jest.fn((config, handler) => handlers.set(`GET ${config.path}`, handler)),
    post: jest.fn((config, handler) => handlers.set(`POST ${config.path}`, handler)),
    put: jest.fn((config, handler) => handlers.set(`PUT ${config.path}`, handler)),
    delete: jest.fn((config, handler) => handlers.set(`DELETE ${config.path}`, handler)),
  };

  registerWorkflowRoutes({
    router: router as never,
    logger: loggerMock.create(),
    getSpaceId: () => 'default',
    executeAlertAnalysisWorker,
  });

  return handlers;
};

const ctx = { core: Promise.resolve({ elasticsearch: { client: { asInternalUser: {} } } }) };
const request = { params: { id: workflow.id } };

describe('workflow lifecycle routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('soft-deletes through the scoped client and returns its audit record', async () => {
    const handlers = registerRoutes();
    const response = createResponse();
    const deleted = {
      ...workflow,
      deletedAt: '2026-07-12T10:02:00.000Z',
      auditTrail: [{ action: 'deleted', timestamp: '2026-07-12T10:02:00.000Z' }],
    };
    mockClient.delete.mockResolvedValue(deleted);

    await handlers.get('DELETE /api/daybreak/workflows/{id}')!(ctx, request, response);

    expect(mockClient.delete).toHaveBeenCalledWith(workflow.id);
    expect(response.ok).toHaveBeenCalledWith({ body: deleted });
  });

  it('reads the late-bound execution callback when handling the request', async () => {
    const execute = jest.fn().mockResolvedValue('execution-1');
    const handlers = registerRoutes(execute);
    const response = createResponse();
    mockClient.get.mockResolvedValue(workflow);
    mockClient.recordExecution.mockResolvedValue({
      ...workflow,
      lastRunAt: '2026-07-12T10:01:00.000Z',
    });

    await handlers.get('POST /api/daybreak/workflows/{id}/execute')!(ctx, request, response);

    expect(execute).toHaveBeenCalledWith(request, { rowId: undefined, alertId: undefined });
    expect(response.ok).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ workflowExecutionId: 'execution-1' }),
      })
    );
  });

  it('rejects a paused workflow without executing it', async () => {
    const execute = jest.fn();
    const handlers = registerRoutes(execute);
    const response = createResponse();
    mockClient.get.mockResolvedValue({ ...workflow, enabled: false });

    await handlers.get('POST /api/daybreak/workflows/{id}/execute')!(ctx, request, response);

    expect(execute).not.toHaveBeenCalled();
    expect(mockClient.update).not.toHaveBeenCalled();
    expect(response.conflict).toHaveBeenCalledWith({
      body: { message: 'Workflow "workflow-1" is paused.' },
    });
  });

  it('persists lastRunAt only after a successful execution', async () => {
    const execute = jest.fn().mockResolvedValue('execution-2');
    const handlers = registerRoutes(execute);
    const response = createResponse();
    mockClient.get.mockResolvedValue(workflow);
    mockClient.recordExecution.mockResolvedValue({
      ...workflow,
      lastRunAt: '2026-07-12T10:01:00.000Z',
    });

    await handlers.get('POST /api/daybreak/workflows/{id}/execute')!(ctx, request, response);

    expect(mockClient.recordExecution).toHaveBeenCalledWith(
      workflow.id,
      expect.any(String),
      'execution-2'
    );
  });

  it('returns idle execution status when no active execution is set', async () => {
    const handlers = registerRoutes();
    const response = createResponse();
    mockClient.get.mockResolvedValue(workflow);

    await handlers.get('GET /api/daybreak/workflows/{id}/execution')!(ctx, request, response);

    expect(response.ok).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { workflowId: workflow.id, status: 'idle' },
      })
    );
  });
});

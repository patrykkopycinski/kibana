/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import {
  isToolHandlerStandardReturn,
  type ToolHandlerContext,
  type ToolHandlerReturn,
  type ToolHandlerStandardReturn,
} from '@kbn/agent-builder-server/tools';
import { loggerMock } from '@kbn/logging-mocks';

import type { EndpointAppContextService } from '../../../../endpoint/endpoint_app_context_services';
import type { DetonateClient } from '../../../../detonate_prototype/client';
import type { DetonationRecord } from '../../../../../common/detonate_prototype';
import { getTaskInSpace } from '../../../../detonate_prototype/space_scope';
import type { DetonateSkillDeps } from '../types';
import { getDetonationTool } from './get_detonation';

jest.mock('../../../../detonate_prototype/space_scope', () => ({
  getTaskInSpace: jest.fn(),
}));

const mockGetTask = getTaskInSpace as jest.MockedFunction<typeof getTaskInSpace>;

const request = {} as KibanaRequest;

const results = (result: unknown) => {
  if (!isToolHandlerStandardReturn(result as ToolHandlerReturn)) {
    throw new Error('Expected standard tool return');
  }
  return (result as ToolHandlerStandardReturn).results;
};

const task = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'task-1',
    created_at: '2026-01-01T00:00:00.000Z',
    tags: ['space:team-a'],
    last_worker_name: 'detonate.workers.make_summary',
    last_worker_status: 'success',
    production_endpoint_alert_groups: [],
    diagnostic_endpoint_alert_groups: [],
    production_detection_alert_groups: [],
    ...overrides,
  } as never);

/** Lets the background write the tool starts (and does not await) run to its end. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('getDetonationTool', () => {
  let getTaskUpdates: jest.Mock;
  let recordRun: jest.Mock;
  let context: ToolHandlerContext;
  let tool: ReturnType<typeof getDetonationTool>;

  beforeEach(() => {
    jest.clearAllMocks();
    getTaskUpdates = jest
      .fn()
      .mockResolvedValue([{ task: task(), timestamp: '2026-01-01T00:04:00.000Z' }]);
    recordRun = jest.fn().mockResolvedValue(undefined);
    context = { request, logger: loggerMock.create() } as unknown as ToolHandlerContext;
    mockGetTask.mockResolvedValue(task());
    tool = getDetonationTool({
      endpointAppContextService: {
        getActiveSpaceId: () => 'team-a',
      } as unknown as EndpointAppContextService,
      getClient: () => ({ getTaskUpdates } as unknown as DetonateClient),
      hasDetonatePrivilege: jest.fn().mockResolvedValue(true),
      recordRun,
    } as unknown as DetonateSkillDeps);
  });

  const builtRecord = (): DetonationRecord => {
    const [spaceId, buildRecord] = recordRun.mock.calls[0];
    expect(spaceId).toBe('team-a');
    return buildRecord();
  };

  it('writes a completed task to the results store with its duration', async () => {
    const [result] = results(await tool.handler({ taskId: 'task-1' }, context));
    await flush();

    expect(result).toEqual(
      expect.objectContaining({ data: expect.objectContaining({ found: true }) })
    );
    expect(getTaskUpdates).toHaveBeenCalledWith('task-1');
    expect(recordRun).toHaveBeenCalledTimes(1);
    expect(builtRecord()).toEqual(
      expect.objectContaining({
        'detonate.task_id': 'task-1',
        'detonate.state': 'complete',
        'event.duration': 4 * 60 * 1000 * 1_000_000,
      })
    );
  });

  it('writes a running task without reading its updates', async () => {
    mockGetTask.mockResolvedValue(
      task({ last_worker_name: 'detonate.workers.stop_vm', last_worker_status: 'started' })
    );

    await tool.handler({ taskId: 'task-1' }, context);
    await flush();

    expect(getTaskUpdates).not.toHaveBeenCalled();
    expect(recordRun).toHaveBeenCalledTimes(1);
    expect(builtRecord()).toEqual(expect.objectContaining({ 'detonate.state': 'running' }));
    expect(builtRecord()).not.toHaveProperty(['event.duration']);
  });

  it('still answers when the write fails', async () => {
    recordRun.mockRejectedValue(new Error('results index down'));

    const [result] = results(await tool.handler({ taskId: 'task-1' }, context));
    await flush();

    expect(result).toEqual(
      expect.objectContaining({ data: expect.objectContaining({ found: true }) })
    );
  });

  it('answers without waiting for the write', async () => {
    recordRun.mockReturnValue(new Promise(() => {}));

    const [result] = results(await tool.handler({ taskId: 'task-1' }, context));

    expect(result).toEqual(
      expect.objectContaining({ data: expect.objectContaining({ found: true }) })
    );
  });
});

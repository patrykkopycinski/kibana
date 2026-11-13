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
import { ToolResultType } from '@kbn/agent-builder-common';
import { loggerMock } from '@kbn/logging-mocks';

import type { EndpointAppContextService } from '../../../../endpoint/endpoint_app_context_services';
import type { DetonateClient } from '../../../../detonate_prototype/client';
import { submitInSpace } from '../../../../detonate_prototype/space_scope';
import type { DetonateSkillDeps } from '../types';
import { submitDetonationTool } from './submit_detonation';

jest.mock('../../../../detonate_prototype/space_scope', () => ({
  submitInSpace: jest.fn(),
}));

const mockSubmit = submitInSpace as jest.MockedFunction<typeof submitInSpace>;

const SHA256 = 'a'.repeat(64);
const request = {} as KibanaRequest;

const results = (result: unknown) => {
  if (!isToolHandlerStandardReturn(result as ToolHandlerReturn)) {
    throw new Error('Expected standard tool return');
  }
  return (result as ToolHandlerStandardReturn).results;
};

describe('submitDetonationTool', () => {
  const client = {} as DetonateClient;
  let hasDetonatePrivilege: jest.Mock;
  let recordRun: jest.Mock;
  let callerSearch: jest.Mock;
  let context: ToolHandlerContext;
  let tool: ReturnType<typeof submitDetonationTool>;

  const callerCanRead = (ids: string[]) =>
    callerSearch.mockResolvedValue({ hits: { hits: ids.map((_id) => ({ _id })) } });

  beforeEach(() => {
    jest.clearAllMocks();
    hasDetonatePrivilege = jest.fn().mockResolvedValue(true);
    recordRun = jest.fn().mockResolvedValue(undefined);
    callerSearch = jest.fn().mockResolvedValue({ hits: { hits: [] } });
    context = {
      request,
      logger: loggerMock.create(),
      esClient: { asCurrentUser: { search: callerSearch } },
      runContext: {
        runId: 'run-1',
        stack: [
          { type: 'agent', agentId: 'elastic-ai-agent', conversationId: 'conv-1' },
          { type: 'tool', toolId: 'submit_detonation' },
        ],
      },
    } as unknown as ToolHandlerContext;
    mockSubmit.mockResolvedValue({
      id: 'task-1',
      created_at: '2026-01-01T00:00:00.000Z',
      tags: ['space:team-a', 'alert:alert-1'],
      last_worker_name: 'detonate.workers.submit',
      last_worker_status: 'pending',
      production_endpoint_alert_groups: [],
      diagnostic_endpoint_alert_groups: [],
      production_detection_alert_groups: [],
    } as never);
    tool = submitDetonationTool({
      endpointAppContextService: {
        getActiveSpaceId: () => 'team-a',
        getCurrentUsername: () => 'analyst',
      } as unknown as EndpointAppContextService,
      getClient: () => client,
      hasDetonatePrivilege,
      recordRun,
    } as DetonateSkillDeps);
  });

  it('submits when every alert tag names an alert the caller can read in this space', async () => {
    callerCanRead(['alert-1']);

    const [result] = results(
      await tool.handler({ sampleHash: SHA256, tags: ['alert:alert-1'] }, context)
    );

    expect(callerSearch).toHaveBeenCalledWith(
      expect.objectContaining({ index: '.alerts-security.alerts-team-a' })
    );
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.any(Function),
      { sample_hash: SHA256, tags: ['alert:alert-1'] },
      'team-a'
    );
    expect(result.data).toMatchObject({ task_id: 'task-1', submitted: true });
    expect(result.type).toBe(ToolResultType.other);
  });

  it('records the run with the agent origin, the conversation and the authenticated user', async () => {
    callerCanRead(['alert-1']);

    await tool.handler({ sampleHash: SHA256, tags: ['alert:alert-1'] }, context);

    expect(recordRun).toHaveBeenCalledTimes(1);
    expect(recordRun).toHaveBeenCalledWith('team-a', expect.any(Function));
    expect(recordRun.mock.calls[0][1]()).toEqual(
      expect.objectContaining({
        'detonate.task_id': 'task-1',
        'detonate.space_id': 'team-a',
        'detonate.source': 'agent',
        'detonate.conversation_id': 'conv-1',
        'detonate.submitter': 'analyst',
        'detonate.origin.alert_ids': ['alert-1'],
      })
    );
  });

  it('returns the result without waiting for a record write that never completes', async () => {
    callerCanRead(['alert-1']);
    recordRun.mockReturnValue(new Promise(() => {}));

    const [result] = results(
      await tool.handler({ sampleHash: SHA256, tags: ['alert:alert-1'] }, context)
    );

    expect(recordRun).toHaveBeenCalledTimes(1);
    expect(result.data).toMatchObject({ task_id: 'task-1', submitted: true });
  });

  it('writes nothing for a submit the service refused', async () => {
    callerCanRead(['alert-1']);
    mockSubmit.mockRejectedValue(new Error('boom'));

    await tool.handler({ sampleHash: SHA256, tags: ['alert:alert-1'] }, context);

    expect(recordRun).not.toHaveBeenCalled();
  });

  it('refuses an alert tag the caller cannot read without submitting', async () => {
    callerCanRead([]);

    const [result] = results(
      await tool.handler({ sampleHash: SHA256, tags: ['alert:alert-foreign'] }, context)
    );

    expect(mockSubmit).not.toHaveBeenCalled();
    expect(result.type).toBe(ToolResultType.error);
    expect(result.data).toMatchObject({ error: 'invalid_argument' });
    expect(result.data).not.toHaveProperty('submitAttempted');
    expect(JSON.stringify(result.data)).toContain('alert-foreign');
  });

  it('blames the alert lookup, not the detonation service, when that lookup fails', async () => {
    callerSearch.mockRejectedValue(Object.assign(new Error('shard failure'), { statusCode: 503 }));

    const [result] = results(
      await tool.handler({ sampleHash: SHA256, tags: ['alert:alert-1'] }, context)
    );

    expect(mockSubmit).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ error: 'unknown_error' });
    expect(result.data).not.toHaveProperty('submitAttempted');
    expect(JSON.stringify(result.data)).not.toContain('detonation service');
    expect(JSON.stringify(result.data)).not.toContain('shard failure');
  });

  it('refuses without the write privilege and never reads alerts or submits', async () => {
    hasDetonatePrivilege.mockResolvedValue(false);

    const [result] = results(
      await tool.handler({ sampleHash: SHA256, tags: ['alert:alert-1'] }, context)
    );

    expect(hasDetonatePrivilege).toHaveBeenCalledWith(request, 'write');
    expect(callerSearch).not.toHaveBeenCalled();
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ error: 'insufficient_privileges' });
  });
});

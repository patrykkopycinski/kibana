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

import type { EndpointAppContextService } from '../../../../endpoint/endpoint_app_context_services';
import type { DetonateClient } from '../../../../detonate_prototype/client';
import { lookupPriorRunsInSpace } from '../../../../detonate_prototype/space_scope';
import { LOOKUP_HASH_TOOL_ID } from '..';
import type { DetonateSkillDeps } from '../types';
import { lookupHashTool } from './lookup_hash';

jest.mock('../../../../detonate_prototype/space_scope', () => ({
  lookupPriorRunsInSpace: jest.fn(),
}));

const mockLookup = lookupPriorRunsInSpace as jest.MockedFunction<typeof lookupPriorRunsInSpace>;

const SHA256 = 'a'.repeat(64);
const request = {} as KibanaRequest;
const context = { request } as unknown as ToolHandlerContext;

const results = (result: unknown) => {
  if (!isToolHandlerStandardReturn(result as ToolHandlerReturn)) {
    throw new Error('Expected standard tool return');
  }
  return (result as ToolHandlerStandardReturn).results;
};

describe('lookupHashTool', () => {
  const client = {} as DetonateClient;
  let hasDetonatePrivilege: jest.Mock;
  let getActiveSpaceId: jest.Mock;
  let tool: ReturnType<typeof lookupHashTool>;

  beforeEach(() => {
    jest.clearAllMocks();
    hasDetonatePrivilege = jest.fn().mockResolvedValue(true);
    getActiveSpaceId = jest.fn().mockReturnValue('team-a');
    tool = lookupHashTool({
      endpointAppContextService: { getActiveSpaceId } as unknown as EndpointAppContextService,
      getClient: () => client,
      hasDetonatePrivilege,
    } as DetonateSkillDeps);
  });

  it('registers under the skill-scoped id', () => {
    expect(tool.id).toBe(LOOKUP_HASH_TOOL_ID);
  });

  it('returns known-malicious with the prior run, scoped to the active space', async () => {
    mockLookup.mockResolvedValue({
      sha256: SHA256,
      status: 'known-malicious',
      source: 'prior-detonation',
      last_task_id: 'task-1',
      last_verdict: 'malicious',
      last_seen: '2026-11-01T10:00:00.000Z',
    });

    const [result] = results(await tool.handler({ sampleHash: SHA256 }, context));

    expect(hasDetonatePrivilege).toHaveBeenCalledWith(request, 'read');
    expect(getActiveSpaceId).toHaveBeenCalledWith(request);
    expect(mockLookup).toHaveBeenCalledWith(client, SHA256, 'team-a');
    expect(result.type).toBe(ToolResultType.other);
    expect(result.data).toEqual({
      kind: 'detonation_prior_run',
      status: 'known-malicious',
      has_completed_run: true,
      last_task_id: 'task-1',
      last_verdict: 'malicious',
      last_seen: '2026-11-01T10:00:00.000Z',
    });
  });

  it('flags a completed non-malicious run as unknown with has_completed_run', async () => {
    mockLookup.mockResolvedValue({
      sha256: SHA256,
      status: 'unknown',
      source: 'prior-detonation',
      last_task_id: 'task-2',
      last_verdict: 'quiet',
      last_seen: '2026-11-02T10:00:00.000Z',
    });

    const [{ data }] = results(await tool.handler({ sampleHash: SHA256 }, context));

    expect(data).toMatchObject({
      status: 'unknown',
      has_completed_run: true,
      last_task_id: 'task-2',
      last_verdict: 'quiet',
    });
  });

  it('returns unknown without run fields when nothing is on record', async () => {
    mockLookup.mockResolvedValue({
      sha256: SHA256,
      status: 'unknown',
      source: 'prior-detonation',
    });

    const [{ data }] = results(await tool.handler({ sampleHash: SHA256 }, context));

    expect(data).toEqual({
      kind: 'detonation_prior_run',
      status: 'unknown',
      has_completed_run: false,
    });
  });

  it('refuses without the read privilege and never queries the service', async () => {
    hasDetonatePrivilege.mockResolvedValue(false);

    const [result] = results(await tool.handler({ sampleHash: SHA256 }, context));

    expect(result.type).toBe(ToolResultType.error);
    expect(result.data).toMatchObject({ error: 'insufficient_privileges' });
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('reports the service as unavailable instead of throwing', async () => {
    mockLookup.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const [result] = results(await tool.handler({ sampleHash: SHA256 }, context));

    expect(result.type).toBe(ToolResultType.error);
    expect(result.data).toMatchObject({ error: 'service_unavailable' });
  });

  it.each([
    ['md5', 'b'.repeat(32), true],
    ['sha1', 'c'.repeat(40), true],
    ['sha256', SHA256, true],
    ['wrong length', 'd'.repeat(50), false],
    ['non-hex', 'z'.repeat(64), false],
    ['query injection', `${'a'.repeat(63)}"`, false],
  ])('schema accepts %s: %s', (_label, sampleHash, valid) => {
    expect(tool.schema.safeParse({ sampleHash }).success).toBe(valid);
  });
});

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildActionResultFromResponse } from './action_result_builder';
import type { ProposalProperties } from '../../client/proposals/types';
import { DAYBREAK_ACTION_RESULT_SCHEMA_VERSION } from './versions';

const buildProposal = (overrides: Partial<ProposalProperties> = {}): ProposalProperties => ({
  id: 'proposal-1',
  title: 'Isolate suspicious host',
  capability: 'endpoint-response',
  severity: 'high',
  confidence: 0.9,
  status: 'approved',
  evidenceRefs: ['alert-1'],
  requiredApproverCount: 1,
  approvals: [{ actor: 'analyst@example.com', timestamp: '2026-07-13T12:00:00.000Z' }],
  decisionHistory: [],
  createdAt: '2026-07-13T11:00:00.000Z',
  sourceWorkerId: 'watch-floor-worker',
  ...overrides,
});

describe('buildActionResultFromResponse', () => {
  it('builds a completed action result from a successful tool response', () => {
    const proposal = buildProposal();
    const toolResult = {
      results: [
        {
          data: {
            action: 'isolate',
            hostName: 'host-01',
            status: 'completed',
            found: true,
          },
        },
      ],
    };

    const result = buildActionResultFromResponse({
      proposal,
      action: 'isolate',
      hostName: 'host-01',
      toolResult,
      investigationId: 'inv-1',
      actor: 'operator@example.com',
      now: new Date('2026-07-13T13:00:00.000Z'),
    });

    expect(result.schemaVersion).toBe(DAYBREAK_ACTION_RESULT_SCHEMA_VERSION);
    expect(result.actionType).toBe('isolate');
    expect(result.target).toBe('host-01');
    expect(result.proposalId).toBe(proposal.id);
    expect(result.sourceWorkerId).toBe('watch-floor-worker');
    expect(result.approvedBy).toBe('analyst@example.com');
    expect(result.executedBy).toBe('operator@example.com');
    expect(result.investigationId).toBe('inv-1');
    expect(result.status).toBe('completed');
    expect(result.outputSummary).toBe('isolate on host-01: completed');
    expect(result.stub).toBeUndefined();
    expect(result.id).toBeDefined();
  });

  it('marks stubbed demo responses with stubbed status', () => {
    const proposal = buildProposal();
    const toolResult = {
      stub: true,
      results: [
        {
          data: {
            action: 'get_processes',
            hostName: 'host-02',
            status: 'stubbed-success',
            found: true,
            message: 'Stubbed get_processes on host-02 (demo mode).',
          },
        },
      ],
    };

    const result = buildActionResultFromResponse({
      proposal,
      action: 'get_processes',
      hostName: 'host-02',
      toolResult,
    });

    expect(result.status).toBe('stubbed');
    expect(result.stub).toBe(true);
    expect(result.outputSummary).toBe('Stubbed get_processes on host-02 (demo mode).');
  });

  it('marks missing endpoint responses as failed', () => {
    const proposal = buildProposal();
    const toolResult = {
      results: [
        {
          data: {
            found: false,
            message: 'No endpoint found for host-03.',
          },
        },
      ],
    };

    const result = buildActionResultFromResponse({
      proposal,
      action: 'get_processes',
      hostName: 'host-03',
      toolResult,
    });

    expect(result.status).toBe('failed');
    expect(result.outputSummary).toBe('No endpoint found for host-03.');
  });
});

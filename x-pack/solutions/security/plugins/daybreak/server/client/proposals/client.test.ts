/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { createProposalClient, ProposalNotFoundError, type ProposalClient } from './client';
import { evaluateReadinessGate, requireReadinessGate, ReadinessGateError } from './gate';
import type { ProposalProperties } from './types';

const testSpace = 'default';

const createMockProposalSource = (overrides?: Partial<ProposalProperties>): ProposalProperties => ({
  id: 'proposal-1',
  title: 'A test proposal',
  capability: 'detection',
  severity: 'high',
  confidence: 0.8,
  status: 'new',
  recommendation: 'Investigate immediately',
  evidenceRefs: ['evidence-1'],
  requiredApproverCount: 1,
  approvals: [],
  decisionHistory: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  space: testSpace,
  ...overrides,
});

const createMockProposalDoc = (overrides?: Partial<ProposalProperties>) => ({
  _id: 'es-doc-id',
  _source: createMockProposalSource(overrides),
});

interface MockEsClient {
  search: jest.Mock;
  index: jest.Mock;
  delete: jest.Mock;
}

const mockEsClient: MockEsClient = {
  search: jest.fn(),
  index: jest.fn(),
  delete: jest.fn(),
};

jest.mock('./storage', () => {
  const actual = jest.requireActual('./storage');
  return {
    ...actual,
    createProposalsStorage: jest.fn(() => ({
      getClient: jest.fn(() => mockEsClient),
    })),
  };
});

describe('ProposalClient (FR-004, FR-005)', () => {
  let client: ProposalClient;

  beforeEach(() => {
    jest.clearAllMocks();

    client = createProposalClient({
      space: testSpace,
      logger: loggerMock.create(),
      esClient: {} as never,
    });
  });

  describe('get (FR-004)', () => {
    it('returns the proposal when it exists', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [createMockProposalDoc()] },
      });

      const result = await client.get('proposal-1');

      expect(result.id).toBe('proposal-1');
      expect(result.title).toBe('A test proposal');
    });

    it('throws ProposalNotFoundError when not found', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [] } });

      await expect(client.get('non-existent')).rejects.toThrow(ProposalNotFoundError);
    });
  });

  describe('list (FR-004)', () => {
    it('returns all proposals in the space', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            createMockProposalDoc({ id: 'p1', status: 'new' }),
            createMockProposalDoc({ id: 'p2', status: 'approved' }),
          ],
          total: { value: 2 },
        },
      });

      const result = await client.list();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('p1');
      expect(result[1].id).toBe('p2');
    });

    it('returns empty list when no proposals exist', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [], total: { value: 0 } },
      });

      const result = await client.list();
      expect(result).toEqual([]);
    });

    it('filters by status, severity and capability', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [] } });

      await client.list({ status: 'approved', severity: 'high', capability: 'detection' });

      expect(mockEsClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: {
            bool: {
              filter: expect.arrayContaining([
                { term: { status: 'approved' } },
                { term: { severity: 'high' } },
                { term: { capability: 'detection' } },
              ]),
            },
          },
        })
      );
    });
  });

  describe('create (FR-004)', () => {
    it('creates a proposal document and returns the persisted record', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            createMockProposalDoc({
              id: 'proposal-2',
              title: 'new proposal',
            }),
          ],
        },
      });
      mockEsClient.index.mockResolvedValue({ result: 'created' });

      const result = await client.create({
        id: 'proposal-2',
        title: 'new proposal',
        capability: 'detection',
        severity: 'high',
        confidence: 0.9,
        status: 'new',
      });

      expect(result.id).toBe('proposal-2');
      expect(result.title).toBe('new proposal');
      expect(mockEsClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            id: 'proposal-2',
            title: 'new proposal',
            capability: 'detection',
            space: testSpace,
          }),
        })
      );
    });

    it('persists the source Watch so operator activity can be traced', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [createMockProposalDoc()] } });
      mockEsClient.index.mockResolvedValue({ result: 'created' });

      await client.create({
        id: 'proposal-from-watch',
        title: 'Watch-produced proposal',
        sourceWatch: 'watch-1',
        capability: 'detection',
        severity: 'high',
        confidence: 0.9,
        status: 'new',
      });

      expect(mockEsClient.index).toHaveBeenCalledWith(
        expect.objectContaining({ document: expect.objectContaining({ sourceWatch: 'watch-1' }) })
      );
    });

    it('defaults evidenceRefs, approvals and decisionHistory to empty arrays', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [createMockProposalDoc()] },
      });
      mockEsClient.index.mockResolvedValue({ result: 'created' });

      await client.create({
        id: 'proposal-3',
        title: 'defaults proposal',
        capability: 'prevention',
        severity: 'medium',
        confidence: 0.5,
        status: 'new',
      });

      const [indexArg] = mockEsClient.index.mock.calls[0];
      expect(indexArg.document).toEqual(
        expect.objectContaining({
          evidenceRefs: [],
          approvals: [],
          decisionHistory: [],
          createdAt: expect.any(String),
        })
      );
    });
  });

  describe('update (FR-004)', () => {
    it('updates an existing proposal document', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [createMockProposalDoc()] },
      });
      mockEsClient.index.mockResolvedValue({ result: 'updated' });

      const result = await client.update('proposal-1', { confidence: 0.42 });

      expect(result.confidence).toBe(0.42);
      expect(mockEsClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'es-doc-id',
          document: expect.objectContaining({ confidence: 0.42 }),
        })
      );
    });

    it('throws ProposalNotFoundError when proposal does not exist', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [] } });

      await expect(client.update('non-existent', { confidence: 0.1 })).rejects.toThrow(
        ProposalNotFoundError
      );
    });
  });

  describe('delete (FR-004)', () => {
    it('deletes an existing proposal document', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [createMockProposalDoc()] },
      });
      mockEsClient.delete.mockResolvedValue({ result: 'deleted' });

      await expect(client.delete('proposal-1')).resolves.toBe(true);
      expect(mockEsClient.delete).toHaveBeenCalledWith({ id: 'es-doc-id' });
    });

    it('returns false when proposal does not exist', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [] } });

      await expect(client.delete('non-existent')).resolves.toBe(false);
      expect(mockEsClient.delete).not.toHaveBeenCalled();
    });

    it('returns false when ES reports not_found on delete', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [createMockProposalDoc()] },
      });
      mockEsClient.delete.mockResolvedValue({ result: 'not_found' });

      await expect(client.delete('proposal-1')).resolves.toBe(false);
    });
  });

  describe('transitionStatus (FR-004, FR-005)', () => {
    it('transitions to approved when the readiness gate passes', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            createMockProposalDoc({
              status: 'needs-evidence',
              recommendation: 'Approve this',
              evidenceRefs: ['evidence-1'],
            }),
          ],
        },
      });
      mockEsClient.index.mockResolvedValue({ result: 'updated' });

      const result = await client.transitionStatus('proposal-1', 'approved');

      expect(result.status).toBe('approved');
      expect(result.approvals).toHaveLength(1);
      expect(result.approvals[0]).toEqual(
        expect.objectContaining({
          actor: 'unknown',
          timestamp: expect.any(String),
        })
      );
      expect(result.decisionHistory).toHaveLength(1);
      expect(result.decisionHistory[0]).toEqual(
        expect.objectContaining({
          fromStatus: 'needs-evidence',
          toStatus: 'approved',
          timestamp: expect.any(String),
        })
      );
      expect(mockEsClient.index).toHaveBeenCalledTimes(1);
    });

    it('records the actor and reason when approving', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            createMockProposalDoc({
              status: 'needs-evidence',
              recommendation: 'Approve this',
              evidenceRefs: ['evidence-1'],
            }),
          ],
        },
      });
      mockEsClient.index.mockResolvedValue({ result: 'updated' });

      const result = await client.transitionStatus('proposal-1', 'approved', 'operator-1', 'LGTM');

      expect(result.approvals[0]).toEqual(
        expect.objectContaining({
          actor: 'operator-1',
          reason: 'LGTM',
        })
      );
      expect(result.decisionHistory[0]).toEqual(
        expect.objectContaining({
          actor: 'operator-1',
          reason: 'LGTM',
        })
      );
    });

    it('throws ReadinessGateError on empty evidenceRefs + empty recommendation (FR-005)', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            createMockProposalDoc({
              status: 'new',
              evidenceRefs: [],
              recommendation: undefined,
            }),
          ],
        },
      });

      await expect(client.transitionStatus('proposal-1', 'approved')).rejects.toThrow(
        ReadinessGateError
      );
      expect(mockEsClient.index).not.toHaveBeenCalled();
    });

    it('surfaces missingRequirements: ["evidence"] and does not transition to approved on empty evidenceRefs (FR-017, FR-018)', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            createMockProposalDoc({
              status: 'new',
              evidenceRefs: [],
              recommendation: 'Approve this',
            }),
          ],
        },
      });

      expect.assertions(4);
      try {
        await client.transitionStatus('proposal-1', 'approved');
      } catch (e) {
        expect(e).toBeInstanceOf(ReadinessGateError);
        expect((e as ReadinessGateError).failure.missingRequirements).toEqual(['evidence']);
      }

      expect(mockEsClient.index).not.toHaveBeenCalled();

      const document = await client.get('proposal-1');
      expect(document.status).not.toBe('approved');
    });

    it('requires additional approvals for two-person approval', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            createMockProposalDoc({
              status: 'needs-evidence',
              recommendation: 'Approve this',
              evidenceRefs: ['evidence-1'],
              requiredApproverCount: 2,
              approvals: [],
            }),
          ],
        },
      });

      await expect(client.transitionStatus('proposal-1', 'approved')).rejects.toThrow(
        ReadinessGateError
      );
      const error = await client.transitionStatus('proposal-1', 'approved').catch((e) => e);
      expect(error.failure.missingRequirements).toEqual(['approver-count']);
      expect(mockEsClient.index).not.toHaveBeenCalled();
    });

    it('transitions to approved once enough approvals are recorded', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            createMockProposalDoc({
              status: 'needs-evidence',
              recommendation: 'Approve this',
              evidenceRefs: ['evidence-1'],
              requiredApproverCount: 2,
              approvals: [{ actor: 'operator-1', timestamp: '2025-01-01T00:00:00.000Z' }],
            }),
          ],
        },
      });
      mockEsClient.index.mockResolvedValue({ result: 'updated' });

      const result = await client.transitionStatus('proposal-1', 'approved', 'operator-2');

      expect(result.status).toBe('approved');
      expect(result.approvals).toHaveLength(2);
    });

    it('transitions to a non-approved status without checking the gate', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            createMockProposalDoc({
              status: 'new',
              evidenceRefs: [],
              recommendation: undefined,
            }),
          ],
        },
      });
      mockEsClient.index.mockResolvedValue({ result: 'updated' });

      const result = await client.transitionStatus('proposal-1', 'dismissed');

      expect(result.status).toBe('dismissed');
      expect(result.decisionHistory).toHaveLength(1);
    });
  });

  describe('addEvidenceRef (FR-004)', () => {
    it('adds an evidence reference to a proposal', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [createMockProposalDoc({ evidenceRefs: ['evidence-1'] })] },
      });
      mockEsClient.index.mockResolvedValue({ result: 'updated' });

      const result = await client.addEvidenceRef('proposal-1', 'evidence-2');

      expect(result.evidenceRefs).toEqual(['evidence-1', 'evidence-2']);
      expect(mockEsClient.index).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — does not duplicate an existing evidence ref', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [createMockProposalDoc({ evidenceRefs: ['evidence-1'] })] },
      });

      const result = await client.addEvidenceRef('proposal-1', 'evidence-1');

      expect(result.evidenceRefs).toEqual(['evidence-1']);
      expect(mockEsClient.index).not.toHaveBeenCalled();
    });
  });

  describe('removeEvidenceRef (FR-004)', () => {
    it('removes an evidence reference from a proposal', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [createMockProposalDoc({ evidenceRefs: ['evidence-1', 'evidence-2'] })] },
      });
      mockEsClient.index.mockResolvedValue({ result: 'updated' });

      const result = await client.removeEvidenceRef('proposal-1', 'evidence-1');

      expect(result.evidenceRefs).toEqual(['evidence-2']);
    });
  });

  describe('readiness gate (FR-005)', () => {
    describe('evaluateReadinessGate', () => {
      it('passes for a non-approved target status', () => {
        const proposal = createMockProposalSource({
          evidenceRefs: [],
          recommendation: undefined,
        });

        const result = evaluateReadinessGate(proposal, 'dismissed');

        expect(result.approved).toBe(true);
      });

      it('passes for approved when evidence and recommendation are present', () => {
        const proposal = createMockProposalSource({
          evidenceRefs: ['evidence-1'],
          recommendation: 'Approve this',
          approvals: [{ actor: 'operator-1', timestamp: '2025-01-01T00:00:00.000Z' }],
        });

        const result = evaluateReadinessGate(proposal, 'approved');

        expect(result.approved).toBe(true);
      });

      it('reports both evidence and recommendation missing on empty evidenceRefs + empty recommendation', () => {
        const proposal = createMockProposalSource({
          evidenceRefs: [],
          recommendation: undefined,
        });

        const result = evaluateReadinessGate(proposal, 'approved');

        expect(result.approved).toBe(false);
        if (!result.approved) {
          expect(result.failure.proposalId).toBe('proposal-1');
          expect(result.failure.targetStatus).toBe('approved');
          expect(result.failure.missingRequirements).toHaveLength(3);
          expect(result.failure.missingRequirements).toEqual(
            expect.arrayContaining(['evidence', 'recommendation', 'approver-count'])
          );
        }
      });

      it('reports only evidence missing when recommendation is present', () => {
        const proposal = createMockProposalSource({
          evidenceRefs: [],
          recommendation: 'Approve this',
        });

        const result = evaluateReadinessGate(proposal, 'approved');

        expect(result.approved).toBe(false);
        if (!result.approved) {
          expect(result.failure.missingRequirements).toEqual(['evidence', 'approver-count']);
        }
      });

      it('treats a whitespace-only recommendation as empty', () => {
        const proposal = createMockProposalSource({
          evidenceRefs: ['evidence-1'],
          recommendation: '   ',
        });

        const result = evaluateReadinessGate(proposal, 'approved');

        expect(result.approved).toBe(false);
        if (!result.approved) {
          expect(result.failure.missingRequirements).toEqual(['recommendation', 'approver-count']);
        }
      });

      it('reports approver-count missing when required count is not met', () => {
        const proposal = createMockProposalSource({
          evidenceRefs: ['evidence-1'],
          recommendation: 'Approve this',
          requiredApproverCount: 2,
          approvals: [{ actor: 'a', timestamp: '2025-01-01T00:00:00.000Z' }],
        });

        const result = evaluateReadinessGate(proposal, 'approved');

        expect(result.approved).toBe(false);
        if (!result.approved) {
          expect(result.failure.missingRequirements).toEqual(['approver-count']);
        }
      });
    });

    describe('requireReadinessGate', () => {
      it('throws ReadinessGateError on empty evidenceRefs + empty recommendation (FR-005)', () => {
        const proposal = createMockProposalSource({
          evidenceRefs: [],
          recommendation: undefined,
        });

        expect(() => requireReadinessGate(proposal, 'approved')).toThrow(ReadinessGateError);
      });

      it('does not throw when the gate passes', () => {
        const proposal = createMockProposalSource({
          evidenceRefs: ['evidence-1'],
          recommendation: 'Approve this',
          approvals: [{ actor: 'operator-1', timestamp: '2025-01-01T00:00:00.000Z' }],
        });

        expect(() => requireReadinessGate(proposal, 'approved')).not.toThrow();
      });

      it('does not throw for a non-approved target status', () => {
        const proposal = createMockProposalSource({
          evidenceRefs: [],
          recommendation: undefined,
        });

        expect(() => requireReadinessGate(proposal, 'deferred')).not.toThrow();
      });
    });
  });
});

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { createEvidenceClient, EvidenceNotFoundError, type EvidenceClient } from './client';
import type { EvidenceProperties } from './storage';

const testSpace = 'default';

const createMockEvidenceSource = (overrides?: Partial<EvidenceProperties>): EvidenceProperties => ({
  id: 'evidence-1',
  kind: 'alert',
  summary: 'A test evidence summary',
  provenance: 'tool',
  confidence: 0.8,
  stance: 'for',
  sensitivityLabel: 'internal',
  createdAt: '2025-01-01T00:00:00.000Z',
  space: testSpace,
  ...overrides,
});

const createMockEvidenceDoc = (overrides?: Partial<EvidenceProperties>) => ({
  _id: 'es-doc-id',
  _source: createMockEvidenceSource(overrides),
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
    createEvidenceStorage: jest.fn(() => ({
      getClient: jest.fn(() => mockEsClient),
    })),
  };
});

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'generated-uuid'),
}));

describe('EvidenceClient (FR-001, FR-002, FR-003)', () => {
  let client: EvidenceClient;

  beforeEach(() => {
    jest.clearAllMocks();

    client = createEvidenceClient({
      space: testSpace,
      logger: loggerMock.create(),
      esClient: {} as never,
    });
  });

  describe('get (FR-001)', () => {
    it('returns the evidence when it exists', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [createMockEvidenceDoc()] },
      });

      const result = await client.get('evidence-1');

      expect(result.id).toBe('evidence-1');
      expect(result.summary).toBe('A test evidence summary');
    });

    it('throws EvidenceNotFoundError when not found', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [] } });

      await expect(client.get('non-existent')).rejects.toThrow(EvidenceNotFoundError);
    });
  });

  describe('list (FR-001)', () => {
    it('returns all evidence in the space', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            createMockEvidenceDoc({ id: 'e1', kind: 'alert' }),
            createMockEvidenceDoc({ id: 'e2', kind: 'event' }),
          ],
          total: { value: 2 },
        },
      });

      const result = await client.list();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('e1');
      expect(result[1].id).toBe('e2');
    });

    it('returns empty list when no evidence exists', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [], total: { value: 0 } },
      });

      const result = await client.list();
      expect(result).toEqual([]);
    });

    it('filters by kind, stance and provenance', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [] } });

      await client.list({ kind: 'alert', stance: 'for', provenance: 'tool' });

      expect(mockEsClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: {
            bool: {
              filter: expect.arrayContaining([
                { term: { kind: 'alert' } },
                { term: { stance: 'for' } },
                { term: { provenance: 'tool' } },
              ]),
            },
          },
        })
      );
    });
  });

  describe('create (FR-001, FR-002)', () => {
    it('creates an evidence document and returns the persisted record', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            createMockEvidenceDoc({
              id: 'generated-uuid',
              kind: 'alert',
              summary: 'new evidence',
            }),
          ],
        },
      });
      mockEsClient.index.mockResolvedValue({ result: 'created' });

      const result = await client.create({
        kind: 'alert',
        summary: 'new evidence',
        provenance: 'tool',
        confidence: 0.9,
        stance: 'for',
        sensitivityLabel: 'internal',
      });

      expect(result.id).toBe('generated-uuid');
      expect(result.summary).toBe('new evidence');
      expect(mockEsClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            id: 'generated-uuid',
            kind: 'alert',
            summary: 'new evidence',
            space: testSpace,
          }),
        })
      );
    });

    it('stamps all FR-002 fields onto the created document', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [createMockEvidenceDoc()] },
      });
      mockEsClient.index.mockResolvedValue({ result: 'created' });

      await client.create({
        kind: 'entity',
        summary: 'entity evidence',
        provenance: 'capability',
        confidence: 0.5,
        stance: 'against',
        sourceRef: 'ref-123',
        limitations: ['limited scope'],
        sensitivityLabel: 'restricted',
      });

      const [indexArg] = mockEsClient.index.mock.calls[0];
      expect(indexArg.document).toEqual(
        expect.objectContaining({
          id: 'generated-uuid',
          kind: 'entity',
          sourceRef: 'ref-123',
          summary: 'entity evidence',
          provenance: 'capability',
          confidence: 0.5,
          stance: 'against',
          limitations: ['limited scope'],
          sensitivityLabel: 'restricted',
          createdAt: expect.any(String),
        })
      );
    });
  });

  describe('update (FR-001)', () => {
    it('updates an existing evidence document', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [createMockEvidenceDoc()] },
      });
      mockEsClient.index.mockResolvedValue({ result: 'updated' });

      const result = await client.update('evidence-1', { confidence: 0.42 });

      expect(result.confidence).toBe(0.42);
      expect(mockEsClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'es-doc-id',
          document: expect.objectContaining({ confidence: 0.42 }),
        })
      );
    });

    it('throws EvidenceNotFoundError when evidence does not exist', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [] } });

      await expect(client.update('non-existent', { confidence: 0.1 })).rejects.toThrow(
        EvidenceNotFoundError
      );
    });
  });

  describe('delete (FR-001)', () => {
    it('deletes an existing evidence document', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [createMockEvidenceDoc()] },
      });
      mockEsClient.delete.mockResolvedValue({ result: 'deleted' });

      await expect(client.delete('evidence-1')).resolves.toBe(true);
      expect(mockEsClient.delete).toHaveBeenCalledWith({ id: 'es-doc-id' });
    });

    it('returns false when evidence does not exist', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [] } });

      await expect(client.delete('non-existent')).resolves.toBe(false);
      expect(mockEsClient.delete).not.toHaveBeenCalled();
    });

    it('returns false when ES reports not_found on delete', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [createMockEvidenceDoc()] },
      });
      mockEsClient.delete.mockResolvedValue({ result: 'not_found' });

      await expect(client.delete('evidence-1')).resolves.toBe(false);
    });
  });
});

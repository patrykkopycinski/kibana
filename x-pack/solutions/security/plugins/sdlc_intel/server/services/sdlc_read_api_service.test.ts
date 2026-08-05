/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SDLC_INDEX_NAMES } from '@kbn/sdlc-data-layer';
import type { ElasticsearchClient } from '@kbn/core/server';
import { fetchSyncStatus } from './sdlc_read_api_service';

const indexNotFoundError = (index: string) =>
  Object.assign(new Error('[index_not_found_exception] no such index [' + index + ']'), {
    meta: { body: { error: { type: 'index_not_found_exception', index } } },
  });

const mockEsClient = (overrides: {
  syncState?: { hits: { hits: Array<{ _source?: { last_run_at?: string; last_run_status?: string } }> } };
  completedProjects?: number;
  syncStateTotal?: number;
  epicPhaseCount?: number;
  relationshipCount?: number;
  missingIndices?: string[];
} = {}): ElasticsearchClient => {
  const {
    syncState = { hits: { hits: [{ _source: { last_run_at: new Date().toISOString(), last_run_status: 'completed' } }] } },
    completedProjects = 3,
    syncStateTotal = 10,
    epicPhaseCount = 7,
    relationshipCount = 42,
    missingIndices = [],
  } = overrides;

  const missing = new Set(missingIndices);

  return {
    search: jest.fn(async ({ index }) => {
      if (missing.has(index as keyof typeof SDLC_INDEX_NAMES)) {
        throw indexNotFoundError(index as string);
      }
      return syncState;
    }),
    count: jest.fn(async ({ index, query }) => {
      if (missing.has(index as keyof typeof SDLC_INDEX_NAMES)) {
        throw indexNotFoundError(index as string);
      }
      if (index === SDLC_INDEX_NAMES.SDLC_EPIC_PHASES) {
        return { count: epicPhaseCount };
      }
      if (index === SDLC_INDEX_NAMES.GITHUB_INTEL_RELATIONSHIPS) {
        return { count: relationshipCount };
      }
      if (index === SDLC_INDEX_NAMES.GITHUB_SYNC_STATE) {
        return { count: query ? completedProjects : syncStateTotal };
      }
      return { count: 0 };
    }),
  } as unknown as ElasticsearchClient;
};

describe('fetchSyncStatus', () => {
  it('returns all counts when every index is present', async () => {
    const result = await fetchSyncStatus(mockEsClient());
    expect(result.healthy).toBe(true);
    expect(result.completedProjects).toBe(3);
    expect(result.epicPhaseCount).toBe(7);
    expect(result.relationshipCount).toBe(42);
  });

  it('returns null for a missing index without zeroing its neighbours', async () => {
    const result = await fetchSyncStatus(
      mockEsClient({
        epicPhaseCount: 7,
        missingIndices: [SDLC_INDEX_NAMES.GITHUB_INTEL_RELATIONSHIPS],
      })
    );
    expect(result.epicPhaseCount).toBe(7);
    expect(result.relationshipCount).toBeNull();
  });

  it('returns null for every count when all indices are missing', async () => {
    const result = await fetchSyncStatus(
      mockEsClient({
        missingIndices: [
          SDLC_INDEX_NAMES.GITHUB_SYNC_STATE,
          SDLC_INDEX_NAMES.SDLC_EPIC_PHASES,
          SDLC_INDEX_NAMES.GITHUB_INTEL_RELATIONSHIPS,
        ],
      })
    );
    expect(result.completedProjects).toBeNull();
    expect(result.epicPhaseCount).toBeNull();
    expect(result.relationshipCount).toBeNull();
    expect(result.healthy).toBe(false);
  });

  it('distinguishes present-but-empty (0) from missing (null)', async () => {
    const result = await fetchSyncStatus(
      mockEsClient({
        epicPhaseCount: 0,
        relationshipCount: 0,
      })
    );
    expect(result.epicPhaseCount).toBe(0);
    expect(result.relationshipCount).toBe(0);
  });

  it('applies the completedProjects filter', async () => {
    const result = await fetchSyncStatus(
      mockEsClient({
        completedProjects: 3,
        syncStateTotal: 10,
      })
    );
    expect(result.completedProjects).toBe(3);
  });

  it('still propagates non-index-missing errors', async () => {
    const client = {
      search: jest.fn(async () => {
        throw new Error('something else broke');
      }),
      count: jest.fn(),
    } as unknown as ElasticsearchClient;
    await expect(fetchSyncStatus(client)).rejects.toThrow('something else broke');
  });
});

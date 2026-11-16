/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { estypes } from '@elastic/elasticsearch';
import { fromKueryExpression, toElasticsearchQuery } from '@kbn/es-query';
import {
  DETONATION_RUN_FIELDS,
  DETONATION_RUNS_DEFAULT_PAGE_SIZE,
  detonateResultsIndexName,
} from '../../common/detonate_prototype';
import type {
  DetonationRecord,
  DetonationRunsQuery,
  DetonationRunsResponse,
} from '../../common/detonate_prototype';

/** The fields the free-text box matches: hash, name, tag and submitter. */
const SEARCH_FIELDS = ['file.hash.sha256', 'file.name', 'tags', 'detonate.submitter'] as const;

/** A `wildcard` value matches literally except for these; the user's text must not carry any. */
const escapeWildcard = (text: string): string => text.replace(/[\\*?]/g, (char) => `\\${char}`);

/** Thrown for a KQL string that does not parse; the route answers it with a 400. */
export class InvalidRunsQueryError extends Error {}

const kqlToQuery = (kql: string): estypes.QueryDslQueryContainer => {
  try {
    return toElasticsearchQuery(fromKueryExpression(kql));
  } catch (error) {
    throw new InvalidRunsQueryError(`Invalid KQL: ${error instanceof Error ? error.message : ''}`);
  }
};

/**
 * Free text becomes `wildcard` clauses over fixed fields, never a `query_string`, so a
 * pasted value cannot reach the query syntax. Matching is case-insensitive and contains-style.
 */
const searchQuery = (search: string): estypes.QueryDslQueryContainer => ({
  bool: {
    should: SEARCH_FIELDS.map((field) => ({
      wildcard: {
        [field]: { value: `*${escapeWildcard(search)}*`, case_insensitive: true },
      },
    })),
    minimum_should_match: 1,
  },
});

export const buildRunsQuery = ({
  kql,
  search,
}: Pick<DetonationRunsQuery, 'kql' | 'search'>): estypes.QueryDslQueryContainer => ({
  bool: {
    // Always pinned: the index also holds alert decisions, and KQL must not widen to them.
    filter: [
      { term: { 'detonate.doc_kind': 'run' } },
      ...(kql?.trim() ? [kqlToQuery(kql)] : []),
      ...(search?.trim() ? [searchQuery(search.trim())] : []),
    ],
  },
});

export const searchRuns = async ({
  esClient,
  spaceId,
  query,
}: {
  esClient: ElasticsearchClient;
  spaceId: string;
  query: DetonationRunsQuery;
}): Promise<DetonationRunsResponse> => {
  const sortField = query.sort_field ?? '@timestamp';
  const sortDirection = query.sort_direction ?? 'desc';
  const response = await esClient.search<DetonationRecord>({
    index: detonateResultsIndexName(spaceId),
    // A space whose first run has not been written has no index yet: an empty list, not an error.
    ignore_unavailable: true,
    allow_no_indices: true,
    query: buildRunsQuery(query),
    sort: [
      { [sortField]: { order: sortDirection, unmapped_type: DETONATION_RUN_FIELDS[sortField] } },
      // Ties break on the task id so paging and the flyout's previous/next stay stable.
      { 'detonate.task_id': { order: 'asc', unmapped_type: 'keyword' } },
    ],
    from: query.from ?? 0,
    size: query.size ?? DETONATION_RUNS_DEFAULT_PAGE_SIZE,
    track_total_hits: true,
  });
  const { total } = response.hits;
  return {
    hits: response.hits.hits.flatMap(({ _source }) => (_source ? [_source] : [])),
    total: typeof total === 'number' ? total : total?.value ?? 0,
  };
};

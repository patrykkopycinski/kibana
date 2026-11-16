/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { isResponseError } from '@kbn/es-errors';
import type { errors, estypes } from '@elastic/elasticsearch';
import { fromKueryExpression, toElasticsearchQuery } from '@kbn/es-query';
import type { DataViewBase, KueryNode } from '@kbn/es-query';
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
import { isIndexNotFound } from './es_errors';

/** The fields the free-text box matches: hash, name, tag and submitter. */
const SEARCH_FIELDS = ['file.hash.sha256', 'file.name', 'tags', 'detonate.submitter'] as const;

/** A `wildcard` value matches literally except for these; the user's text must not carry any. */
const escapeWildcard = (text: string): string => text.replace(/[\\*?]/g, (char) => `\\${char}`);

/** Thrown for a KQL string that does not parse; the route answers it with a 400. */
export class InvalidRunsQueryError extends Error {}

/**
 * The run fields as a data view, so KQL compiles against known types (a keyword field becomes a
 * `term`/`wildcard` clause, not a `query_string` over a guessed field).
 */
const RUNS_DATA_VIEW: DataViewBase = {
  title: 'detonate-runs',
  fields: Object.entries(DETONATION_RUN_FIELDS).map(([name, esType]) => ({
    name,
    type: esType === 'keyword' ? 'string' : esType === 'long' ? 'number' : esType,
    esTypes: [esType],
  })),
};

/**
 * A clause with no field (`foo`, `*:foo`) compiles to a `multi_match` or `query_string` over every
 * field, which the allowlist of run fields exists to prevent.
 */
const hasFieldlessClause = (node: KueryNode): boolean => {
  if (node.type !== 'function') return false;
  const args: KueryNode[] = node.arguments ?? [];
  if (node.function === 'is') {
    const [field] = args;
    return field?.type === 'wildcard' || (field?.type === 'literal' && field.value === null);
  }
  return args.some(hasFieldlessClause);
};

const kqlToQuery = (kql: string): estypes.QueryDslQueryContainer => {
  let node: KueryNode;
  try {
    node = fromKueryExpression(kql);
  } catch (error) {
    throw new InvalidRunsQueryError(`Invalid KQL: ${error instanceof Error ? error.message : ''}`);
  }
  if (hasFieldlessClause(node)) {
    throw new InvalidRunsQueryError('Invalid KQL: every clause needs a field, as in field:value');
  }
  try {
    return toElasticsearchQuery(node, RUNS_DATA_VIEW);
  } catch (error) {
    // Parses but does not compile against the typed fields (e.g. nested syntax on a flat field): the caller's input, not a fault.
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

const hasUserFilter = ({ kql, search }: Pick<DetonationRunsQuery, 'kql' | 'search'>): boolean =>
  Boolean(kql?.trim() || search?.trim());

const MAX_REJECTION_REASON_LENGTH = 200;

const rejectionReason = (error: errors.ResponseError): string =>
  (error.body?.error?.root_cause?.[0]?.reason ?? error.body?.error?.reason ?? error.message).slice(
    0,
    MAX_REJECTION_REASON_LENGTH
  );

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
  const response = await esClient
    .search<DetonationRecord>({
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
    })
    // Defensive: the flags above do not cover every hidden-index edge case, so a still-missing index is empty too.
    .catch((error: unknown) => {
      if (isIndexNotFound(error)) return undefined;
      // A 400 is the caller's input only when they sent a filter (e.g. a date KQL compiles but Elasticsearch cannot parse); otherwise it is our fault.
      if (isResponseError(error) && error.statusCode === 400 && hasUserFilter(query)) {
        throw new InvalidRunsQueryError(`Invalid runs query: ${rejectionReason(error)}`);
      }
      throw error;
    });
  if (!response) return { hits: [], total: 0 };
  const { total } = response.hits;
  return {
    hits: response.hits.hits.flatMap(({ _source }) => (_source ? [_source] : [])),
    total: typeof total === 'number' ? total : total?.value ?? 0,
  };
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { isResponseError } from '@kbn/es-errors';
import type { estypes } from '@elastic/elasticsearch';
import {
  MAX_QUERY_SIZE,
  getGroupingQuery,
  parseGroupingQuery,
} from '@kbn/grouping/src/containers/query';
import {
  DETONATE_VERDICTS,
  DETONATION_GROUPS_DEFAULT_PAGE_SIZE,
  DETONATION_GROUPS_MAX_PARENT_FILTERS,
  DETONATION_GROUPS_MAX_VALUE_LENGTH,
  DETONATION_RUNS_GROUP_FIELDS,
  DETONATION_RUNS_MULTI_VALUE_GROUP_FIELDS,
  DETONATION_RUN_STATUSES,
  DETONATION_STATS_UNKNOWN_VERDICT,
  detonateResultsIndexName,
} from '../../common/detonate_prototype';
import type {
  DetonationRecord,
  DetonationRunGroup,
  DetonationRunGroupsQuery,
  DetonationRunGroupsResponse,
  DetonationRunStatus,
  DetonationRunsGroupField,
  DetonationRunsGroupParent,
} from '../../common/detonate_prototype';
import { isIndexNotFound } from './es_errors';
import {
  InvalidRunsQueryError,
  buildRunsQuery,
  hasUserFilter,
  rejectionReason,
  verdictCounts,
} from './runs_search';
import type { TermsBuckets } from './runs_search';

/** Stands in for "this run has no value" inside the grouping runtime field; never shown. */
const UNIQUE_VALUE = '\u0001detonate-no-value\u0001';

const isGroupField = (value: unknown): value is DetonationRunsGroupField =>
  typeof value === 'string' && (DETONATION_RUNS_GROUP_FIELDS as readonly string[]).includes(value);

/**
 * The parent filters arrive as one JSON query-string value; each is checked against the same
 * allowlist and bounds as the rest of the request, so a crafted value cannot reach the query.
 */
export const parseGroupParents = (raw: string | undefined): DetonationRunsGroupParent[] => {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidRunsQueryError('Invalid parents: not valid JSON');
  }
  if (!Array.isArray(parsed) || parsed.length > DETONATION_GROUPS_MAX_PARENT_FILTERS) {
    throw new InvalidRunsQueryError(
      `Invalid parents: expected at most ${DETONATION_GROUPS_MAX_PARENT_FILTERS} filters`
    );
  }
  return parsed.map((entry: unknown) => {
    const { field, value } = (entry ?? {}) as { field?: unknown; value?: unknown };
    if (!isGroupField(field)) throw new InvalidRunsQueryError('Invalid parents: unknown field');
    if (
      value !== null &&
      (typeof value !== 'string' || value.length > DETONATION_GROUPS_MAX_VALUE_LENGTH)
    ) {
      throw new InvalidRunsQueryError('Invalid parents: value must be a bounded string or null');
    }
    return { field, value };
  });
};

const parentFilter = ({
  field,
  value,
}: DetonationRunsGroupParent): estypes.QueryDslQueryContainer =>
  value === null ? { bool: { must_not: [{ exists: { field } }] } } : { term: { [field]: value } };

const emptyStates = (): Record<DetonationRunStatus, number> =>
  Object.fromEntries(DETONATION_RUN_STATUSES.map((status) => [status, 0])) as Record<
    DetonationRunStatus,
    number
  >;

interface GroupBucket {
  key: string[];
  isNullGroup?: boolean;
  doc_count: number;
  verdicts?: TermsBuckets;
  states?: TermsBuckets;
  file_names?: TermsBuckets;
  hashes?: TermsBuckets;
  alerts_total?: { value: number | null };
}

interface GroupAggregations {
  groupByFields?: { buckets?: GroupBucket[] };
  groupsCount?: { value?: number | null };
  unitsCount?: { value?: number | null };
}

const firstKey = (terms: TermsBuckets | undefined): string | null => {
  const key = terms?.buckets?.[0]?.key;
  return key === undefined ? null : String(key);
};

export const buildRunGroupsQuery = (query: DetonationRunGroupsQuery) => {
  const { group_by: groupBy, page = 0, size = DETONATION_GROUPS_DEFAULT_PAGE_SIZE } = query;
  const parents = parseGroupParents(query.parents);
  return getGroupingQuery({
    additionalFilters: [
      {
        bool: {
          filter: [buildRunsQuery(query), ...parents.map(parentFilter)],
          must: [],
          must_not: [],
          should: [],
        },
      },
    ],
    groupByField: groupBy,
    uniqueValue: UNIQUE_VALUE,
    pageNumber: page * size,
    size,
    // Groups open newest first when each is one run; otherwise the biggest group leads.
    sort:
      groupBy === 'detonate.task_id'
        ? [{ latest: { order: 'desc' } }]
        : [{ _count: { order: 'desc' } }],
    multiValueFieldsToFlatten: [...DETONATION_RUNS_MULTI_VALUE_GROUP_FIELDS],
    // The runs, not the values: a run with three rules is one run.
    countByKeyForMultiValueFields: 'detonate.task_id',
    statsAggregations: [
      {
        verdicts: {
          terms: {
            field: 'detonate.verdict',
            // A run with no verdict (running, failed) is counted, not dropped.
            missing: DETONATION_STATS_UNKNOWN_VERDICT,
            size: DETONATE_VERDICTS.length + 1,
          },
        },
      },
      { states: { terms: { field: 'detonate.state', size: DETONATION_RUN_STATUSES.length + 1 } } },
      { file_names: { terms: { field: 'file.name', size: 1 } } },
      { hashes: { terms: { field: 'file.hash.sha256', size: 1 } } },
      { alerts_total: { sum: { field: 'detonate.alerts.total' } } },
      { latest: { max: { field: '@timestamp' } } },
    ],
  });
};

const toGroup = ({
  key,
  isNullGroup,
  doc_count: runCount,
  verdicts,
  states,
  file_names: fileNames,
  hashes,
  alerts_total: alertsTotal,
}: GroupBucket): DetonationRunGroup => {
  const stateCounts = emptyStates();
  for (const { key: state, doc_count: count } of states?.buckets ?? []) {
    if (Object.hasOwn(stateCounts, state)) stateCounts[state as DetonationRunStatus] += count;
  }
  return {
    key: isNullGroup ? null : key.join(', '),
    runCount,
    verdicts: verdictCounts(verdicts),
    states: stateCounts,
    fileName: firstKey(fileNames),
    sha256: firstKey(hashes),
    alertsTotal: alertsTotal?.value ?? 0,
  };
};

export const searchRunGroups = async ({
  esClient,
  spaceId,
  query,
}: {
  esClient: ElasticsearchClient;
  spaceId: string;
  query: DetonationRunGroupsQuery;
}): Promise<DetonationRunGroupsResponse> => {
  const request = buildRunGroupsQuery(query);
  const response = await esClient
    .search<DetonationRecord, GroupAggregations>({
      index: detonateResultsIndexName(spaceId),
      ignore_unavailable: true,
      allow_no_indices: true,
      track_total_hits: false,
      ...request,
    } as estypes.SearchRequest)
    .catch((error: unknown) => {
      if (isIndexNotFound(error)) return undefined;
      // The time range and parents are validated up front, so a 400 here is the caller's KQL or search only when they sent one.
      if (isResponseError(error) && error.statusCode === 400 && hasUserFilter(query)) {
        throw new InvalidRunsQueryError(`Invalid runs query: ${rejectionReason(error)}`);
      }
      throw error;
    });
  const aggregations = response?.aggregations as GroupAggregations | undefined;
  if (!aggregations) return { groups: [], groupsCount: 0, runsCount: 0 };
  const parsed = parseGroupingQuery<GroupBucket>(
    query.group_by,
    UNIQUE_VALUE,
    aggregations as never
  ) as { groupByFields?: { buckets?: GroupBucket[] } };
  // `@kbn/grouping` caps the offset at `MAX_QUERY_SIZE - size`, so a page past that would repeat the
  // last one. The count is clamped to the groups reachable in whole pages, and the pager never offers them.
  const size = query.size ?? DETONATION_GROUPS_DEFAULT_PAGE_SIZE;
  const reachableGroups = Math.floor(MAX_QUERY_SIZE / size) * size;
  return {
    groups: (parsed.groupByFields?.buckets ?? []).map(toGroup),
    groupsCount: Math.min(aggregations.groupsCount?.value ?? 0, reachableGroups),
    runsCount: aggregations.unitsCount?.value ?? 0,
  };
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { isResponseError } from '@kbn/es-errors';
import type { errors, estypes } from '@elastic/elasticsearch';
import dateMath from '@kbn/datemath';
import moment from 'moment';
import { fromKueryExpression, toElasticsearchQuery } from '@kbn/es-query';
import type { DataViewBase, KueryNode } from '@kbn/es-query';
import {
  DETONATE_VERDICTS,
  DETONATION_RUN_FIELDS,
  DETONATION_RUNS_DEFAULT_PAGE_SIZE,
  DETONATION_STATS_MAX_TREND_BUCKETS,
  DETONATION_STATS_TOP_TERMS_SIZE,
  DETONATION_STATS_UNKNOWN_VERDICT,
  detonateResultsIndexName,
} from '../../common/detonate_prototype';
import type {
  DetonationRecord,
  DetonationRunStatsQuery,
  DetonationRunStatsResponse,
  DetonationRunsQuery,
  DetonationRunsResponse,
  DetonationStatsTerm,
  DetonationStatsVerdictCounts,
} from '../../common/detonate_prototype';
import { isIndexNotFound } from './es_errors';

/** The fields the free-text box matches: hash, name, tag and submitter. */
const SEARCH_FIELDS = ['file.hash.sha256', 'file.name', 'tags', 'detonate.submitter'] as const;

/** A `wildcard` value matches literally except for these; the user's text must not carry any. */
const escapeWildcard = (text: string): string => text.replace(/[\\*?]/g, (char) => `\\${char}`);

/** Thrown for a rejected user filter (unparseable or fieldless KQL, KQL that won't compile, or an Elasticsearch 400 on it); the route answers 400. */
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

const timeRangeFilter = (fromMs?: number, toMs?: number): estypes.QueryDslQueryContainer[] =>
  fromMs === undefined && toMs === undefined
    ? []
    : [
        {
          range: {
            '@timestamp': {
              ...(fromMs === undefined ? {} : { gte: fromMs }),
              ...(toMs === undefined ? {} : { lte: toMs }),
              format: 'epoch_millis',
            },
          },
        },
      ];

const buildRunsFilter = (
  { kql, search }: Pick<DetonationRunsQuery, 'kql' | 'search'>,
  range: estypes.QueryDslQueryContainer[]
): estypes.QueryDslQueryContainer => ({
  bool: {
    // Always pinned: the index also holds alert decisions, and KQL must not widen to them.
    filter: [
      { term: { 'detonate.doc_kind': 'run' } },
      ...(kql?.trim() ? [kqlToQuery(kql)] : []),
      ...(search?.trim() ? [searchQuery(search.trim())] : []),
      ...range,
    ],
  },
});

export const buildRunsQuery = ({
  kql,
  search,
  start,
  end,
}: Pick<
  DetonationRunsQuery,
  'kql' | 'search' | 'start' | 'end'
>): estypes.QueryDslQueryContainer => {
  const startMs = start === undefined ? undefined : resolveStatsTime(start, false);
  const endMs = end === undefined ? undefined : resolveStatsTime(end, true);
  if (startMs !== undefined && endMs !== undefined && endMs < startMs) {
    throw new InvalidRunsQueryError('Invalid time range: start is after end');
  }
  return buildRunsFilter({ kql, search }, timeRangeFilter(startMs, endMs));
};

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

const DAY_MS = 24 * 60 * 60 * 1000;
/** `event.duration` is stored in nanoseconds, as in ECS; the dashboard shows milliseconds. */
const NANOS_PER_MILLI = 1_000_000;

/** UTC, not the server's zone: the trend's day buckets are UTC, so `now/d` must round to the same edge. */
const utcMoment = Object.assign(
  (input?: moment.MomentInput) => moment.utc(input),
  moment
) as typeof moment;

/**
 * `now…` date math, or a strict ISO 8601 date with optional `||<math>`. `dateMath.parse` hands the
 * anchor to a non-strict `moment()`, which reads '12' or 'garbage 2020' as a date (and logs a
 * deprecation warning), so the anchor is checked strictly first. Parsed in UTC, like the trend buckets.
 */
const parseStatsTime = (value: string, roundUp: boolean): moment.Moment | undefined => {
  if (!value.startsWith('now')) {
    const anchor = value.split('||')[0];
    if (!moment.utc(anchor, moment.ISO_8601, true).isValid()) return undefined;
  }
  const parsed = dateMath.parse(value, { roundUp, momentInstance: utcMoment });
  return parsed?.isValid() ? parsed : undefined;
};

/** Resolves an ISO date or date math (`now-30d`) to epoch milliseconds; a range's end rounds up (`now/d` is the day's last millisecond). */
export const resolveStatsTime = (value: string, roundUp: boolean): number => {
  const parsed = parseStatsTime(value, roundUp);
  if (!parsed) throw new InvalidRunsQueryError(`Invalid time: ${value.slice(0, 64)}`);
  return parsed.valueOf();
};

/** The route schema's check, so a bad date is a 400 before any query is built. */
export const statsTimeError = (value: string): string | undefined =>
  parseStatsTime(value, false)
    ? undefined
    : 'must be an ISO 8601 date or date math such as now-30d';

/**
 * The trend is one bucket per day until the range would pass the bucket cap; a longer range gets a
 * whole number of days per bucket (a `fixed_interval`, so buckets align to the epoch, not to calendar
 * weeks or months) so a year-long or all-time range cannot ask Elasticsearch for thousands of buckets.
 */
export const trendIntervalMs = (fromMs: number, toMs: number): number => {
  const rangeDays = Math.max(toMs - fromMs, 0) / DAY_MS;
  // `extended_bounds` can add one bucket at each edge beyond range/interval, hence the - 2.
  return Math.max(1, Math.ceil(rangeDays / (DETONATION_STATS_MAX_TREND_BUCKETS - 2))) * DAY_MS;
};

export const buildRunStatsQuery = ({
  start,
  end,
  kql,
  search,
}: DetonationRunStatsQuery): {
  query: estypes.QueryDslQueryContainer;
  aggs: Record<string, estypes.AggregationsAggregationContainer>;
  intervalMs: number;
} => {
  const startMs = resolveStatsTime(start, false);
  const endMs = resolveStatsTime(end, true);
  if (endMs < startMs) throw new InvalidRunsQueryError('Invalid time range: start is after end');
  const intervalMs = trendIntervalMs(startMs, endMs);
  const verdictTerms = {
    terms: {
      field: 'detonate.verdict',
      // A run with no verdict yet (pending, running, failed) is counted, not dropped.
      missing: DETONATION_STATS_UNKNOWN_VERDICT,
      size: DETONATE_VERDICTS.length + 1,
    },
  };
  return {
    intervalMs,
    query: buildRunsFilter({ kql, search }, timeRangeFilter(startMs, endMs)),
    aggs: {
      verdicts: verdictTerms,
      mean_duration: { avg: { field: 'event.duration' } },
      // Only the production side: diagnostic-only alerts are the sandbox's own noise, not a detection.
      siem_alerts: { sum: { field: 'detonate.alerts.production_detection' } },
      endpoint_alerts: { sum: { field: 'detonate.alerts.production_endpoint' } },
      trend: {
        date_histogram: {
          field: '@timestamp',
          fixed_interval: `${intervalMs / DAY_MS}d`,
          min_doc_count: 0,
          extended_bounds: { min: startMs, max: endMs },
        },
        aggs: { verdicts: verdictTerms },
      },
      top_rules: {
        terms: { field: 'detonate.detection_rule_names', size: DETONATION_STATS_TOP_TERMS_SIZE },
      },
      top_event_codes: {
        terms: { field: 'detonate.endpoint_event_codes', size: DETONATION_STATS_TOP_TERMS_SIZE },
      },
    },
  };
};

const zeroVerdicts = (): DetonationStatsVerdictCounts => ({
  malicious: 0,
  benign: 0,
  inconclusive: 0,
  [DETONATION_STATS_UNKNOWN_VERDICT]: 0,
});

interface TermsBuckets {
  buckets: Array<{ key: string | number; doc_count: number }>;
}

const verdictCounts = (terms: TermsBuckets | undefined): DetonationStatsVerdictCounts => {
  const counts = zeroVerdicts();
  for (const { key, doc_count: count } of terms?.buckets ?? []) {
    // A verdict this build does not know (written by a newer one) still counts, as unknown.
    const verdict = key in counts ? (key as keyof DetonationStatsVerdictCounts) : 'unknown';
    counts[verdict] += count;
  }
  return counts;
};

const topTerms = (terms: TermsBuckets | undefined): DetonationStatsTerm[] =>
  (terms?.buckets ?? []).map(({ key, doc_count: count }) => ({ key: String(key), count }));

const emptyStats = (intervalMs: number): DetonationRunStatsResponse => ({
  total: 0,
  verdicts: zeroVerdicts(),
  meanDurationMs: null,
  alerts: { siem: 0, endpoint: 0 },
  trend: { intervalMs, buckets: [] },
  topRules: [],
  topEventCodes: [],
});

export const searchRunStats = async ({
  esClient,
  spaceId,
  query,
}: {
  esClient: ElasticsearchClient;
  spaceId: string;
  query: DetonationRunStatsQuery;
}): Promise<DetonationRunStatsResponse> => {
  const { query: esQuery, aggs, intervalMs } = buildRunStatsQuery(query);
  const response = await esClient
    .search<DetonationRecord>({
      index: detonateResultsIndexName(spaceId),
      ignore_unavailable: true,
      allow_no_indices: true,
      size: 0,
      track_total_hits: true,
      query: esQuery,
      aggs,
    })
    .catch((error: unknown) => {
      if (isIndexNotFound(error)) return undefined;
      // The time range is validated up front, so a 400 here is the caller's KQL or search only when they sent one.
      if (isResponseError(error) && error.statusCode === 400 && hasUserFilter(query)) {
        throw new InvalidRunsQueryError(`Invalid runs query: ${rejectionReason(error)}`);
      }
      throw error;
    });
  if (!response) return emptyStats(intervalMs);
  const { total } = response.hits;
  const found = response.aggregations as
    | {
        verdicts?: TermsBuckets;
        mean_duration?: { value: number | null };
        siem_alerts?: { value: number | null };
        endpoint_alerts?: { value: number | null };
        trend?: { buckets: Array<{ key: number; doc_count: number; verdicts?: TermsBuckets }> };
        top_rules?: TermsBuckets;
        top_event_codes?: TermsBuckets;
      }
    | undefined;
  const meanNanos = found?.mean_duration?.value;
  return {
    total: typeof total === 'number' ? total : total?.value ?? 0,
    verdicts: verdictCounts(found?.verdicts),
    meanDurationMs: typeof meanNanos === 'number' ? meanNanos / NANOS_PER_MILLI : null,
    alerts: {
      siem: found?.siem_alerts?.value ?? 0,
      endpoint: found?.endpoint_alerts?.value ?? 0,
    },
    trend: {
      intervalMs,
      buckets: (found?.trend?.buckets ?? []).map(({ key, doc_count: count, verdicts }) => ({
        key,
        total: count,
        verdicts: verdictCounts(verdicts),
      })),
    },
    topRules: topTerms(found?.top_rules),
    topEventCodes: topTerms(found?.top_event_codes),
  };
};

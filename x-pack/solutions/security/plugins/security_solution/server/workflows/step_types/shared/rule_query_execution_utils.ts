/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { estypes } from '@elastic/elasticsearch';
import type { EqlHitsEvent } from '@elastic/elasticsearch/lib/api/types';
import { buildEsQuery } from '@kbn/es-query';
import { parseTimeWindowToMs } from '../build_alert_entity_graph_step/time_window';

const TIMESTAMP_FIELD = '@timestamp';

export const computeRelativeTimeRange = (
  timeWindow: string
): { gte: string; lte: string; ms: number } => {
  const ms = parseTimeWindowToMs(timeWindow);
  const lte = Date.now();
  const gte = lte - ms;
  return {
    gte: new Date(gte).toISOString(),
    lte: new Date(lte).toISOString(),
    ms,
  };
};

export const buildTimestampRangeFilter = (
  gte: string,
  lte: string
): estypes.QueryDslQueryContainer => ({
  range: {
    [TIMESTAMP_FIELD]: {
      gte,
      lte,
      format: 'strict_date_optional_time',
    },
  },
});

const indexPatternBase = (indices: string[]) => ({
  title: indices.join(','),
  fields: [],
});

const esQueryConfig = {
  allowLeadingWildcards: true,
  queryStringOptions: { analyze_wildcard: true },
  ignoreFilterIfFieldNotInIndex: true,
  dateFormatTZ: 'Zulu',
} as const;

const benignHeuristicFilter: estypes.QueryDslQueryContainer = {
  bool: {
    should: [{ term: { 'event.outcome': 'success' } }, { term: { 'event.type': 'allowed' } }],
    minimum_should_match: 1,
  },
};

export const countHitsKql = async (params: {
  esClient: ElasticsearchClient;
  indices: string[];
  kql: string;
  timeFilter: estypes.QueryDslQueryContainer;
}): Promise<{ total: number; hits: estypes.SearchHit[] }> => {
  const { esClient, indices, kql, timeFilter } = params;
  const kueryDsl = buildEsQuery(
    indexPatternBase(indices),
    { query: kql, language: 'kuery' },
    [],
    esQueryConfig
  );
  const res = await esClient.search({
    index: indices,
    ignore_unavailable: true,
    allow_no_indices: true,
    track_total_hits: true,
    size: 5,
    _source: false,
    fields: [TIMESTAMP_FIELD],
    query: {
      bool: {
        filter: [timeFilter, kueryDsl],
      },
    },
  });
  const total =
    typeof res.hits.total === 'number'
      ? res.hits.total
      : res.hits.total?.value ?? res.hits.hits.length;
  return { total, hits: res.hits.hits };
};

export const countBenignSubsetKql = async (params: {
  esClient: ElasticsearchClient;
  indices: string[];
  kql: string;
  timeFilter: estypes.QueryDslQueryContainer;
}): Promise<number> => {
  const { esClient, indices, kql, timeFilter } = params;
  const kueryDsl = buildEsQuery(
    indexPatternBase(indices),
    { query: kql, language: 'kuery' },
    [],
    esQueryConfig
  );
  const res = await esClient.search({
    index: indices,
    ignore_unavailable: true,
    allow_no_indices: true,
    track_total_hits: true,
    size: 0,
    query: {
      bool: {
        filter: [timeFilter, kueryDsl, benignHeuristicFilter],
      },
    },
  });
  return typeof res.hits.total === 'number' ? res.hits.total : res.hits.total?.value ?? 0;
};

export const hourlyHistogramKql = async (params: {
  esClient: ElasticsearchClient;
  indices: string[];
  kql: string;
  timeFilter: estypes.QueryDslQueryContainer;
}): Promise<Array<{ key: string; doc_count: number }>> => {
  const { esClient, indices, kql, timeFilter } = params;
  const kueryDsl = buildEsQuery(
    indexPatternBase(indices),
    { query: kql, language: 'kuery' },
    [],
    esQueryConfig
  );
  const res = await esClient.search({
    index: indices,
    ignore_unavailable: true,
    allow_no_indices: true,
    size: 0,
    query: {
      bool: {
        filter: [timeFilter, kueryDsl],
      },
    },
    aggs: {
      by_hour: {
        date_histogram: {
          field: TIMESTAMP_FIELD,
          fixed_interval: '1h',
          min_doc_count: 0,
        },
      },
    },
  });
  const buckets = (
    res.aggregations?.by_hour as {
      buckets?: Array<{ key: number; key_as_string?: string; doc_count: number }>;
    }
  )?.buckets;
  return (buckets ?? []).map((b) => ({
    key: b.key_as_string ?? new Date(b.key).toISOString(),
    doc_count: b.doc_count,
  }));
};

export const countHitsEql = async (params: {
  esClient: ElasticsearchClient;
  indices: string[];
  eql: string;
  timeFilter: estypes.QueryDslQueryContainer;
}): Promise<{ total: number; events: EqlHitsEvent[] }> => {
  const { esClient, indices, eql, timeFilter } = params;
  const res = await esClient.eql.search({
    index: indices.join(','),
    query: eql,
    filter: timeFilter,
    size: 5,
    fields: [{ field: TIMESTAMP_FIELD, format: 'strict_date_optional_time' }],
    timestamp_field: TIMESTAMP_FIELD,
    allow_partial_search_results: true,
  });
  const total = typeof res.hits.total === 'number' ? res.hits.total : res.hits.total?.value ?? 0;
  return { total, events: res.hits.events ?? [] };
};

export const countBenignSubsetEql = async (params: {
  esClient: ElasticsearchClient;
  indices: string[];
  eql: string;
  timeFilter: estypes.QueryDslQueryContainer;
}): Promise<number> => {
  const { esClient, indices, eql, timeFilter } = params;
  const res = await esClient.eql.search({
    index: indices.join(','),
    query: eql,
    filter: {
      bool: {
        must: [timeFilter, benignHeuristicFilter],
      },
    },
    size: 0,
    timestamp_field: TIMESTAMP_FIELD,
    allow_partial_search_results: true,
  });
  return typeof res.hits.total === 'number' ? res.hits.total : res.hits.total?.value ?? 0;
};

/**
 * User-supplied ES|QL is composed into a server-side query string. Without
 * validation, a fragment could inject additional pipe stages (e.g. `| EVAL`,
 * `| DROP`) or break out of the intended `WHERE` clause via `|`, changing
 * semantics or exfiltrating data. We only allow (a) a full query beginning
 * with `FROM`, appended solely with a final `STATS` for the hit count, or
 * (b) a single boolean fragment with no `|` / `;` that is wrapped as
 * `FROM … | WHERE <fragment> | STATS …`.
 */
const ESQL_UNSAFE_PIPE_COMMAND =
  /\|\s*(?:EVAL|DROP|ALTER|ENRICH|DISSECT|GROK|INLINESTATS|LOOKUP|MV_EXPAND|FORK)\b/i;

const assertSafeEsqlForCountHits = (trimmed: string, mode: 'full' | 'fragment') => {
  if (trimmed.includes(';')) {
    throw new Error('ES|QL input must not contain statement separators');
  }
  if (ESQL_UNSAFE_PIPE_COMMAND.test(trimmed)) {
    throw new Error('ES|QL input contains disallowed pipe commands');
  }
  if (mode === 'fragment') {
    if (trimmed.includes('|')) {
      throw new Error('ES|QL WHERE fragment must not contain pipe characters');
    }
  } else {
    if (/\|\s*STATS\b/i.test(trimmed)) {
      throw new Error(
        'ES|QL full query must not include STATS; the server appends the count aggregate'
      );
    }
  }
};

export const countHitsEsql = async (params: {
  esClient: ElasticsearchClient;
  indices: string[];
  esql: string;
  timeFilter: estypes.QueryDslQueryContainer;
}): Promise<{ total: number }> => {
  const { esClient, indices, esql, timeFilter } = params;
  const trimmed = esql.trim();
  const fromList = indices.join(', ');
  const isFullQuery = /^from\s/i.test(trimmed);
  assertSafeEsqlForCountHits(trimmed, isFullQuery ? 'full' : 'fragment');
  const queryBody = isFullQuery
    ? `${trimmed} | STATS total = COUNT(*)`
    : `FROM ${fromList} | WHERE ${trimmed} | STATS total = COUNT(*)`;

  const res = await esClient.esql.query({
    query: queryBody,
    filter: timeFilter,
  });

  const columns = (res as { columns?: Array<{ name?: string }> }).columns ?? [];
  const values = res.values ?? [];
  const totalIdx = columns.findIndex((c) => c.name === 'total');
  if (!values.length || totalIdx < 0) {
    return { total: 0 };
  }
  const cell = (values[0] as unknown[])[totalIdx];
  const total = typeof cell === 'number' ? cell : Number(cell) || 0;
  return { total };
};

export const mapSampleHits = (
  hits: estypes.SearchHit[]
): Array<{ _id: string; _index: string; timestamp?: string }> =>
  hits.slice(0, 5).map((h) => {
    const fields = h.fields as Record<string, unknown[]> | undefined;
    const source = h._source as Record<string, unknown> | undefined;
    const tsRaw = fields?.[TIMESTAMP_FIELD]?.[0] ?? source?.[TIMESTAMP_FIELD];
    return {
      _id: h._id ?? '',
      _index: h._index ?? '',
      timestamp: typeof tsRaw === 'string' ? tsRaw : undefined,
    };
  });

export const mapEqlSampleEvents = (
  events: EqlHitsEvent[]
): Array<{ _id: string; _index: string; timestamp?: string }> =>
  events.slice(0, 5).map((ev) => {
    const fields = ev.fields as Record<string, unknown[]> | undefined;
    const tsRaw =
      fields?.[TIMESTAMP_FIELD]?.[0] ??
      (ev._source as Record<string, unknown> | undefined)?.[TIMESTAMP_FIELD];
    return {
      _id: String(ev._id ?? ''),
      _index: String(ev._index ?? ''),
      timestamp: typeof tsRaw === 'string' ? tsRaw : undefined,
    };
  });

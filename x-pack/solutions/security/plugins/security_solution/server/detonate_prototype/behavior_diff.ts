/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — behavior diff between two runs of the same sample (N2).
 *
 * The sandbox stream is the shared record: once both runs' alerts and events
 * are copied into it (the copy is idempotent), one ES|QL `STATS … BY
 * event.category` per run answers "what did this run do that the previous one
 * did not". ES|QL expands multivalue categories per value, and docs without a
 * category group under a JSON null — verified live — which the diff keeps as
 * an explicit `uncategorized` class, because diagnostic telemetry legitimately
 * carries no category.
 */

import type { ElasticsearchClient } from '@kbn/core/server';

import type { DetonateCategoryCount } from '../../common/detonate_prototype';
import { DETONATE_UNCATEGORIZED } from '../../common/detonate_prototype';

/** Task ids are uuid-shaped; quoting needs no escaping beyond the quotes. */
const quoteString = (value: string): string => `"${value.replace(/"/g, '\\"')}"`;

const isMissingStreamError = (error: unknown, stream: string): boolean => {
  if (!(error instanceof Error) || error.name !== 'ResponseError') return false;
  // ResponseError.message carries only the ES error type; the index name
  // lives in reason / root_cause.
  const errorBody = (error as { meta?: { body?: { error?: unknown } } }).meta?.body?.error;
  if (typeof errorBody !== 'object' || errorBody === null) return false;
  const {
    type,
    reason,
    root_cause: rootCause,
  } = errorBody as {
    type?: unknown;
    reason?: unknown;
    root_cause?: { reason?: unknown }[];
  };
  const namesTheStream = [
    ...(typeof reason === 'string' ? [reason] : []),
    ...(rootCause ?? []).map((cause) => (typeof cause.reason === 'string' ? cause.reason : '')),
  ];
  return (
    (type === 'verification_exception' || error.message.includes('verification_exception')) &&
    namesTheStream.some((r) => r.includes(stream))
  );
};

/**
 * Per-category doc counts for one run, read from the space's sandbox stream.
 * A missing stream or an empty run answers an empty array: a run that copied
 * no telemetry has no categories, which the diff reports as-is.
 */
export const categoryCountsForRun = async (
  esClient: ElasticsearchClient,
  stream: string,
  taskId: string
): Promise<DetonateCategoryCount[]> => {
  let rows: unknown[][];
  try {
    ({ values: rows } = await esClient.esql.query({
      query: `FROM ${stream} | WHERE detonate.task_id == ${quoteString(
        taskId
      )} | STATS count = COUNT(*) BY event.category`,
      format: 'json',
    }));
  } catch (error) {
    // The stream exists once this space's first ingest ran; until then ES|QL
    // verification fails on the unknown index, which is the empty answer.
    if (isMissingStreamError(error, stream)) return [];
    throw error;
  }

  return rows
    .flatMap((row) => {
      const [count, category] = row;
      // The null group is the uncategorized class, not a dropped row.
      if (category === null && typeof count === 'number') {
        return [{ category: DETONATE_UNCATEGORIZED, count }];
      }
      return typeof category === 'string' && typeof count === 'number' ? [{ category, count }] : [];
    })
    .sort((a, b) => a.category.localeCompare(b.category));
};

/** Fold per-run counts into the map `diffCategoryCounts` reads. */
export const countsByCategory = (rows: readonly DetonateCategoryCount[]): Record<string, number> =>
  rows.reduce<Record<string, number>>((map, { category, count }) => {
    map[category] = count;
    return map;
  }, {});

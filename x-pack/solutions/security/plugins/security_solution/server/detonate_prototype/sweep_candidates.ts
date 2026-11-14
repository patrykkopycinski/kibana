/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — the sweep's candidate scan.
 *
 * Detonate state does not live on the alert, and decided alerts stay open, so
 * the newest N open hashes can all be decided while older ones are still not.
 * The scan therefore pages through the open alerts, newest first, and asks the
 * results store about each page's new hashes until it has enough undecided
 * ones or reaches `DETONATE_SWEEP_MAX_PAGES`.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { ElasticsearchClient } from '@kbn/core/server';
import { SPACE_IDS } from '@kbn/rule-data-utils';

import type {
  DetonateSweepCandidates,
  DETONATE_SWEEP_SEVERITIES,
} from '../../common/detonate_prototype';
import {
  DETONATE_SWEEP_MAX_PAGES,
  DETONATE_SWEEP_PAGE_SIZE,
} from '../../common/detonate_prototype';
import { DetonateServiceError } from './client';
import { alertsIndex, isForbidden } from './handoffs';
import { getAlertOutcomes } from './results_store';

const SHA256_FIELD = 'file.hash.sha256';
const SHA256_VALUE = /^[a-fA-F0-9]{64}$/;

export const listSweepCandidates = async ({
  alertsClient,
  resultsClient,
  spaceId,
  severities,
  limit,
  now,
}: {
  /** Reads the alerts as the caller, so the scan sees what the workflow's identity can see. */
  alertsClient: ElasticsearchClient;
  /** Reads the results index; the caller needs no access to it. */
  resultsClient: ElasticsearchClient;
  spaceId: string;
  severities?: ReadonlyArray<(typeof DETONATE_SWEEP_SEVERITIES)[number]>;
  limit: number;
  now?: number;
}): Promise<DetonateSweepCandidates> => {
  const values: Array<[string, string]> = [];
  const seen = new Set<string>();
  let searchAfter: estypes.SortResults | undefined;
  let truncated = false;

  for (let page = 0; values.length < limit; page++) {
    // The page past the bound is a one-hit probe: any hit proves older alerts
    // went unexamined; an empty probe means the scan was exhaustive.
    const atBound = page === DETONATE_SWEEP_MAX_PAGES;

    let hits: estypes.SearchHit[];
    try {
      ({
        hits: { hits },
      } = await alertsClient.search({
        index: alertsIndex(spaceId),
        ignore_unavailable: true,
        allow_no_indices: true,
        size: atBound ? 1 : DETONATE_SWEEP_PAGE_SIZE,
        // `@timestamp` is not unique, so the alert uuid breaks ties and the pages stay stable.
        sort: [
          { '@timestamp': { order: 'desc', unmapped_type: 'date' } },
          { 'kibana.alert.uuid': { order: 'desc', unmapped_type: 'keyword' } },
        ],
        ...(searchAfter ? { search_after: searchAfter } : {}),
        _source: false,
        fields: [SHA256_FIELD],
        query: {
          bool: {
            filter: [
              { term: { [SPACE_IDS]: spaceId } },
              { term: { 'kibana.alert.workflow_status': 'open' } },
              { exists: { field: SHA256_FIELD } },
              ...(severities?.length
                ? [{ terms: { 'kibana.alert.severity': [...severities] } }]
                : []),
            ],
          },
        },
      }));
    } catch (error) {
      if (isForbidden(error)) {
        throw new DetonateServiceError('You cannot read the alerts of this space.', 403);
      }
      throw error;
    }

    if (atBound) {
      truncated = hits.length > 0;
      break;
    }

    // One representative alert per hash: the detonation is per sample, and that alert
    // carries the verdict write-back.
    const fresh = hits.flatMap((hit) => {
      const sha256 = (hit.fields?.[SHA256_FIELD] as unknown[] | undefined)?.find(
        (value): value is string => typeof value === 'string' && SHA256_VALUE.test(value)
      );
      const key = sha256?.toLowerCase();
      if (typeof hit._id !== 'string' || !sha256 || !key || seen.has(key)) return [];
      seen.add(key);
      return [{ alertId: hit._id, sha256 }];
    });

    const outcomes = await getAlertOutcomes(resultsClient, spaceId, fresh, now);
    for (const { alertId, sha256 } of fresh) {
      if (!outcomes.has(alertId)) values.push([alertId, sha256]);
    }

    searchAfter = hits[hits.length - 1]?.sort;
    if (hits.length < DETONATE_SWEEP_PAGE_SIZE || !searchAfter) break;
  }

  return { values: values.slice(0, limit), scanned: seen.size, truncated };
};

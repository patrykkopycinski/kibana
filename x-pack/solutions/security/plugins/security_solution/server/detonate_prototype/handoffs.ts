/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — Worker handoffs.
 *
 * The Hunt and Detection Workers run under service accounts that can neither
 * read nor tag Security alerts, and nothing here touches an alert either. Both
 * operations work on the run's own document in the results index: list the
 * runs waiting for a Worker, and set or clear the handoff markers on one run.
 * Both run as Kibana's internal user against this space's results index only.
 * The alerts a run names come from its `alert:<id>` tags, which
 * `assertReadableAlertTags` checks at submit time.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { estypes } from '@elastic/elasticsearch';
import { SPACE_IDS } from '@kbn/rule-data-utils';

import { DEFAULT_ALERTS_INDEX } from '../../common/constants';
import type {
  DetonateHandoff,
  DetonateHandoffKind,
  DetonateHandoffMarker,
} from '../../common/detonate_prototype';
import {
  DETONATE_HANDOFF_MAX_TASKS,
  detonateResultsIndexName,
  parseAlertTags,
} from '../../common/detonate_prototype';
import { DetonateServiceError } from './client';
import { readField } from './ioc_extraction';
import { setHandoffMarkers } from './results_store';

const alertsIndex = (spaceId: string) => `${DEFAULT_ALERTS_INDEX}-${spaceId}`;

/** Candidates read per page, before runs that are not their alert's newest are dropped. */
const HANDOFF_CANDIDATE_FACTOR = 4;

/** Pages of candidates one list call reads at most, so a long run of superseded runs cannot make it unbounded. */
const HANDOFF_MAX_PAGES = 5;

const DOC_KIND_FIELD = 'detonate.doc_kind';
const ALERT_ID_FIELD = 'detonate.alert_id';
const ORIGIN_ALERTS_FIELD = 'detonate.origin.alert_ids';
const SHA256_FIELD = 'file.hash.sha256';

const handoffField = (kind: DetonateHandoffKind) => `detonate.handoff.${kind}`;

/**
 * An explicit `requested` is its own clause without the `done` exclusion, so a
 * re-request beats an earlier `done`. A malicious run is waiting until its Worker
 * marks it done (or, for coverage, reviewed). A run with a parked rule-creation
 * copy is excluded in the query itself, so in-progress runs never consume the
 * candidate window and hide a valid handoff behind them.
 */
const handoffSelector = (kind: DetonateHandoffKind): estypes.QueryDslQueryContainer => {
  const field = handoffField(kind);
  const finished = kind === 'hunt' ? ['done'] : ['done', 'reviewed'];
  return {
    bool: {
      must_not: [
        { term: { [DOC_KIND_FIELD]: 'alert_decision' } },
        ...(kind === 'coverage' ? [{ term: { [field]: 'in_progress' } }] : []),
      ],
      filter: [
        { exists: { field: SHA256_FIELD } },
        // A run no alert started has nothing for a Worker to act on.
        { exists: { field: ORIGIN_ALERTS_FIELD } },
        {
          bool: {
            minimum_should_match: 1,
            should: [
              { term: { [field]: 'requested' } },
              {
                bool: {
                  filter: [{ term: { 'detonate.verdict': 'malicious' } }],
                  must_not: [{ terms: { [field]: finished } }],
                },
              },
            ],
          },
        },
      ],
    },
  };
};

const isForbidden = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { statusCode?: unknown }).statusCode === 403;

/**
 * Rejects a submit whose `alert:<id>` tags name an alert the caller cannot read
 * in this space. The handoff writes later tag those alerts as the internal
 * user, so the submitter must already be able to see every one of them.
 */
export const assertReadableAlertTags = async ({
  esClient,
  spaceId,
  tags,
}: {
  esClient: ElasticsearchClient;
  spaceId: string;
  tags: readonly string[] | undefined;
}): Promise<void> =>
  assertReadableAlerts({
    esClient,
    spaceId,
    alertIds: parseAlertTags(tags ?? []),
    statusCode: 400,
  });

/**
 * Rejects alert ids the caller cannot read in this space. `esClient` must be the
 * caller's own client: the check is that their privileges reach the alert.
 */
export const assertReadableAlerts = async ({
  esClient,
  spaceId,
  alertIds,
  statusCode = 403,
}: {
  esClient: ElasticsearchClient;
  spaceId: string;
  alertIds: readonly string[];
  statusCode?: 400 | 403;
}): Promise<void> => {
  if (alertIds.length === 0) return;

  // A 400 is a submit whose run carries the tags; a 403 is a request naming the ids directly.
  const subject = statusCode === 400 ? 'The run names' : 'The request names';
  const rejected = (ids: readonly string[]) =>
    new DetonateServiceError(
      `${subject} alerts you cannot read in this space: ${ids.join(', ')}.`,
      statusCode
    );

  let readable: Set<string>;
  try {
    const { hits } = await esClient.search({
      index: alertsIndex(spaceId),
      ignore_unavailable: true,
      size: alertIds.length,
      _source: false,
      query: {
        bool: {
          filter: [{ ids: { values: [...alertIds] } }, { term: { [SPACE_IDS]: spaceId } }],
        },
      },
    });
    readable = new Set(hits.hits.map((hit) => hit._id).filter((id): id is string => id != null));
  } catch (error) {
    if (isForbidden(error)) throw rejected(alertIds);
    throw error;
  }

  const unreadable = alertIds.filter((alertId) => !readable.has(alertId));
  if (unreadable.length > 0) throw rejected(unreadable);
};

const readStrings = (source: unknown, path: string): string[] =>
  readField(source, path).filter((value): value is string => typeof value === 'string');

/**
 * Runs waiting for the given Worker, oldest first. A run counts only while it is
 * the newest one for its alert: an older malicious run of an alert that has since
 * been re-detonated benign is not a handoff. Superseded runs are only known after
 * the newest-run lookup, so the oldest ones can fill a page; the list pages on
 * until it has enough runs, the candidates run out, or `HANDOFF_MAX_PAGES` pages.
 */
export const listHandoffRuns = async ({
  esClient,
  spaceId,
  kind,
}: {
  esClient: ElasticsearchClient;
  spaceId: string;
  kind: DetonateHandoffKind;
}): Promise<DetonateHandoff[]> => {
  const index = detonateResultsIndexName(spaceId);
  const pageSize = DETONATE_HANDOFF_MAX_TASKS * HANDOFF_CANDIDATE_FACTOR;
  const current = new Map<string, DetonateHandoff>();

  for (
    let page = 0;
    page < HANDOFF_MAX_PAGES && current.size < DETONATE_HANDOFF_MAX_TASKS;
    page++
  ) {
    const { hits } = await esClient.search({
      index,
      ignore_unavailable: true,
      allow_no_indices: true,
      from: page * pageSize,
      size: pageSize,
      sort: [{ '@timestamp': { order: 'asc', unmapped_type: 'date' } }],
      _source: [ALERT_ID_FIELD, ORIGIN_ALERTS_FIELD, SHA256_FIELD],
      query: handoffSelector(kind),
    });

    const candidates = hits.hits.flatMap((hit) => {
      const sha256 = readStrings(hit._source, SHA256_FIELD)[0];
      if (typeof hit._id !== 'string' || !sha256) return [];
      const alertId = readStrings(hit._source, ALERT_ID_FIELD)[0];
      const origin = readStrings(hit._source, ORIGIN_ALERTS_FIELD);
      return [
        {
          taskId: hit._id,
          sha256,
          alertId,
          alertIds: alertId ? [...new Set([alertId, ...origin])] : origin,
        },
      ];
    });

    const newestByAlert = await newestRunByAlert(esClient, index, candidates);
    candidates
      .filter(({ alertId, taskId }) => !alertId || newestByAlert.get(alertId) === taskId)
      .forEach(({ taskId, sha256, alertIds }) => {
        current.set(taskId, { task_id: taskId, sha256, alert_ids: alertIds });
      });

    if (hits.hits.length < pageSize) break;
  }

  return [...current.values()].slice(0, DETONATE_HANDOFF_MAX_TASKS);
};

const newestRunByAlert = async (
  esClient: ElasticsearchClient,
  index: string,
  candidates: ReadonlyArray<{ alertId?: string }>
): Promise<Map<string, string>> => {
  const alertIds = [...new Set(candidates.flatMap(({ alertId }) => (alertId ? [alertId] : [])))];
  const newestByAlert = new Map<string, string>();
  if (alertIds.length === 0) return newestByAlert;

  const newest = await esClient.search({
    index,
    ignore_unavailable: true,
    allow_no_indices: true,
    size: alertIds.length,
    _source: false,
    query: {
      bool: {
        must_not: [{ term: { [DOC_KIND_FIELD]: 'alert_decision' } }],
        filter: [{ terms: { [ALERT_ID_FIELD]: alertIds } }],
      },
    },
    sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
    collapse: { field: ALERT_ID_FIELD },
    fields: [ALERT_ID_FIELD],
  });
  newest.hits.hits.forEach((hit) => {
    const [alertId] = readStrings(hit.fields, ALERT_ID_FIELD);
    if (typeof hit._id === 'string' && alertId) newestByAlert.set(alertId, hit._id);
  });
  return newestByAlert;
};

/**
 * Rewrites the handoff markers on one run's document in this space's results
 * index. A run with no document there (another space, or a lost best-effort
 * write) answers 404.
 */
export const setRunHandoffMarkers = async ({
  esClient,
  spaceId,
  taskId,
  add,
  remove,
}: {
  esClient: ElasticsearchClient;
  spaceId: string;
  taskId: string;
  add: readonly DetonateHandoffMarker[];
  remove: readonly DetonateHandoffMarker[];
}): Promise<number> => {
  const found = await setHandoffMarkers({ esClient, spaceId, taskId, add, remove });
  if (!found) throw new DetonateServiceError('The detonation service answered 404.', 404);
  return 1;
};

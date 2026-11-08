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
 * read nor tag Security alerts. These two operations are all they get instead:
 * list the runs whose alerts are waiting for them, and set or clear the four
 * handoff markers on one run's own alerts. Both run as Kibana's internal user
 * against this space's alerts index only.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { estypes } from '@elastic/elasticsearch';
import { ALERT_WORKFLOW_TAGS, SPACE_IDS } from '@kbn/rule-data-utils';

import { DEFAULT_ALERTS_INDEX } from '../../common/constants';
import type {
  DetonateHandoff,
  DetonateHandoffKind,
  DetonateHandoffMarker,
  DetonateTask,
} from '../../common/detonate_prototype';
import {
  DETONATE_COVERAGE_IN_PROGRESS_MARKER,
  DETONATE_HANDOFF_MAX_TASKS,
  detonateHandoffMarkers,
  detonateVerdictTag,
  needsDetonateHandoff,
  parseAlertTags,
} from '../../common/detonate_prototype';
import type { DetonateClient } from './client';
import { getTaskInSpace, listTasksInSpace } from './space_scope';
import { readField } from './ioc_extraction';

const SHA256_FIELD = 'file.hash.sha256';

/** Alerts read per list call, oldest first, before run-less ones are dropped. */
export const HANDOFF_ALERT_SCAN_SIZE = 100;

/** Run lookups issued at once; the service is a single gateway. */
const RUN_LOOKUP_CONCURRENCY = 10;

const alertsIndex = (spaceId: string) => `${DEFAULT_ALERTS_INDEX}-${spaceId}`;

const handoffSelector = (kind: DetonateHandoffKind): estypes.QueryDslQueryContainer => {
  const { requested, done } = detonateHandoffMarkers(kind);
  const waiting = {
    bool: {
      should: [
        { term: { [ALERT_WORKFLOW_TAGS]: requested } },
        {
          bool: {
            filter: [{ term: { [ALERT_WORKFLOW_TAGS]: detonateVerdictTag('malicious') } }],
            must_not: [{ term: { [ALERT_WORKFLOW_TAGS]: done } }],
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
  // A run with a parked rule-creation copy is excluded from the scan itself,
  // not only from the re-check: in-progress alerts must not consume the
  // scan window and hide a valid handoff behind them.
  return kind === 'coverage'
    ? {
        bool: {
          filter: [waiting],
          must_not: [{ term: { [ALERT_WORKFLOW_TAGS]: DETONATE_COVERAGE_IN_PROGRESS_MARKER } }],
        },
      }
    : waiting;
};

const readStrings = (source: unknown, path: string): string[] =>
  readField(source, path).filter((value): value is string => typeof value === 'string');

/** The newest run started from this alert, when it has one in this space. */
const newestRunForAlert = async (
  client: DetonateClient,
  spaceId: string,
  alertId: string
): Promise<DetonateTask | undefined> => {
  const { tasks } = await listTasksInSpace(
    client,
    spaceId,
    { size: 1, order: 'desc' },
    { alertId }
  );
  return tasks.find((task) => parseAlertTags(task.tags).includes(alertId));
};

/**
 * Runs whose alerts wait for the given Worker, oldest alert first. Alerts no
 * run in this space was started from are dropped before the cut, so a backlog
 * of them never hides a valid handoff behind it.
 */
export const listDetonateHandoffs = async ({
  esClient,
  client,
  spaceId,
  kind,
}: {
  esClient: ElasticsearchClient;
  client: DetonateClient;
  spaceId: string;
  kind: DetonateHandoffKind;
}): Promise<DetonateHandoff[]> => {
  const { hits } = await esClient.search({
    index: alertsIndex(spaceId),
    ignore_unavailable: true,
    allow_no_indices: true,
    size: HANDOFF_ALERT_SCAN_SIZE,
    sort: [{ '@timestamp': { order: 'asc', unmapped_type: 'date' } }],
    _source: [SHA256_FIELD, ALERT_WORKFLOW_TAGS],
    query: {
      bool: {
        filter: [
          { term: { [SPACE_IDS]: spaceId } },
          { exists: { field: SHA256_FIELD } },
          handoffSelector(kind),
        ],
      },
    },
  });

  const waiting = hits.hits.filter(
    (hit): hit is typeof hit & { _id: string } =>
      typeof hit._id === 'string' &&
      needsDetonateHandoff(kind, readStrings(hit._source, ALERT_WORKFLOW_TAGS))
  );

  const byTask = new Map<string, DetonateHandoff>();
  for (let start = 0; start < waiting.length; start += RUN_LOOKUP_CONCURRENCY) {
    const chunk = waiting.slice(start, start + RUN_LOOKUP_CONCURRENCY);
    const runs = await Promise.all(chunk.map((hit) => newestRunForAlert(client, spaceId, hit._id)));
    chunk.forEach((hit, index) => {
      const run = runs[index];
      if (!run) return;
      const existing = byTask.get(run.id);
      if (existing) {
        existing.alert_ids.push(hit._id);
      } else if (byTask.size < DETONATE_HANDOFF_MAX_TASKS) {
        const sha256 = run.sample_hash ?? readStrings(hit._source, SHA256_FIELD)[0];
        if (sha256) byTask.set(run.id, { task_id: run.id, sha256, alert_ids: [hit._id] });
      }
    });
    if (byTask.size >= DETONATE_HANDOFF_MAX_TASKS) break;
  }
  return [...byTask.values()];
};

/** Removes, then adds; tolerates alerts that never had workflow tags. */
const HANDOFF_MARKERS_SCRIPT = `List tags = new ArrayList();
if (ctx._source["${ALERT_WORKFLOW_TAGS}"] != null) {
  for (tag in ctx._source["${ALERT_WORKFLOW_TAGS}"]) {
    if (!params.tagsToRemove.contains(tag)) {
      tags.add(tag);
    }
  }
}
for (tag in params.tagsToAdd) {
  if (!tags.contains(tag)) {
    tags.add(tag);
  }
}
ctx._source["${ALERT_WORKFLOW_TAGS}"] = tags;`;

/**
 * Rewrites the handoff markers on the alerts one run was started from, and on
 * no other alert: the targets come from the run's own `alert:<id>` tags, and
 * must also sit in this space's alerts index.
 */
export const setDetonateHandoffMarkers = async ({
  esClient,
  client,
  spaceId,
  taskId,
  add,
  remove,
}: {
  esClient: ElasticsearchClient;
  client: DetonateClient;
  spaceId: string;
  taskId: string;
  add: readonly DetonateHandoffMarker[];
  remove: readonly DetonateHandoffMarker[];
}): Promise<number> => {
  const task = await getTaskInSpace(client, taskId, spaceId);
  const alertIds = parseAlertTags(task.tags);
  if (alertIds.length === 0) return 0;

  const response = await esClient.updateByQuery({
    index: alertsIndex(spaceId),
    ignore_unavailable: true,
    allow_no_indices: true,
    conflicts: 'proceed',
    refresh: true,
    query: {
      bool: {
        filter: [{ terms: { _id: alertIds } }, { term: { [SPACE_IDS]: spaceId } }],
      },
    },
    script: {
      lang: 'painless',
      source: HANDOFF_MARKERS_SCRIPT,
      params: { tagsToAdd: [...new Set(add)], tagsToRemove: [...new Set(remove)] },
    },
  });
  return response.updated ?? 0;
};

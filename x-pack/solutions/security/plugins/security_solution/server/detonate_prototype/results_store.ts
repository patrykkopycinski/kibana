/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { isResponseError } from '@kbn/es-errors';

import {
  DETONATE_MAX_FAILED_RUNS,
  DETONATE_RESULTS_INDEX_PREFIX,
  DETONATE_RESULTS_TEMPLATE_NAME,
  DETONATE_TERMINAL_DECISION_STATES,
  DETONATE_TRANSIENT_DECISION_TTL_MS,
  detonateResultsIndexName,
} from '../../common/detonate_prototype';
import type {
  DetonateAlertOutcome,
  DetonateDecisionState,
  DetonateHandoffMarker,
  DetonateVerdictName,
} from '../../common/detonate_prototype';
import { DETONATION_RECORD_FIELDS } from './detonation_record';
import type {
  AlertDecisionRecord,
  DetonationRecord,
  DetonationRecordFieldType,
} from './detonation_record';

/**
 * Keyword values past this length stay in `_source` but are not indexed, so one
 * long evidence string cannot make the whole document fail to index.
 */
const KEYWORD_IGNORE_ABOVE = 2048;

type Mapping = Record<
  string,
  { type?: DetonationRecordFieldType; ignore_above?: number; properties?: Mapping }
>;

/** Dotted record fields as nested `properties`, as Elasticsearch stores them. */
const buildMappingProperties = (): Mapping => {
  const properties: Mapping = {};
  Object.entries(DETONATION_RECORD_FIELDS).forEach(([path, type]) => {
    const keys = path.split('.');
    let node = properties;
    keys.slice(0, -1).forEach((key) => {
      node[key] = node[key] ?? { properties: {} };
      node = node[key].properties as Mapping;
    });
    node[keys[keys.length - 1]] =
      type === 'keyword' ? { type, ignore_above: KEYWORD_IGNORE_ABOVE } : { type };
  });
  return properties;
};

/** A plain hidden index per space, not a data stream: documents are upserted by task id. */
export const resultsIndexTemplate = (): estypes.IndicesPutIndexTemplateRequest => ({
  name: DETONATE_RESULTS_TEMPLATE_NAME,
  index_patterns: [`${DETONATE_RESULTS_INDEX_PREFIX}*`],
  priority: 500,
  _meta: { managed_by: 'security_solution', description: 'Detonate prototype run results' },
  template: {
    settings: { 'index.hidden': true },
    mappings: { dynamic: false, properties: buildMappingProperties() },
  },
});

/**
 * Both results-index writes run on the request path's heels, so a slow or
 * unreachable cluster must give up quickly instead of holding the connection
 * through the client's 30s timeout and its retries.
 */
const WRITE_TRANSPORT_OPTIONS = { requestTimeout: 2000, maxRetries: 0 } as const;

/** Overwrites rather than create-if-absent, so the template always matches this code. */
export const installResultsTemplate = async (esClient: ElasticsearchClient): Promise<void> => {
  await esClient.indices.putIndexTemplate(resultsIndexTemplate(), WRITE_TRANSPORT_OPTIONS);
};

/**
 * Writes one run's document, keyed by task id. A partial record merges into the
 * existing document, so fields only an earlier write knew (the submit origin)
 * survive a later write that does not carry them.
 */
export const upsertDetonationRecord = async (
  esClient: ElasticsearchClient,
  spaceId: string,
  record: DetonationRecord
): Promise<void> => {
  await esClient.update(
    {
      index: detonateResultsIndexName(spaceId),
      id: record['detonate.task_id'],
      doc: record,
      doc_as_upsert: true,
    },
    WRITE_TRANSPORT_OPTIONS
  );
};

/**
 * Writes the workflow steps wait on. A failure fails the step, so these get a
 * longer budget than the best-effort run write, and one retry: every write here
 * is idempotent, so a repeated request is safe.
 */
const AWAITED_TRANSPORT_OPTIONS = { requestTimeout: 10000, maxRetries: 1 } as const;

const isIndexNotFound = (error: unknown): boolean =>
  isResponseError(error) &&
  (error.statusCode === 404 || error.body?.error?.type === 'index_not_found_exception');

/**
 * The template only shapes indices created after it, and `dynamic: false` stores
 * a field it does not know without making it searchable, so a space index that
 * predates a field would silently not match queries on it. Mapping updates are
 * additive and idempotent.
 */
export const ensureResultsMapping = async (
  esClient: ElasticsearchClient,
  spaceId: string
): Promise<void> => {
  try {
    await esClient.indices.putMapping(
      { index: detonateResultsIndexName(spaceId), properties: buildMappingProperties() },
      WRITE_TRANSPORT_OPTIONS
    );
  } catch (error) {
    // The first write creates the index from the template, which is already current.
    if (!isIndexNotFound(error)) throw error;
  }
};

export type EnsureResultsIndex = (esClient: ElasticsearchClient, spaceId: string) => Promise<void>;

/**
 * Installs the template once per process and updates each space's mapping once.
 * A failed step is forgotten so the next call retries it.
 */
export const createResultsIndexEnsurer = (): EnsureResultsIndex => {
  let template: Promise<void> | undefined;
  const mappings = new Map<string, Promise<void>>();

  return async (esClient, spaceId) => {
    template =
      template ??
      installResultsTemplate(esClient).catch((error) => {
        template = undefined;
        throw error;
      });
    await template;

    const mapping =
      mappings.get(spaceId) ??
      ensureResultsMapping(esClient, spaceId).catch((error) => {
        mappings.delete(spaceId);
        throw error;
      });
    mappings.set(spaceId, mapping);
    await mapping;
  };
};

export interface AlertDecisionInput {
  alertId: string;
  state: DetonateDecisionState;
  verdict?: DetonateVerdictName;
  taskId?: string;
  sha256?: string;
  reason?: string;
  executionId?: string;
}

const toAlertDecisionRecord = (
  spaceId: string,
  decision: AlertDecisionInput,
  now: Date
): AlertDecisionRecord => ({
  '@timestamp': now.toISOString(),
  'detonate.doc_kind': 'alert_decision',
  'detonate.alert_id': decision.alertId,
  'detonate.decision.state': decision.state,
  'detonate.space_id': spaceId,
  ...(decision.reason ? { 'detonate.decision.reason': decision.reason } : {}),
  ...(decision.verdict ? { 'detonate.verdict': decision.verdict } : {}),
  ...(decision.taskId ? { 'detonate.task_id': decision.taskId } : {}),
  ...(decision.sha256 ? { 'file.hash.sha256': decision.sha256.toLowerCase() } : {}),
  ...(decision.executionId ? { 'detonate.workflow.execution_id': decision.executionId } : {}),
});

/**
 * A release clears a claim; it must not undo a decision made while the claim was
 * held, because the always-run release step fires after the verdict is applied.
 */
const RELEASE_SCRIPT = `if (params.terminal.contains(ctx._source['detonate.decision.state'])) {
  ctx.op = 'noop';
} else {
  ctx._source['detonate.decision.state'] = params.doc['detonate.decision.state'];
  ctx._source['@timestamp'] = params.doc['@timestamp'];
  if (params.doc['detonate.decision.reason'] != null) {
    ctx._source['detonate.decision.reason'] = params.doc['detonate.decision.reason'];
  }
}`;

/**
 * Awaited, unlike the run write: a decision the sweep depends on that was not
 * stored would let the alert be picked again, so any failure throws. Each document
 * is keyed by alert id and merges into the previous decision for that alert.
 */
export const writeAlertDecisions = async (
  esClient: ElasticsearchClient,
  spaceId: string,
  decisions: readonly AlertDecisionInput[],
  now: Date = new Date()
): Promise<number> => {
  if (decisions.length === 0) return 0;
  const index = detonateResultsIndexName(spaceId);

  const operations = decisions.flatMap<
    | estypes.BulkOperationContainer
    | estypes.BulkUpdateAction<AlertDecisionRecord, AlertDecisionRecord>
  >((decision) => {
    const doc = toAlertDecisionRecord(spaceId, decision, now);
    const action = { update: { _index: index, _id: decision.alertId } };
    return decision.state === 'released'
      ? [
          action,
          {
            script: {
              lang: 'painless',
              source: RELEASE_SCRIPT,
              params: { terminal: [...DETONATE_TERMINAL_DECISION_STATES], doc },
            },
            upsert: doc,
          },
        ]
      : [action, { doc, doc_as_upsert: true }];
  });

  const response = await esClient.bulk({ operations }, AWAITED_TRANSPORT_OPTIONS);
  if (response.errors) {
    const failed = response.items.flatMap((item) => {
      const error = item.update?.error;
      return error ? [`${item.update?._id}: ${error.type}: ${error.reason}`] : [];
    });
    throw new Error(
      `Could not write ${failed.length} of ${decisions.length} alert decisions: ${failed
        .slice(0, 3)
        .join('; ')}`
    );
  }
  return decisions.length;
};

export interface AlertOutcomeQuery {
  alertId: string;
  /** Lets a finished run of any sibling alert with the same sample count for this one. */
  sha256?: string;
}

interface LatestCompletedRun {
  latest: { hits: { hits: Array<{ _source?: Partial<DetonationRecord> }> } };
}

interface OutcomeAggregations {
  by_alert: {
    buckets: Array<{
      key: string;
      completed: { doc_count: number } & LatestCompletedRun;
      failed: { doc_count: number };
    }>;
  };
  by_hash: {
    buckets: Array<{ key: string; completed: { doc_count: number } & LatestCompletedRun }>;
  };
}

const completedOutcome = (
  completed: { doc_count: number } & LatestCompletedRun
): DetonateAlertOutcome | undefined => {
  if (completed.doc_count === 0) return undefined;
  const run = completed.latest.hits.hits[0]?._source;
  return {
    state: 'completed',
    ...(run?.['detonate.verdict'] ? { verdict: run['detonate.verdict'] } : {}),
    ...(run?.['detonate.task_id'] ? { task_id: run['detonate.task_id'] } : {}),
  };
};

const isTerminalDecision = (state: DetonateDecisionState): boolean =>
  (DETONATE_TERMINAL_DECISION_STATES as readonly string[]).includes(state);

/**
 * The alerts a sweep must leave alone, and why. An alert is absent from the result
 * when nothing is recorded against it or the record does not exclude it:
 *  - a terminal decision (E1);
 *  - a `queued` or `running` decision newer than the transient TTL (E2), so a claim
 *    whose release never ran stops excluding on its own; `released` never excludes;
 *  - a completed run for the alert, or for its sample hash (E3);
 *  - at least `DETONATE_MAX_FAILED_RUNS` failed runs for the alert itself (E4). A
 *    hash is not capped, because another alert with that hash is a fair retry.
 */
export const getAlertOutcomes = async (
  esClient: ElasticsearchClient,
  spaceId: string,
  alerts: readonly AlertOutcomeQuery[],
  now: number = Date.now()
): Promise<Map<string, DetonateAlertOutcome>> => {
  const outcomes = new Map<string, DetonateAlertOutcome>();
  if (alerts.length === 0) return outcomes;

  const index = detonateResultsIndexName(spaceId);
  const alertIds = [...new Set(alerts.map(({ alertId }) => alertId))];
  const hashes = [
    ...new Set(alerts.flatMap(({ sha256 }) => (sha256 ? [sha256.toLowerCase()] : []))),
  ];

  const latestCompleted = {
    filter: { term: { 'detonate.state': 'complete' } },
    aggs: {
      latest: {
        top_hits: {
          size: 1,
          sort: [{ '@timestamp': 'desc' as const }],
          _source: ['detonate.verdict', 'detonate.task_id'],
        },
      },
    },
  };

  const [decisions, runs] = await Promise.all([
    esClient.mget<Partial<AlertDecisionRecord>>(
      {
        index,
        ids: alertIds,
        _source: [
          'detonate.doc_kind',
          'detonate.decision.state',
          '@timestamp',
          'detonate.verdict',
          'detonate.task_id',
        ],
      },
      AWAITED_TRANSPORT_OPTIONS
    ),
    esClient.search<unknown, OutcomeAggregations>(
      {
        index,
        size: 0,
        ignore_unavailable: true,
        allow_no_indices: true,
        query: {
          bool: {
            must_not: [{ term: { 'detonate.doc_kind': 'alert_decision' } }],
            filter: [
              {
                bool: {
                  minimum_should_match: 1,
                  should: [
                    { terms: { 'detonate.alert_id': alertIds } },
                    ...(hashes.length > 0 ? [{ terms: { 'file.hash.sha256': hashes } }] : []),
                  ],
                },
              },
            ],
          },
        },
        aggs: {
          by_alert: {
            terms: { field: 'detonate.alert_id', size: alertIds.length, include: alertIds },
            aggs: {
              completed: latestCompleted,
              failed: { filter: { term: { 'detonate.state': 'failed' } } },
            },
          },
          by_hash: {
            terms: {
              field: 'file.hash.sha256',
              size: Math.max(hashes.length, 1),
              include: hashes,
            },
            aggs: { completed: latestCompleted },
          },
        },
      },
      AWAITED_TRANSPORT_OPTIONS
    ),
  ]);

  const decisionByAlert = new Map<string, Partial<AlertDecisionRecord>>();
  decisions.docs.forEach((doc) => {
    if ('error' in doc) {
      if (doc.error.type !== 'index_not_found_exception') {
        throw new Error(`Could not read alert decisions: ${doc.error.type}: ${doc.error.reason}`);
      }
      return;
    }
    // A run document can share an id with an alert only by accident; it is not a decision.
    if (doc.found && doc._source?.['detonate.doc_kind'] === 'alert_decision') {
      decisionByAlert.set(doc._id, doc._source);
    }
  });

  const runsByAlert = new Map(
    (runs.aggregations?.by_alert.buckets ?? []).map((bucket) => [bucket.key, bucket])
  );
  const completedByHash = new Map(
    (runs.aggregations?.by_hash.buckets ?? []).map((bucket) => [bucket.key, bucket.completed])
  );

  alerts.forEach(({ alertId, sha256 }) => {
    if (outcomes.has(alertId)) return;

    const decision = decisionByAlert.get(alertId);
    const state = decision?.['detonate.decision.state'];
    if (decision && state) {
      const timestamp = Date.parse(decision['@timestamp'] ?? '');
      const fresh =
        Number.isFinite(timestamp) && now - timestamp < DETONATE_TRANSIENT_DECISION_TTL_MS;
      if (isTerminalDecision(state) || ((state === 'queued' || state === 'running') && fresh)) {
        outcomes.set(alertId, {
          state,
          ...(decision['detonate.verdict'] ? { verdict: decision['detonate.verdict'] } : {}),
          ...(decision['detonate.task_id'] ? { task_id: decision['detonate.task_id'] } : {}),
        });
        return;
      }
    }

    const alertRuns = runsByAlert.get(alertId);
    const hashRuns = sha256 ? completedByHash.get(sha256.toLowerCase()) : undefined;
    const completed =
      (alertRuns && completedOutcome(alertRuns.completed)) ||
      (hashRuns && completedOutcome(hashRuns));
    if (completed) {
      outcomes.set(alertId, completed);
      return;
    }

    if (alertRuns && alertRuns.failed.doc_count >= DETONATE_MAX_FAILED_RUNS) {
      outcomes.set(alertId, { state: 'retry_capped' });
    }
  });

  return outcomes;
};

const HANDOFF_MARKER_FIELDS: Readonly<
  Record<DetonateHandoffMarker, { field: string; value: string }>
> = {
  'detonate:hunt-requested': { field: 'detonate.handoff.hunt', value: 'requested' },
  'detonate:hunt-done': { field: 'detonate.handoff.hunt', value: 'done' },
  'detonate:coverage-requested': { field: 'detonate.handoff.coverage', value: 'requested' },
  'detonate:coverage-reviewed': { field: 'detonate.handoff.coverage', value: 'reviewed' },
  'detonate:coverage-in-progress': { field: 'detonate.handoff.coverage', value: 'in_progress' },
};

/** Removes, then adds, so a marker named in both ends up set; tolerates a field never written. */
const HANDOFF_MARKERS_SCRIPT = `for (change in params.remove) {
  def current = ctx._source[change.field];
  if (current != null) {
    List kept = new ArrayList();
    for (value in (current instanceof List ? current : [current])) {
      if (value != change.value) {
        kept.add(value);
      }
    }
    ctx._source[change.field] = kept;
  }
}
for (change in params.add) {
  def current = ctx._source[change.field];
  List values = current == null ? new ArrayList() : new ArrayList(current instanceof List ? current : [current]);
  if (!values.contains(change.value)) {
    values.add(change.value);
  }
  ctx._source[change.field] = values;
}`;

/**
 * Rewrites a run's handoff markers on its own document. It never creates one: a
 * run whose best-effort write was lost has nothing to mark, and the caller
 * reports that rather than inventing a document with no run fields.
 */
export const setHandoffMarkers = async ({
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
}): Promise<boolean> => {
  try {
    await esClient.update(
      {
        index: detonateResultsIndexName(spaceId),
        id: taskId,
        refresh: true,
        script: {
          lang: 'painless',
          source: HANDOFF_MARKERS_SCRIPT,
          params: {
            add: [...new Set(add)].map((marker) => HANDOFF_MARKER_FIELDS[marker]),
            remove: [...new Set(remove)].map((marker) => HANDOFF_MARKER_FIELDS[marker]),
          },
        },
      },
      AWAITED_TRANSPORT_OPTIONS
    );
    return true;
  } catch (error) {
    if (isIndexNotFound(error)) return false;
    throw error;
  }
};

/**
 * Best-effort and at-most-once per call: a failed or timed-out write is not retried,
 * and the origin fields live only on the submit write, so losing it loses them for good.
 */
export type RecordRun = (spaceId: string, buildRecord: () => DetonationRecord) => Promise<void>;

/**
 * The one writer every surface shares. It writes as the internal user, so each
 * caller must have checked the analyst's space and privileges first. A failure
 * only logs: what the analyst sees never depends on the results index. The
 * record is built inside the guard so a task the mapper cannot read is not an
 * error for the caller either.
 */
export const createRunRecorder = ({
  getInternalEsClient,
  logger,
}: {
  getInternalEsClient: () => Promise<ElasticsearchClient>;
  logger: Logger;
}): RecordRun => {
  const ensureResultsIndex = createResultsIndexEnsurer();

  return async (spaceId, buildRecord) => {
    let taskId: string | undefined;
    try {
      const record = buildRecord();
      taskId = record['detonate.task_id'];
      const esClient = await getInternalEsClient();
      await ensureResultsIndex(esClient, spaceId);
      await upsertDetonationRecord(esClient, spaceId, record);
    } catch (error) {
      logger.warn(
        `Detonation ${taskId ?? 'unknown'}: could not write the results document: ${error}`
      );
    }
  };
};

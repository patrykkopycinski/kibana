/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';

import {
  ARGUS_ARTIFACT_RELATED_KINDS,
  ARGUS_SOC_INDICES,
  ARTIFACT_DETAILS_ROUTE,
  type ArgusArtifactDetails,
  type ArgusArtifactRelated,
  type ArgusArtifactRelatedKind,
  type ArgusEventSample,
  type ArgusEventSampleClassification,
  type ArgusMutationDetailBacktest,
  type DetailRawBacktestDoc,
  type DetailRawOutcomeDoc,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';
import { fetchPostApplyObservation } from '../fetch_post_apply_observation';

/**
 * Allow-list of source indices the route is willing to read. We restrict to
 * the curated `.soc-*` indices the ARGUS console owns plus the standard
 * Security Solution alerts index (used by telemetry-layer activity events).
 *
 * The list uses index patterns — `.alerts-security.alerts-*` catches both
 * default and per-space alert indices without opening up arbitrary reads.
 *
 * The `.ds-…` variants match data-stream backing indices. When callers pass
 * `_index` straight from a search hit (e.g. `outcome._index`) the value is
 * the backing-index name (e.g. `.ds-.soc-outcomes-2026.04.15-000001`), not
 * the data stream alias, so we have to accept both shapes.
 */
const ALLOWED_SOURCE_INDEX_PATTERNS: readonly RegExp[] = [
  /^\.soc-[a-z0-9-]+$/,
  /^\.ds-\.soc-[a-z0-9.-]+$/,
  /^\.alerts-security\.alerts(-[a-z0-9-]+)?$/,
  /^\.ds-\.alerts-security\.alerts-[a-z0-9.-]+$/,
];

const ALL_RELATED_KINDS = new Set<ArgusArtifactRelatedKind>(ARGUS_ARTIFACT_RELATED_KINDS);

const querySchema = schema.object({
  source_index: schema.string({ minLength: 1, maxLength: 256 }),
  source_doc_id: schema.string({ minLength: 1, maxLength: 1024 }),
  /**
   * Optional CSV list of related-entity lookups to perform. Omit to request
   * the full set.
   */
  include_related: schema.maybe(schema.string({ minLength: 0, maxLength: 256 })),
});

export const registerArtifactDetailsRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: ARTIFACT_DETAILS_ROUTE,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution'],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: { request: { query: querySchema } },
      },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);
        try {
          const sourceIndex = request.query.source_index;
          const sourceDocId = request.query.source_doc_id;

          if (!isAllowedSourceIndex(sourceIndex)) {
            return siemResponse.error({
              statusCode: 400,
              body: `source_index "${sourceIndex}" is not readable by this route`,
            });
          }

          const includeRelated = parseIncludeRelated(request.query.include_related);
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;

          const rawDocument = await fetchRawDocument(esClient, sourceIndex, sourceDocId);

          if (!rawDocument) {
            const payload: ArgusArtifactDetails = {
              reason_code: 'not_found',
              source_index: sourceIndex,
              source_doc_id: sourceDocId,
            };
            return response.ok({ body: payload });
          }

          const related = await fetchRelated(esClient, logger, rawDocument, includeRelated);

          const payload: ArgusArtifactDetails = {
            reason_code: 'ok',
            source_index: sourceIndex,
            source_doc_id: sourceDocId,
            raw_document: rawDocument,
            ...(Object.keys(related).length > 0 ? { related } : {}),
          };
          return response.ok({ body: payload });
        } catch (err) {
          const error = transformError(err);
          logger.error(`ARGUS artifact_details route failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};

const isAllowedSourceIndex = (index: string): boolean =>
  ALLOWED_SOURCE_INDEX_PATTERNS.some((pattern) => pattern.test(index));

const parseIncludeRelated = (raw: string | undefined): ReadonlySet<ArgusArtifactRelatedKind> => {
  if (!raw) return ALL_RELATED_KINDS;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return ALL_RELATED_KINDS;
  const filtered = parts.filter((p): p is ArgusArtifactRelatedKind =>
    ALL_RELATED_KINDS.has(p as ArgusArtifactRelatedKind)
  );
  return new Set(filtered);
};

/**
 * Single-doc lookup. Uses `get` for exact id match, falling back to a
 * filtered search when the id is synthetic (composite keys can appear in
 * documents that were seeded without a deterministic `_id`).
 *
 * `ignore_unavailable: true` on the search fallback keeps cold-start
 * clusters from 404'ing when an index alias is missing.
 */
const fetchRawDocument = async (
  esClient: ElasticsearchClient,
  index: string,
  id: string
): Promise<Record<string, unknown> | undefined> => {
  try {
    const res = await esClient.get<Record<string, unknown>>({ index, id });
    if (res.found && res._source) return res._source;
  } catch (err) {
    // 404 from `get` is expected when the doc id is an alias/rec_id rather
    // than the raw `_id`. 400 comes back when `index` is a data-stream alias
    // (e.g. `.soc-outcomes`) because `get` isn't supported on data streams —
    // fall through to the search fallback, which targets the alias directly.
    const status = (err as { statusCode?: number; meta?: { statusCode?: number } })?.statusCode;
    const metaStatus = (err as { meta?: { statusCode?: number } })?.meta?.statusCode;
    const httpStatus = status ?? metaStatus;
    if (httpStatus !== 404 && httpStatus !== 400) throw err;
  }

  const fallback = await esClient.search<Record<string, unknown>>({
    index,
    ignore_unavailable: true,
    size: 1,
    query: {
      bool: {
        should: [
          { term: { _id: id } },
          { term: { 'rec_id.keyword': id } },
          { term: { rec_id: id } },
          { term: { 'mutation_intent_id.keyword': id } },
          { term: { mutation_intent_id: id } },
          { term: { 'rule_id.keyword': id } },
          { term: { rule_id: id } },
          { term: { 'edge_id.keyword': id } },
        ],
        minimum_should_match: 1,
      },
    },
  });

  return fallback.hits.hits[0]?._source ?? undefined;
};

const fetchRelated = async (
  esClient: ElasticsearchClient,
  logger: Logger,
  raw: Record<string, unknown>,
  include: ReadonlySet<ArgusArtifactRelatedKind>
): Promise<ArgusArtifactRelated> => {
  const ruleId = readRuleId(raw);
  let mutationIntentId = readMutationIntentId(raw);
  const runId = readRunId(raw);
  const alertId = readAlertId(raw);
  const actorId = readActorId(raw);

  // Autonomy decision docs (and some outcome variants) don't carry a
  // `mutation_intent_id` directly — they only name the rule via `artifact_id`
  // / `rule_id`. Resolve the intent chain once up front so
  // `mutation_intent` / `outcome` / `backtest` / `post_apply_observation`
  // all share the same derivation instead of each re-querying independently.
  if (!mutationIntentId && ruleId) {
    try {
      mutationIntentId = await fetchMutationIntentIdForRule(esClient, ruleId);
    } catch (err) {
      logger.warn(
        `ARGUS artifact_details: rule_id → mutation_intent_id lookup failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  const tasks: Array<Promise<Partial<ArgusArtifactRelated>>> = [];
  if (include.has('rule') && ruleId) tasks.push(fetchRule(esClient, ruleId));
  if (include.has('mutation_intent') && mutationIntentId)
    tasks.push(fetchMutationIntent(esClient, mutationIntentId));
  if (include.has('reasoning_trace') && runId) tasks.push(fetchReasoningTrace(esClient, runId));
  if (include.has('outcome') && mutationIntentId)
    tasks.push(fetchOutcome(esClient, mutationIntentId));
  if (include.has('alert') && alertId) tasks.push(fetchAlert(esClient, alertId));
  if (include.has('actor') && actorId) tasks.push(fetchActor(esClient, actorId));
  if (include.has('backtest') && mutationIntentId)
    tasks.push(fetchBacktestRelated(esClient, mutationIntentId, ruleId ?? null));
  if (include.has('post_apply_observation') && mutationIntentId)
    tasks.push(
      fetchPostApplyObservationRelated(esClient, logger, mutationIntentId, ruleId ?? null)
    );

  const settled = await Promise.allSettled(tasks);
  return settled.reduce<ArgusArtifactRelated>((acc, result) => {
    if (result.status === 'fulfilled') return { ...acc, ...result.value };
    return acc;
  }, {});
};

/**
 * Find the most recent `.soc-mutation-intents` doc referencing this rule and
 * return its `mutation_intent_id`. Used as a fallback seed for autonomy
 * decisions (and any other source doc that only carries a rule reference).
 * Returns `undefined` when no intent exists for the rule — the caller just
 * skips the intent-scoped related lookups, matching the behaviour when the
 * raw doc had no mutation_intent_id to begin with.
 */
const fetchMutationIntentIdForRule = async (
  esClient: ElasticsearchClient,
  ruleId: string
): Promise<string | undefined> => {
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.mutationIntents,
    ignore_unavailable: true,
    size: 1,
    sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
    query: {
      bool: {
        should: [{ term: { 'rule_id.keyword': ruleId } }, { term: { rule_id: ruleId } }],
        minimum_should_match: 1,
      },
    },
  });
  const source = res.hits.hits[0]?._source;
  return readString(source?.mutation_intent_id);
};

const fetchRule = async (
  esClient: ElasticsearchClient,
  ruleId: string
): Promise<Partial<ArgusArtifactRelated>> => {
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.recommendations,
    ignore_unavailable: true,
    size: 1,
    query: {
      bool: {
        should: [
          { term: { 'rule_id.keyword': ruleId } },
          { term: { rule_id: ruleId } },
          { term: { 'rec_id.keyword': ruleId } },
          { term: { rec_id: ruleId } },
        ],
        minimum_should_match: 1,
      },
    },
  });
  const hit = res.hits.hits[0];
  if (!hit?._source) return {};
  const source = hit._source;
  const name = readString(source.title) ?? readString(source.summary) ?? ruleId;
  return {
    rule: {
      id: ruleId,
      name,
      index: ARGUS_SOC_INDICES.recommendations,
    },
  };
};

const fetchMutationIntent = async (
  esClient: ElasticsearchClient,
  id: string
): Promise<Partial<ArgusArtifactRelated>> => {
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.mutationIntents,
    ignore_unavailable: true,
    size: 1,
    query: {
      bool: {
        should: [
          { term: { 'mutation_intent_id.keyword': id } },
          { term: { mutation_intent_id: id } },
        ],
        minimum_should_match: 1,
      },
    },
  });
  const source = res.hits.hits[0]?._source;
  if (!source) return {};
  const summary = readString(source.label) ?? readString(source.status) ?? id;
  return { mutation_intent: { id, summary } };
};

const fetchReasoningTrace = async (
  esClient: ElasticsearchClient,
  runId: string
): Promise<Partial<ArgusArtifactRelated>> => {
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.reasoningTrace,
    ignore_unavailable: true,
    size: 0,
    query: {
      bool: {
        should: [{ term: { 'run_id.keyword': runId } }, { term: { run_id: runId } }],
        minimum_should_match: 1,
      },
    },
    track_total_hits: true,
  });
  const total = typeof res.hits.total === 'number' ? res.hits.total : res.hits.total?.value ?? 0;
  if (total === 0) return {};
  return { reasoning_trace: { run_id: runId, steps: total } };
};

const fetchOutcome = async (
  esClient: ElasticsearchClient,
  mutationIntentId: string
): Promise<Partial<ArgusArtifactRelated>> => {
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.outcomes,
    ignore_unavailable: true,
    size: 1,
    sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
    query: {
      bool: {
        should: [
          { term: { 'correlation_id.keyword': mutationIntentId } },
          { term: { correlation_id: mutationIntentId } },
          { term: { 'mutation_intent_id.keyword': mutationIntentId } },
          { term: { mutation_intent_id: mutationIntentId } },
        ],
        minimum_should_match: 1,
      },
    },
  });
  const hit = res.hits.hits[0];
  if (!hit?._source) return {};
  const source = hit._source;
  const status = readString(source.disposition) ?? readString(source.status) ?? 'unknown';
  return { outcome: { id: String(hit._id ?? mutationIntentId), status } };
};

const fetchAlert = async (
  esClient: ElasticsearchClient,
  alertId: string
): Promise<Partial<ArgusArtifactRelated>> => {
  const res = await esClient.search<Record<string, unknown>>({
    index: '.alerts-security.alerts-*',
    ignore_unavailable: true,
    size: 1,
    query: {
      bool: {
        should: [
          { term: { _id: alertId } },
          { term: { 'kibana.alert.uuid': alertId } },
          { term: { 'kibana.alert.uuid.keyword': alertId } },
        ],
        minimum_should_match: 1,
      },
    },
  });
  const hit = res.hits.hits[0];
  if (!hit) return {};
  const ruleName = readString(
    (hit._source as { 'kibana.alert.rule.name'?: unknown } | undefined)?.['kibana.alert.rule.name']
  );
  return {
    alert: { id: String(hit._id ?? alertId), ...(ruleName ? { rule_name: ruleName } : {}) },
  };
};

const fetchActor = async (
  esClient: ElasticsearchClient,
  actorId: string
): Promise<Partial<ArgusArtifactRelated>> => {
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.actorTrustTiers,
    ignore_unavailable: true,
    size: 1,
    sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
    query: {
      bool: {
        should: [{ term: { 'actor_id.keyword': actorId } }, { term: { actor_id: actorId } }],
        minimum_should_match: 1,
      },
    },
  });
  const source = res.hits.hits[0]?._source;
  if (!source) return {};
  const tier = readString(source.tier);
  return { actor: { id: actorId, ...(tier ? { trust_tier: tier } : {}) } };
};

/**
 * Lineage and autonomy flyouts surface the authoritative backtest row for a
 * mutation intent — the raw intent/outcome doc doesn't carry sample events
 * or window-level counters, so we enrich from `.soc-backtests`.
 */
const fetchBacktestRelated = async (
  esClient: ElasticsearchClient,
  mutationIntentId: string,
  ruleId: string | null
): Promise<Partial<ArgusArtifactRelated>> => {
  const res = await esClient.search<DetailRawBacktestDoc>({
    index: ARGUS_SOC_INDICES.backtestResults,
    ignore_unavailable: true,
    size: 1,
    sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
    query: {
      bool: {
        should: [
          { term: { 'mutation_intent_id.keyword': mutationIntentId } },
          { match_phrase: { mutation_intent_id: mutationIntentId } },
          ...(ruleId ? [{ term: { rule_id: ruleId } }] : []),
        ],
        minimum_should_match: 1,
      },
    },
  });
  const source = res.hits.hits[0]?._source;
  if (!source) return {};

  const tp = finiteOrNull(source.true_positives) ?? 0;
  const fp = finiteOrNull(source.false_positives) ?? 0;
  const windows = finiteOrNull(source.windows_tested) ?? 0;
  const precision = finiteOrNull(source.precision) ?? (tp + fp > 0 ? tp / (tp + fp) : null);
  const fpRate = finiteOrNull(source.fp_rate) ?? (tp + fp > 0 ? fp / (tp + fp) : null);

  const backtest: ArgusMutationDetailBacktest = {
    tp,
    fp,
    windows,
    precision,
    fp_rate: fpRate,
    gate_decision: readString(source.gate_decision) ?? null,
    query: readString(source.query) ?? null,
    window_start: readString(source.window_start) ?? null,
    window_end: readString(source.window_end) ?? null,
    fp_samples: normaliseRelatedSamples(source.fp_samples, 'fp'),
    tp_samples: normaliseRelatedSamples(source.tp_samples, 'tp'),
  };

  return { backtest };
};

/**
 * Load the outcome doc (if any) and feed it into the shared
 * post-apply-observation helper so the lineage/autonomy flyouts see the same
 * alerts-layer evidence the Mutation Detail flyout does.
 */
const fetchPostApplyObservationRelated = async (
  esClient: ElasticsearchClient,
  logger: Logger,
  mutationIntentId: string,
  ruleId: string | null
): Promise<Partial<ArgusArtifactRelated>> => {
  const res = await esClient.search<DetailRawOutcomeDoc>({
    index: ARGUS_SOC_INDICES.outcomes,
    ignore_unavailable: true,
    size: 1,
    sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
    query: {
      bool: {
        should: [
          { term: { 'mutation_intent_id.keyword': mutationIntentId } },
          { match_phrase: { mutation_intent_id: mutationIntentId } },
        ],
        minimum_should_match: 1,
      },
    },
  });
  const outcome = res.hits.hits[0]?._source;
  if (!outcome) return {};

  const observation = await fetchPostApplyObservation({
    esClient,
    logger,
    outcome,
    ruleId,
    mutationIntentId,
  });
  if (!observation) return {};
  return { post_apply_observation: observation };
};

const finiteOrNull = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) ? value : null;
};

interface RelatedSampleShape {
  readonly event_id?: string | null;
  readonly '@timestamp'?: string | null;
  readonly timestamp?: string | null;
  readonly host_name?: string | null;
  readonly user_name?: string | null;
  readonly process_executable?: string | null;
  readonly command_line?: string | null;
  readonly classification?: string | null;
  readonly reason?: string | null;
}

const normaliseClassification = (
  raw: string | null | undefined,
  fallback: ArgusEventSampleClassification
): ArgusEventSampleClassification => {
  if (raw === 'fp' || raw === 'tp' || raw === 'unclassified') return raw;
  return fallback;
};

const normaliseRelatedSamples = (
  samples: readonly RelatedSampleShape[] | null | undefined,
  fallbackClassification: ArgusEventSampleClassification
): readonly ArgusEventSample[] => {
  if (!Array.isArray(samples) || samples.length === 0) return [];
  const out: ArgusEventSample[] = [];
  for (const sample of samples) {
    const eventId = readString(sample?.event_id);
    if (eventId) {
      out.push({
        event_id: eventId,
        timestamp: readString(sample.timestamp) ?? readString(sample['@timestamp']) ?? null,
        host_name: readString(sample.host_name) ?? null,
        user_name: readString(sample.user_name) ?? null,
        process_executable: readString(sample.process_executable) ?? null,
        command_line: readString(sample.command_line) ?? null,
        classification: normaliseClassification(sample.classification, fallbackClassification),
        reason: readString(sample.reason) ?? null,
      });
    }
  }
  return out;
};

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * Autonomy decision docs describe the targeted detection rule with
 * (`artifact_type`, `artifact_id`) rather than a bare `rule_id` — we treat
 * `artifact_id` as the rule id when the artifact is rule-like so the
 * artifact_details route can resolve the full related-entity chain from a
 * `.soc-autonomy-decisions` source doc.
 */
const RULE_LIKE_ARTIFACT_TYPES = new Set<string>(['rule', 'prebuilt_rule']);

const readRuleId = (raw: Record<string, unknown>): string | undefined => {
  const direct =
    readString(raw.rule_id) ??
    readString((raw as { params?: { ruleId?: unknown } }).params?.ruleId) ??
    readString(raw['kibana.alert.rule.rule_id']) ??
    readString(raw.rec_id);
  if (direct) return direct;

  const artifactType = readString(raw.artifact_type);
  if (artifactType && RULE_LIKE_ARTIFACT_TYPES.has(artifactType)) {
    return readString(raw.artifact_id);
  }
  return undefined;
};

const readMutationIntentId = (raw: Record<string, unknown>): string | undefined =>
  readString(raw.mutation_intent_id) ?? readString(raw.correlation_id);

const readRunId = (raw: Record<string, unknown>): string | undefined =>
  readString(raw.run_id) ?? readString(raw.justification_trace_id);

const readAlertId = (raw: Record<string, unknown>): string | undefined =>
  readString(raw.alert_id) ??
  readString(raw['kibana.alert.uuid']) ??
  readString((raw.kibana as { alert?: { uuid?: unknown } } | undefined)?.alert?.uuid);

const readActorId = (raw: Record<string, unknown>): string | undefined =>
  readString(raw.actor_id) ?? readString(raw.agent_id);

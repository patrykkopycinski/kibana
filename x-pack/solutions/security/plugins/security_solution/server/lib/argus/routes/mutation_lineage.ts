/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import type { ElasticsearchClient } from '@kbn/core/server';

import {
  ARGUS_SOC_INDICES,
  MUTATION_LINEAGE_ROUTE,
  buildMutationLineageFromDocs,
  type MutationLineageSubject,
  type MutationStageDocs,
  type StageDoc,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';

interface RawStageHit {
  readonly _id?: string;
  readonly _index?: string;
  readonly _source?: {
    readonly label?: string;
    readonly subtitle?: string;
    readonly '@timestamp'?: string;
    readonly status?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  };
}

const subjectSchema = schema.object({
  subject_kind: schema.oneOf([
    schema.literal('alert'),
    schema.literal('rule'),
    schema.literal('mutation'),
    schema.literal('cve'),
  ]),
  subject_id: schema.string({ minLength: 1, maxLength: 1024 }),
});

const toStageDoc = (hit: RawStageHit | undefined): StageDoc | undefined => {
  if (!hit || !hit._id) return undefined;
  return {
    id: hit._id,
    index: hit._index,
    label: hit._source?.label,
    subtitle: hit._source?.subtitle,
    '@timestamp': hit._source?.['@timestamp'],
    status: hit._source?.status,
    metadata: hit._source?.metadata,
  };
};

/**
 * Best-effort search for a single doc matching `mutation_intent_id` in the
 * given index. Returns `undefined` if the index is missing or nothing matches.
 */
const findStageDoc = async (
  esClient: ElasticsearchClient,
  index: string,
  mutationIntentId: string,
  extraMust: ReadonlyArray<Record<string, unknown>> = []
): Promise<StageDoc | undefined> => {
  try {
    const res = await esClient.search<RawStageHit['_source']>({
      index,
      ignore_unavailable: true,
      size: 1,
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
      // `match_phrase` is mapping-tolerant: it matches both `keyword` fields
      // and dynamically-mapped `text` fields whose analyzer tokenises dashes
      // (e.g. `mut-intent-42` → `[mut, intent, 42]`). Several `.soc-*`
      // indices pre-exist with text+keyword-subfield mappings from older
      // pipelines, so a raw `term` query would silently miss.
      query: {
        bool: {
          must: [{ match_phrase: { mutation_intent_id: mutationIntentId } }, ...extraMust],
        },
      },
    });
    const hit = res.hits?.hits?.[0];
    return hit ? toStageDoc({ _id: hit._id, _index: hit._index, _source: hit._source }) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Resolve a mutation_intent_id from an alert or rule subject. Demo-grade:
 * - `alert`  → read `kibana.alert.argus.mutation_intent_id` from the alert doc
 * - `rule`   → pick the latest `.soc-mutation-intents` doc for that rule_id
 * - `mutation` → the id itself
 *
 * Returns `undefined` when nothing resolvable is found — the handler will map
 * that to `reason_code: 'not_found'`.
 */
const resolveMutationIntentId = async (
  esClient: ElasticsearchClient,
  subject: MutationLineageSubject
): Promise<{ mutationIntentId?: string; ruleId?: string; advisoryId?: string }> => {
  if (subject.kind === 'mutation') {
    return { mutationIntentId: subject.id };
  }

  if (subject.kind === 'cve') {
    // Advisories are keyed by either `_id == advisory_id` or the `cve_id`
    // field (CISA KEV import uses the CVE as the canonical id). We look up
    // by both so "CVE-2025-12345" works regardless of which seed path
    // produced the doc.
    try {
      const advisoryRes = await esClient.search<{
        advisory_id?: string;
        cve_id?: string;
        draft_rule_id?: string;
      }>({
        index: ARGUS_SOC_INDICES.cveAdvisories,
        ignore_unavailable: true,
        size: 1,
        sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
        _source: ['advisory_id', 'cve_id', 'draft_rule_id'],
        query: {
          bool: {
            should: [
              { term: { _id: subject.id } },
              { term: { advisory_id: subject.id } },
              { term: { cve_id: subject.id } },
            ],
            minimum_should_match: 1,
          },
        },
      });
      const advHit = advisoryRes.hits?.hits?.[0];
      const advisoryId = advHit?._id ?? advHit?._source?.advisory_id;
      const draftRuleId = advHit?._source?.draft_rule_id;

      if (!advisoryId) {
        return {};
      }

      // The advisory's `draft_rule_id` is the join key — find the latest
      // mutation_intent that carries it.
      if (draftRuleId) {
        const intentRes = await esClient.search<{ mutation_intent_id?: string }>({
          index: ARGUS_SOC_INDICES.mutationIntents,
          ignore_unavailable: true,
          size: 1,
          sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
          _source: ['mutation_intent_id'],
          query: { term: { rule_id: draftRuleId } },
        });
        const intentHit = intentRes.hits?.hits?.[0];
        return {
          advisoryId,
          ruleId: draftRuleId,
          mutationIntentId: intentHit?._source?.mutation_intent_id ?? intentHit?._id,
        };
      }

      return { advisoryId, ruleId: draftRuleId };
    } catch {
      return {};
    }
  }

  if (subject.kind === 'alert') {
    try {
      const res = await esClient.search<{
        kibana?: { alert?: { argus?: { mutation_intent_id?: string; rule_id?: string } } };
      }>({
        index: '.alerts-security.alerts-*',
        ignore_unavailable: true,
        size: 1,
        _source: ['kibana.alert.argus.mutation_intent_id', 'kibana.alert.argus.rule_id'],
        query: { ids: { values: [subject.id] } },
      });
      const src = res.hits?.hits?.[0]?._source?.kibana?.alert?.argus;
      return { mutationIntentId: src?.mutation_intent_id, ruleId: src?.rule_id };
    } catch {
      return {};
    }
  }

  // subject.kind === 'rule'
  try {
    const res = await esClient.search<{ mutation_intent_id?: string }>({
      index: ARGUS_SOC_INDICES.mutationIntents,
      ignore_unavailable: true,
      size: 1,
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
      _source: ['mutation_intent_id'],
      query: { term: { rule_id: subject.id } },
    });
    const hit = res.hits?.hits?.[0];
    return {
      mutationIntentId: hit?._source?.mutation_intent_id ?? hit?._id,
      ruleId: subject.id,
    };
  } catch {
    return { ruleId: subject.id };
  }
};

/**
 * Load the CVE advisory doc (the `source` stage). Uses `match_phrase` so it
 * works across `keyword` and dynamically-mapped text fields — same rationale
 * as `findStageDoc`.
 */
const findAdvisoryStage = async (
  esClient: ElasticsearchClient,
  advisoryId: string | undefined,
  ruleId: string | undefined
): Promise<StageDoc | undefined> => {
  if (!advisoryId && !ruleId) return undefined;
  try {
    const res = await esClient.search<{
      advisory_id?: string;
      cve_id?: string;
      title?: string;
      severity?: string;
      status?: string;
      '@timestamp'?: string;
      source?: string;
      kev?: Readonly<Record<string, unknown>>;
      draft_rule_id?: string;
    }>({
      index: ARGUS_SOC_INDICES.cveAdvisories,
      ignore_unavailable: true,
      size: 1,
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
      query: {
        bool: {
          should: [
            ...(advisoryId
              ? [
                  { term: { _id: advisoryId } },
                  { term: { advisory_id: advisoryId } },
                  { term: { cve_id: advisoryId } },
                ]
              : []),
            ...(ruleId ? [{ term: { draft_rule_id: ruleId } }] : []),
          ],
          minimum_should_match: 1,
        },
      },
    });
    const hit = res.hits?.hits?.[0];
    const src = hit?._source;
    if (!hit || !hit._id || !src) return undefined;
    const cve = src.cve_id ?? src.advisory_id ?? hit._id;
    return {
      id: hit._id,
      index: hit._index,
      label: src.title ?? cve,
      subtitle: [cve, src.severity, src.kev ? 'CISA KEV' : undefined].filter(Boolean).join(' · '),
      '@timestamp': src['@timestamp'],
      status: src.status,
      metadata: {
        advisory_id: src.advisory_id ?? hit._id,
        cve_id: src.cve_id,
        severity: src.severity,
        kev: src.kev,
        source: src.source,
      },
    };
  } catch {
    return undefined;
  }
};

/**
 * Synthesise an `exploit_probability` stage from the recommendation's
 * `confidence` score and the advisory's KEV envelope. No dedicated
 * `.soc-exploit-probability` index exists today; the decision is carried by
 * the recommendation's `argus.decision.confidence` (0-1 float) and bumped to
 * 1.0 when CISA has flagged the CVE as a known exploited vuln.
 */
const findExploitProbabilityStage = async (
  esClient: ElasticsearchClient,
  mutationIntentId: string,
  advisoryId: string | undefined
): Promise<StageDoc | undefined> => {
  try {
    const [recRes, advRes] = await Promise.all([
      esClient.search<{
        rec_id?: string;
        confidence?: number;
        '@timestamp'?: string;
        status?: string;
        argus?: { decision?: { confidence?: number } };
      }>({
        index: ARGUS_SOC_INDICES.recommendations,
        ignore_unavailable: true,
        size: 1,
        sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
        query: { match_phrase: { mutation_intent_id: mutationIntentId } },
      }),
      advisoryId
        ? esClient.search<{ kev?: Readonly<Record<string, unknown>>; cve_id?: string }>({
            index: ARGUS_SOC_INDICES.cveAdvisories,
            ignore_unavailable: true,
            size: 1,
            _source: ['kev', 'cve_id'],
            query: {
              bool: {
                should: [
                  { term: { _id: advisoryId } },
                  { term: { advisory_id: advisoryId } },
                  { term: { cve_id: advisoryId } },
                ],
                minimum_should_match: 1,
              },
            },
          })
        : Promise.resolve(undefined),
    ]);

    const recHit = recRes.hits?.hits?.[0];
    const recSrc = recHit?._source;
    const advKev = advRes?.hits?.hits?.[0]?._source?.kev;

    const rawConfidence =
      recSrc?.argus?.decision?.confidence ??
      (typeof recSrc?.confidence === 'number' ? recSrc.confidence / 100 : undefined);
    const score = advKev ? 1.0 : rawConfidence;

    if (score === undefined && !advKev) {
      return undefined;
    }

    const label = advKev
      ? 'Exploit probability · CISA KEV'
      : typeof score === 'number'
      ? `Exploit probability ${Math.round(score * 100)}%`
      : 'Exploit probability';

    return {
      id: recHit?._id ?? `exploit-probability:${mutationIntentId}`,
      index: recHit?._index ?? ARGUS_SOC_INDICES.recommendations,
      label,
      subtitle: advKev ? 'Known exploited (CISA KEV)' : 'derived from recommendation confidence',
      '@timestamp': recSrc?.['@timestamp'],
      status: recSrc?.status ?? 'done',
      metadata: {
        confidence: score,
        kev: advKev,
        source: advKev ? 'cisa_kev' : 'argus_recommendation',
      },
    };
  } catch {
    return undefined;
  }
};

const loadStageDocs = async (
  esClient: ElasticsearchClient,
  mutationIntentId: string,
  ruleId: string | undefined,
  advisoryId: string | undefined
): Promise<MutationStageDocs> => {
  const [
    source,
    exploitProbability,
    synthesis,
    evalDoc,
    backtest,
    apply,
    observe,
    outcome,
    driftDetected,
  ] = await Promise.all([
    findAdvisoryStage(esClient, advisoryId, ruleId),
    findExploitProbabilityStage(esClient, mutationIntentId, advisoryId),
    findStageDoc(esClient, ARGUS_SOC_INDICES.mutationIntents, mutationIntentId),
    findStageDoc(esClient, ARGUS_SOC_INDICES.detectionEvalRuns, mutationIntentId, [
      { term: { run_kind: 'detection' } },
    ]),
    findStageDoc(esClient, ARGUS_SOC_INDICES.backtestResults, mutationIntentId),
    findStageDoc(esClient, ARGUS_SOC_INDICES.recommendations, mutationIntentId),
    findStageDoc(esClient, ARGUS_SOC_INDICES.outcomes, mutationIntentId),
    findStageDoc(esClient, ARGUS_SOC_INDICES.outcomes, mutationIntentId),
    Promise.resolve(undefined),
  ]);

  return {
    mutation_intent_id: mutationIntentId,
    rule_id: ruleId,
    source,
    exploit_probability: exploitProbability,
    synthesis,
    eval: evalDoc,
    backtest,
    apply,
    observe,
    outcome,
    drift_detected: driftDetected,
  };
};

export const registerMutationLineageRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: MUTATION_LINEAGE_ROUTE,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution'],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: { request: { query: subjectSchema } },
      },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);
        const subject: MutationLineageSubject = {
          kind: request.query.subject_kind,
          id: request.query.subject_id,
        };

        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;

          const { mutationIntentId, ruleId, advisoryId } = await resolveMutationIntentId(
            esClient,
            subject
          );

          if (!mutationIntentId) {
            return response.ok({ body: { subject, reason_code: 'not_found' } });
          }

          const stageDocs = await loadStageDocs(esClient, mutationIntentId, ruleId, advisoryId);
          const result = buildMutationLineageFromDocs(stageDocs, subject);
          return response.ok({ body: result });
        } catch (err) {
          const error = transformError(err);
          logger.error(
            `ARGUS mutation_lineage route failed for ${subject.kind}:${subject.id}: ${error.message}`
          );
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};

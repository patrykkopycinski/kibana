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
import type { RulesClient } from '@kbn/alerting-plugin/server';

import {
  ARGUS_SOC_INDICES,
  AUTONOMY_DECISIONS_ROUTE,
  buildAutonomyDecisions,
  type ArgusAutonomyDecision,
  type ArgusAutonomyResponse,
  type ArgusAutonomyWindow,
  type RawAutonomyHit,
} from '@kbn/argus-console-common';

import { findRules } from '../../detection_engine/rule_management/logic/search/find_rules';

import type { ArgusRoutesDeps } from '../types';

/**
 * Map the UI toggle to the underlying date-math anchor. Kept as a closed set
 * so the API surface and the MutationsPanel toggle never drift apart.
 */
const WINDOW_MAP: Record<ArgusAutonomyWindow, string> = {
  '24h': 'now-24h',
  '7d': 'now-7d',
};

const DEFAULT_WINDOW: ArgusAutonomyWindow = '24h';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
/**
 * We over-fetch relative to DEFAULT_LIMIT so the per-status count tiles
 * reflect a wider sample than the visible table. `FETCH_SIZE` is capped so
 * a pathological caller can't chew through the whole index in one request.
 */
const FETCH_SIZE = 500;

const WINDOW_VALUES = ['24h', '7d'] as const satisfies readonly ArgusAutonomyWindow[];

const querySchema = schema.object({
  window: schema.maybe(
    schema.oneOf([schema.literal(WINDOW_VALUES[0]), schema.literal(WINDOW_VALUES[1])])
  ),
  limit: schema.maybe(schema.number({ min: 1, max: MAX_LIMIT })),
});

export const registerAutonomyDecisionsRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: AUTONOMY_DECISIONS_ROUTE,
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
          const { core, alerting } = await context.resolve(['core', 'alerting']);
          const esClient = core.elasticsearch.client.asCurrentUser;

          const windowKey: ArgusAutonomyWindow = request.query.window ?? DEFAULT_WINDOW;
          const now = new Date();
          const windowEnd = now.toISOString();
          const windowStart = deriveWindowStart(windowKey, now);
          const limit = request.query.limit ?? DEFAULT_LIMIT;

          const hits = await fetchAutonomyHits(esClient, windowKey);

          const payload = buildAutonomyDecisions({
            hits,
            windowStart,
            windowEnd,
            limit,
          });

          // Best-effort enrichment: map each `artifact_id` that refers to a
          // detection rule to its Kibana saved-object id so the UI can
          // deep-link to the rule details page. Fail-open — if the alerting
          // rules client throws (e.g. permissions), we just return the
          // decisions unannotated rather than failing the whole request.
          const rulesClient = await alerting.getRulesClient();
          const enriched = await enrichWithKibanaRuleIds({
            payload,
            rulesClient,
            logger,
          });

          return response.ok({ body: enriched });
        } catch (err) {
          const error = transformError(err);
          logger.error(`Argus autonomy_decisions route failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};

const deriveWindowStart = (window: ArgusAutonomyWindow, now: Date): string => {
  const ms = window === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms).toISOString();
};

const fetchAutonomyHits = async (
  esClient: ElasticsearchClient,
  window: ArgusAutonomyWindow
): Promise<readonly RawAutonomyHit[]> => {
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.autonomyDecisions,
    ignore_unavailable: true,
    size: FETCH_SIZE,
    sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
    _source: true,
    track_total_hits: false,
    query: {
      range: { '@timestamp': { gte: WINDOW_MAP[window] } },
    },
  });

  const hits = res.hits?.hits ?? [];
  const out: RawAutonomyHit[] = [];
  for (const hit of hits) {
    if (hit._source) {
      out.push({ doc_id: String(hit._id ?? ''), source: hit._source });
    }
  }
  return out;
};

/**
 * Maximum number of distinct rule-like `artifact_id`s we'll try to resolve
 * to Kibana rule UUIDs per request. The alerting `find` is a single call
 * with an OR filter, so this is mostly a guard against pathological
 * windows with thousands of unique artifacts.
 */
const MAX_RULE_IDS_TO_RESOLVE = 200;

interface EnrichArgs {
  readonly payload: ArgusAutonomyResponse;
  readonly rulesClient: RulesClient;
  readonly logger: Logger;
}

/**
 * Enrich each rule-typed decision with the Kibana saved-object id of the
 * matching detection rule (if one exists in this space). The UI uses this
 * to render the Artifact cell as a deep-link into the rule details page.
 *
 * Fail-open: any error here is logged and the caller receives the payload
 * unannotated rather than a failed request — the artifact id is still
 * shown, just as plain text.
 */
const enrichWithKibanaRuleIds = async ({
  payload,
  rulesClient,
  logger,
}: EnrichArgs): Promise<ArgusAutonomyResponse> => {
  const ruleArtifactIds = uniqueRuleArtifactIds(payload.decisions);
  if (ruleArtifactIds.length === 0) return payload;

  interface ResolvedRule {
    readonly id: string;
    readonly name?: string;
  }

  let resolution: ReadonlyMap<string, ResolvedRule> = new Map();
  try {
    resolution = await resolveRuleArtifactIds({ ruleArtifactIds, rulesClient, logger });
  } catch (err) {
    logger.warn(
      `Argus autonomy_decisions: rule-id resolution failed, returning decisions without kibana_rule_id: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return payload;
  }

  if (resolution.size === 0) return payload;

  const enrichedDecisions: readonly ArgusAutonomyDecision[] = payload.decisions.map((decision) => {
    const resolved = resolution.get(decision.artifact_id);
    if (!resolved) return decision;
    return {
      ...decision,
      kibana_rule_id: resolved.id,
      ...(resolved.name ? { kibana_rule_name: resolved.name } : {}),
    };
  });

  return { ...payload, decisions: enrichedDecisions };
};

/**
 * Artifact types whose `artifact_id` identifies a Kibana detection rule and
 * should therefore resolve to a deep-link on the Autonomy panel:
 *
 * - `rule`           — Argus-authored custom rules. Live SOC workflows
 *                      (soc-post-apply-observer, soc-signal-quality-agent,
 *                      soc-deteng-agent, …) populate `artifact_id` with the
 *                      *Kibana saved-object UUID* when they update an
 *                      existing rule.
 * - `detection_rule` — Same family as `rule`, emitted by the update-rule
 *                      action path. Historically excluded from the rule-like
 *                      set which made 327+ live decisions render as plain
 *                      text with no link.
 * - `prebuilt_rule`  — Elastic prebuilt rules Argus autonomously enabled.
 *                      `artifact_id` is the prebuilt package's logical
 *                      `rule_id` (a UUID assigned by the Elastic prebuilt
 *                      rules catalogue, not a saved-object id).
 *
 * `resolveRuleArtifactIds` below handles both shapes — logical `rule_id`
 * AND Kibana saved-object UUID — so every decision in this set can deep-
 * link to the rule details page when the rule exists in the current space.
 */
const RULE_LIKE_ARTIFACT_TYPES = new Set<string>(['rule', 'detection_rule', 'prebuilt_rule']);

const uniqueRuleArtifactIds = (decisions: readonly ArgusAutonomyDecision[]): readonly string[] => {
  const seen = new Set<string>();
  for (const d of decisions) {
    if (d.artifact_type && RULE_LIKE_ARTIFACT_TYPES.has(d.artifact_type) && d.artifact_id) {
      seen.add(d.artifact_id);
      if (seen.size >= MAX_RULE_IDS_TO_RESOLVE) break;
    }
  }
  return Array.from(seen);
};

/**
 * Escape a logical rule_id for embedding in a KQL quoted-string literal.
 * KQL double-quoted strings treat `\` and `"` as special, so we escape
 * both. Rule ids are typically UUIDs or dotted identifiers, but we treat
 * `artifact_id` as untrusted input because it flows in from autonomy
 * decision documents.
 */
const escapeKqlQuoted = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const resolveRuleArtifactIds = async ({
  ruleArtifactIds,
  rulesClient,
  logger,
}: {
  readonly ruleArtifactIds: readonly string[];
  readonly rulesClient: RulesClient;
  readonly logger: Logger;
}): Promise<ReadonlyMap<string, { readonly id: string; readonly name?: string }>> => {
  // `artifact_id` on a rule-typed decision can be one of two different
  // things depending on the agent that wrote the decision:
  //
  //   1. The detection rule's logical `rule_id` — prebuilt rules use this
  //      (the UUID assigned by the Elastic prebuilt rules catalogue), and
  //      some Argus-authored custom rules also emit the logical id.
  //   2. The Kibana saved-object UUID (`alert.id`) — the live SOC update
  //      workflows (soc-post-apply-observer, soc-signal-quality-agent,
  //      soc-deteng-agent) write the SO UUID because they look the rule up
  //      by saved-object id before updating it.
  //
  // Resolving only (1) — as the route used to — left every live
  // `soc-post-apply-observer` / `soc-signal-quality-agent` decision
  // stranded with a "not in Kibana" pill even when the rule was sitting
  // one click away in `/app/security/rules`. We now run the two lookups
  // independently and merge the results: `findRules` with the `ruleIds`
  // option handles the saved-object UUID branch (it forwards to the same
  // `alert.id: ("alert:<uuid>")` KQL clause the alerting SO filter
  // expects), and a filter-only call handles the logical `params.ruleId`
  // branch. Splitting the calls avoids a stringly-combined filter that
  // both saved-objects and KQL parsers have historically been picky about
  // when mixed with `enrichFilterWithRuleTypeMapping`'s wrapping.
  const map = new Map<string, { id: string; name?: string }>();
  const artifactIdLookup = new Set(ruleArtifactIds);

  const indexRule = (rule: { id?: unknown; name?: unknown; params?: unknown }) => {
    const savedObjectId = typeof rule.id === 'string' ? rule.id : undefined;
    if (!savedObjectId) return;
    const logicalId = (rule.params as { ruleId?: unknown } | undefined)?.ruleId;
    const entry = {
      id: savedObjectId,
      name: typeof rule.name === 'string' ? rule.name : undefined,
    };
    // Index under both shapes when present in the requested set, so
    // `resolution.get(decision.artifact_id)` hits regardless of which
    // form the decision document carries.
    if (typeof logicalId === 'string' && artifactIdLookup.has(logicalId)) {
      map.set(logicalId, entry);
    }
    if (artifactIdLookup.has(savedObjectId)) {
      map.set(savedObjectId, entry);
    }
  };

  // Branch 1 — saved-object UUID: use the dedicated `ruleIds` option so
  // the detection-engine helper emits the canonical
  // `alert.id: ("alert:<uuid>")` KQL that the alerting saved-objects
  // client understands.
  try {
    const soResult = await findRules({
      rulesClient,
      perPage: ruleArtifactIds.length,
      page: 1,
      sortField: undefined,
      sortOrder: undefined,
      filter: undefined,
      fields: undefined,
      ruleIds: [...ruleArtifactIds],
    });
    for (const rule of soResult.data ?? []) indexRule(rule);
  } catch (err) {
    logger.warn(
      `Argus autonomy_decisions: saved-object rule-id lookup failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  // Branch 2 — logical rule_id: standard KQL quoted list against
  // `params.ruleId`. Covers prebuilt rules and any custom rule whose
  // decision writer emits the logical id instead of the SO UUID.
  try {
    const quotedLogicalIds = ruleArtifactIds
      .map((id) => `"${escapeKqlQuoted(id)}"`)
      .join(' OR ');
    const logicalResult = await findRules({
      rulesClient,
      perPage: ruleArtifactIds.length,
      page: 1,
      sortField: undefined,
      sortOrder: undefined,
      filter: `alert.attributes.params.ruleId: (${quotedLogicalIds})`,
      fields: undefined,
    });
    for (const rule of logicalResult.data ?? []) indexRule(rule);
  } catch (err) {
    logger.warn(
      `Argus autonomy_decisions: logical rule-id lookup failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  return map;
};

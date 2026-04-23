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
  COVERAGE_ROUTE,
  NAVIGATOR_LAYER_ROUTE,
  THREAT_PROFILES_ROUTE,
  THREAT_PROFILE_DETAIL_ROUTE,
  THREAT_ACTORS_ROUTE,
  THREAT_ACTOR_DETAIL_ROUTE,
  THREAT_ACTOR_COVERAGE_ROUTE,
  REDUNDANCY_SUMMARY_ROUTE,
  buildActorCoverage,
  buildCoverageSnapshot,
  buildNavigatorLayer,
  type RawAuthoredDoc,
  type RawCorpusDoc,
  type ArgusThreatActor,
  type ArgusThreatProfile,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';
import { DEMO_ATTACK_TECHNIQUES } from '../mitre_techniques';

const CORPUS_FETCH_SIZE = 2000;
const AUTHORED_FETCH_SIZE = 2000;

const coverageQuery = schema.object({
  profile_id: schema.maybe(schema.string({ maxLength: 128 })),
});

const profileDetailParams = schema.object({
  profile_id: schema.string({ maxLength: 128 }),
});

const actorDetailParams = schema.object({
  actor_id: schema.string({ maxLength: 128 }),
});

const actorsQuery = schema.object({
  limit: schema.maybe(schema.number({ min: 1, max: 200 })),
  q: schema.maybe(schema.string({ maxLength: 128 })),
});

export const registerCoverageRoutes = (deps: ArgusRoutesDeps) => {
  registerCoverageSnapshotRoute(deps);
  registerNavigatorLayerRoute(deps);
  registerThreatProfilesRoute(deps);
  registerThreatProfileDetailRoute(deps);
  registerThreatActorsRoute(deps);
  registerThreatActorDetailRoute(deps);
  registerThreatActorCoverageRoute(deps);
  registerRedundancySummaryRoute(deps);
};

const registerCoverageSnapshotRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: COVERAGE_ROUTE,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion(
      { version: '1', validate: { request: { query: coverageQuery } } },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);
        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;
          const profile = request.query.profile_id
            ? await fetchThreatProfile(esClient, request.query.profile_id)
            : null;
          const snapshot = await computeCoverageSnapshot(esClient, profile);
          return response.ok({ body: snapshot });
        } catch (err) {
          const error = transformError(err);
          logger.error(`ARGUS coverage route failed: ${error.message}`);
          return siemResponse.error({ statusCode: error.statusCode, body: error.message });
        }
      }
    );
};

const registerNavigatorLayerRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: NAVIGATOR_LAYER_ROUTE,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion(
      { version: '1', validate: { request: { query: coverageQuery } } },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);
        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;
          const profile = request.query.profile_id
            ? await fetchThreatProfile(esClient, request.query.profile_id)
            : null;
          const snapshot = await computeCoverageSnapshot(esClient, profile);
          const name = profile
            ? `ARGUS coverage — ${profile.name}`
            : 'ARGUS coverage — all techniques';
          const layer = buildNavigatorLayer({ snapshot, name });
          return response.ok({ body: layer });
        } catch (err) {
          const error = transformError(err);
          logger.error(`ARGUS navigator layer route failed: ${error.message}`);
          return siemResponse.error({ statusCode: error.statusCode, body: error.message });
        }
      }
    );
};

const registerThreatProfilesRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: THREAT_PROFILES_ROUTE,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion({ version: '1', validate: false }, async (context, _request, response) => {
      const siemResponse = buildSiemResponse(response);
      try {
        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const profiles = await fetchAllThreatProfiles(esClient);
        return response.ok({ body: { profiles } });
      } catch (err) {
        const error = transformError(err);
        logger.error(`ARGUS threat profiles route failed: ${error.message}`);
        return siemResponse.error({ statusCode: error.statusCode, body: error.message });
      }
    });
};

const registerThreatProfileDetailRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: THREAT_PROFILE_DETAIL_ROUTE,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion(
      { version: '1', validate: { request: { params: profileDetailParams } } },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);
        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;
          const profile = await fetchThreatProfile(esClient, request.params.profile_id);
          if (!profile) {
            return response.notFound({ body: { message: 'threat profile not found' } });
          }
          return response.ok({ body: profile });
        } catch (err) {
          const error = transformError(err);
          logger.error(`ARGUS threat profile detail route failed: ${error.message}`);
          return siemResponse.error({ statusCode: error.statusCode, body: error.message });
        }
      }
    );
};

const registerThreatActorsRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: THREAT_ACTORS_ROUTE,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion(
      { version: '1', validate: { request: { query: actorsQuery } } },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);
        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;
          const limit = request.query.limit ?? 50;
          const q = request.query.q?.trim() ?? '';
          const actors = await fetchThreatActors(esClient, { limit, q });
          return response.ok({ body: { actors } });
        } catch (err) {
          const error = transformError(err);
          logger.error(`ARGUS threat actors route failed: ${error.message}`);
          return siemResponse.error({ statusCode: error.statusCode, body: error.message });
        }
      }
    );
};

const registerThreatActorDetailRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: THREAT_ACTOR_DETAIL_ROUTE,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion(
      { version: '1', validate: { request: { params: actorDetailParams } } },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);
        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;
          const actor = await fetchThreatActor(esClient, request.params.actor_id);
          if (!actor) {
            return response.notFound({ body: { message: 'threat actor not found' } });
          }
          return response.ok({ body: actor });
        } catch (err) {
          const error = transformError(err);
          logger.error(`ARGUS threat actor detail route failed: ${error.message}`);
          return siemResponse.error({ statusCode: error.statusCode, body: error.message });
        }
      }
    );
};

const registerThreatActorCoverageRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: THREAT_ACTOR_COVERAGE_ROUTE,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion(
      { version: '1', validate: { request: { params: actorDetailParams } } },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);
        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;
          const actor = await fetchThreatActor(esClient, request.params.actor_id);
          if (!actor) {
            return response.notFound({ body: { message: 'threat actor not found' } });
          }
          const snapshot = await computeCoverageSnapshot(esClient, null);
          const actorCoverage = buildActorCoverage({
            actor: {
              actor_id: actor.actor_id,
              actor_name: actor.actor_name,
              techniques: actor.techniques,
            },
            snapshot,
          });
          return response.ok({ body: actorCoverage });
        } catch (err) {
          const error = transformError(err);
          logger.error(`ARGUS threat actor coverage route failed: ${error.message}`);
          return siemResponse.error({ statusCode: error.statusCode, body: error.message });
        }
      }
    );
};

const registerRedundancySummaryRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: REDUNDANCY_SUMMARY_ROUTE,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion({ version: '1', validate: false }, async (context, _request, response) => {
      const siemResponse = buildSiemResponse(response);
      try {
        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const body = await computeRedundancySummary(esClient);
        return response.ok({ body });
      } catch (err) {
        const error = transformError(err);
        logger.error(`ARGUS redundancy summary route failed: ${error.message}`);
        return siemResponse.error({ statusCode: error.statusCode, body: error.message });
      }
    });
};

interface RedundancySummary {
  readonly total_active_consolidation_intents: number;
  readonly rules_now_redundant: number;
  readonly techniques_affected: number;
  readonly recent_intents: ReadonlyArray<{
    readonly mutation_intent_id: string;
    readonly rule_id: string | null;
    readonly technique_id: string | null;
    readonly filed_at: string | null;
  }>;
}

const computeRedundancySummary = async (
  esClient: ElasticsearchClient
): Promise<RedundancySummary> => {
  // An active consolidation intent is one filed by the redundancy-scanner
  // workflow that has not yet been approved or rolled back. We use
  // `argus.origin: consolidation` as the selector (written by
  // `soc-argus-redundancy-scanner.yaml`) and exclude any intent whose
  // outcome is terminal (applied or rolled_back).
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.mutationIntents,
    ignore_unavailable: true,
    size: 20,
    _source: ['mutation_intent_id', 'rule_id', 'mitre_technique', 'argus.origin', '@timestamp'],
    track_total_hits: true,
    sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
    query: {
      bool: {
        must: [{ term: { 'argus.origin.keyword': 'consolidation' } }],
        must_not: [
          { term: { 'outcome_state.keyword': 'applied' } },
          { term: { 'outcome_state.keyword': 'rolled_back' } },
        ],
      },
    },
    aggs: {
      rules: { cardinality: { field: 'rule_id.keyword' } },
      techniques: { cardinality: { field: 'mitre_technique.keyword' } },
    },
  });

  const total = typeof res.hits?.total === 'number' ? res.hits.total : res.hits?.total?.value ?? 0;
  const aggregations = res.aggregations as
    | { rules?: { value?: number }; techniques?: { value?: number } }
    | undefined;
  const hits = res.hits?.hits ?? [];
  const recent = hits
    .map((hit) => {
      const source = hit._source as
        | {
            mutation_intent_id?: string;
            rule_id?: string | null;
            mitre_technique?: string | null;
            '@timestamp'?: string | null;
          }
        | undefined;
      if (!source?.mutation_intent_id) return null;
      return {
        mutation_intent_id: source.mutation_intent_id,
        rule_id: source.rule_id ?? null,
        technique_id: source.mitre_technique ?? null,
        filed_at: source['@timestamp'] ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return {
    total_active_consolidation_intents: total,
    rules_now_redundant: aggregations?.rules?.value ?? 0,
    techniques_affected: aggregations?.techniques?.value ?? 0,
    recent_intents: recent,
  };
};

const computeCoverageSnapshot = async (
  esClient: ElasticsearchClient,
  profile: ArgusThreatProfile | null
) => {
  const [corpusDocs, authoredDocs] = await Promise.all([
    fetchCorpusDocs(esClient),
    fetchAuthoredDocs(esClient),
  ]);
  return buildCoverageSnapshot({
    profile,
    corpusDocs,
    authoredDocs,
    techniqueCatalogue: DEMO_ATTACK_TECHNIQUES,
    generatedAt: new Date().toISOString(),
  });
};

const fetchCorpusDocs = async (esClient: ElasticsearchClient): Promise<RawCorpusDoc[]> => {
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.detectionCorpus,
    ignore_unavailable: true,
    size: CORPUS_FETCH_SIZE,
    _source: ['rule_id', 'source', 'mitre_technique'],
    track_total_hits: false,
    query: { match_all: {} },
  });
  const hits = res.hits?.hits ?? [];
  const out: RawCorpusDoc[] = [];
  for (const hit of hits) {
    out.push({ _id: String(hit._id ?? ''), _source: hit._source as RawCorpusDoc['_source'] });
  }
  return out;
};

const fetchAuthoredDocs = async (esClient: ElasticsearchClient): Promise<RawAuthoredDoc[]> => {
  // ARGUS-authored rules live as accepted recommendations in .soc-recommendations
  // (source.kind = 'mutation_intent', outcome/applied). Keeping the query
  // simple — anything with a non-empty mitre technique list counts.
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.recommendations,
    ignore_unavailable: true,
    size: AUTHORED_FETCH_SIZE,
    _source: ['rule_id', 'mitre_techniques', 'mitre_technique'],
    track_total_hits: false,
    query: {
      bool: {
        should: [
          { exists: { field: 'mitre_technique' } },
          { exists: { field: 'mitre_techniques' } },
        ],
        minimum_should_match: 1,
      },
    },
  });
  const hits = res.hits?.hits ?? [];
  const out: RawAuthoredDoc[] = [];
  for (const hit of hits) {
    out.push({ _id: String(hit._id ?? ''), _source: hit._source as RawAuthoredDoc['_source'] });
  }
  return out;
};

const fetchThreatProfile = async (
  esClient: ElasticsearchClient,
  profileId: string
): Promise<ArgusThreatProfile | null> => {
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.threatProfiles,
    ignore_unavailable: true,
    size: 1,
    _source: true,
    query: { term: { 'profile_id.keyword': profileId } },
  });
  const hit = res.hits?.hits?.[0];
  if (!hit?._source) return null;
  return hit._source as unknown as ArgusThreatProfile;
};

const fetchAllThreatProfiles = async (
  esClient: ElasticsearchClient
): Promise<ArgusThreatProfile[]> => {
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.threatProfiles,
    ignore_unavailable: true,
    size: 200,
    _source: true,
    sort: [{ 'name.keyword': { order: 'asc', unmapped_type: 'keyword' } }],
    query: { match_all: {} },
  });
  const hits = res.hits?.hits ?? [];
  return hits
    .map((h) => h._source as unknown as ArgusThreatProfile | undefined)
    .filter((x): x is ArgusThreatProfile => Boolean(x));
};

const fetchThreatActors = async (
  esClient: ElasticsearchClient,
  args: { limit: number; q: string }
): Promise<ArgusThreatActor[]> => {
  const query = args.q
    ? {
        bool: {
          should: [
            { match_phrase_prefix: { actor_name: args.q } },
            { prefix: { 'actor_id.keyword': args.q.toUpperCase() } },
            { term: { aliases: args.q } },
          ],
          minimum_should_match: 1,
        },
      }
    : { match_all: {} };
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.threatActors,
    ignore_unavailable: true,
    size: args.limit,
    _source: true,
    sort: [{ 'actor_name.keyword': { order: 'asc', unmapped_type: 'keyword' } }],
    query,
  });
  const hits = res.hits?.hits ?? [];
  return hits
    .map((h) => h._source as unknown as ArgusThreatActor | undefined)
    .filter((x): x is ArgusThreatActor => Boolean(x));
};

const fetchThreatActor = async (
  esClient: ElasticsearchClient,
  actorId: string
): Promise<ArgusThreatActor | null> => {
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.threatActors,
    ignore_unavailable: true,
    size: 1,
    _source: true,
    query: { term: { 'actor_id.keyword': actorId } },
  });
  const hit = res.hits?.hits?.[0];
  if (!hit?._source) return null;
  return hit._source as unknown as ArgusThreatActor;
};

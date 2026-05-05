/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';

import {
  ARGUS_SOC_INDICES,
  GOVERNANCE_PULSE_ROUTE,
  buildGovernancePulse,
  type ActorTrustTiersAggsInput,
  type GovernancePulseAggsInput,
  type HoursSavedConstants,
  type MutationIntentsAggsInput,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';

/**
 * Accepted window inputs. We take ISO timestamps OR an Elasticsearch date-math
 * expression ("now-24h"). Defaults to a 24h lookback so the tile always shows
 * something even with no query params from the UI.
 */
const querySchema = schema.object({
  window_start: schema.maybe(schema.string({ minLength: 1, maxLength: 64 })),
  window_end: schema.maybe(schema.string({ minLength: 1, maxLength: 64 })),
  /**
   * B12 — JSON-encoded `Partial<HoursSavedConstants>` override of the
   * per-action minute constants used by the hours-saved proxy. Operators
   * tune the proxy without redeploying by passing e.g.
   * `?constants={"minutes_per_authoring":120}`. Malformed JSON is silently
   * ignored — defaults apply, dashboards never break.
   */
  constants: schema.maybe(schema.string({ minLength: 1, maxLength: 1024 })),
});

const DEFAULT_WINDOW_START = 'now-24h';
const DEFAULT_WINDOW_END = 'now';

export const registerGovernancePulseRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: GOVERNANCE_PULSE_ROUTE,
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
        const windowStart = request.query.window_start ?? DEFAULT_WINDOW_START;
        const windowEnd = request.query.window_end ?? DEFAULT_WINDOW_END;

        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;

          // Three independent searches fan out in parallel. Each is wrapped in
          // `Promise.allSettled` so a missing index (serverless cold start,
          // pre-M2.5 clusters) can't take down the whole Pulse tile.
          const [outcomesSettled, mutationSettled, trustSettled] = await Promise.allSettled([
            esClient.search({
              index: ARGUS_SOC_INDICES.outcomes,
              ignore_unavailable: true,
              size: 0,
              track_total_hits: false,
              query: {
                bool: {
                  filter: [
                    {
                      range: {
                        '@timestamp': { gte: windowStart, lte: windowEnd },
                      },
                    },
                  ],
                },
              },
              aggs: {
                outcomes_total: { value_count: { field: '@timestamp' } },
                rollback_count: {
                  filter: {
                    bool: {
                      filter: [
                        { term: { rolled_back: true } },
                        { exists: { field: 'rollback_mttr_ms' } },
                      ],
                    },
                  },
                  aggs: {
                    c: { value_count: { field: 'rollback_mttr_ms' } },
                  },
                },
                avg_mttr: { avg: { field: 'rollback_mttr_ms' } },
                mttr_percentiles: {
                  percentiles: { field: 'rollback_mttr_ms', percents: [50, 95] },
                },
                // B11 — MTTD aggregations. `time_to_detect` is a long (ms)
                // populated on `.soc-outcomes` rows produced by the SOC
                // simulation pipeline. Wrap the count in a filter agg so it
                // only counts outcomes that actually carry the field — a
                // straight `value_count` would double-count rows where the
                // field is missing in flat-mapping rollouts.
                detect_outcomes: {
                  filter: { exists: { field: 'time_to_detect' } },
                  aggs: {
                    c: { value_count: { field: 'time_to_detect' } },
                  },
                },
                avg_ttd: { avg: { field: 'time_to_detect' } },
                ttd_percentiles: {
                  percentiles: { field: 'time_to_detect', percents: [50, 95] },
                },
                // B12 — Hours-saved proxy source counts. Each filter agg
                // returns a `doc_count` the builder reads as a non-negative
                // integer.
                rules_authored: {
                  // Outcomes whose `applied_at` falls in the window AND that
                  // were not rolled back. Together these represent
                  // autonomously-authored detection rules that stayed in
                  // production — the counterfactual analyst-authoring time
                  // saved.
                  filter: {
                    bool: {
                      filter: [{ exists: { field: 'applied_at' } }],
                      must_not: [{ term: { rolled_back: true } }],
                    },
                  },
                },
                auto_triaged_outcomes: {
                  // Outcomes the autonomous pipeline closed end-to-end:
                  // `pipeline_complete=true` AND no human case was opened
                  // (`case_created=false`). The case-created flag is the
                  // cleanest discriminator the schema offers between
                  // analyst-handled vs autonomous closes.
                  filter: {
                    bool: {
                      filter: [
                        { term: { pipeline_complete: true } },
                        { term: { case_created: false } },
                      ],
                    },
                  },
                },
                auto_recovered_rollbacks: {
                  // Rollbacks AutoDEX handled itself — `rollback_source=auto`.
                  // No analyst paged.
                  filter: {
                    bool: {
                      filter: [
                        { term: { rolled_back: true } },
                        { term: { rollback_source: 'auto' } },
                      ],
                    },
                  },
                },
                human_rollbacks: {
                  // Rollbacks that required human triage — every
                  // `rolled_back=true` row whose `rollback_source` exists
                  // and is NOT `auto`. These cost analyst time and the
                  // builder subtracts the cost from the headline.
                  filter: {
                    bool: {
                      filter: [
                        { term: { rolled_back: true } },
                        { exists: { field: 'rollback_source' } },
                      ],
                      must_not: [{ term: { rollback_source: 'auto' } }],
                    },
                  },
                },
              },
            }),
            esClient.search({
              index: ARGUS_SOC_INDICES.mutationIntents,
              ignore_unavailable: true,
              size: 0,
              track_total_hits: false,
              query: {
                bool: {
                  filter: [
                    {
                      range: {
                        '@timestamp': { gte: windowStart, lte: windowEnd },
                      },
                    },
                  ],
                },
              },
              aggs: {
                blocked_count: {
                  filter: { term: { 'governance_gate.status': 'blocked' } },
                },
                drift_open: {
                  filter: {
                    bool: {
                      filter: [
                        { term: { drift_detected: true } },
                        {
                          bool: {
                            must_not: [{ term: { drift_resolved: true } }],
                          },
                        },
                      ],
                    },
                  },
                },
                drift_resolved: {
                  filter: {
                    bool: {
                      filter: [
                        { term: { drift_detected: true } },
                        { term: { drift_resolved: true } },
                      ],
                    },
                  },
                },
              },
            }),
            esClient.search({
              index: ARGUS_SOC_INDICES.actorTrustTiers,
              ignore_unavailable: true,
              size: 0,
              track_total_hits: false,
              aggs: {
                by_actor: {
                  terms: { field: 'actor_id', size: 500 },
                  aggs: {
                    latest: {
                      // Sort each actor's tier rows newest-first and take the
                      // top tier bucket; that is their "current" tier.
                      terms: {
                        field: 'tier',
                        size: 1,
                        order: { last_seen: 'desc' },
                      },
                      aggs: {
                        last_seen: { max: { field: '@timestamp' } },
                      },
                    },
                  },
                },
              },
            }),
          ]);

          const outcomesAggs =
            outcomesSettled.status === 'fulfilled'
              ? normaliseOutcomesAggs(outcomesSettled.value.aggregations)
              : null;
          const mutationAggs =
            mutationSettled.status === 'fulfilled'
              ? (mutationSettled.value.aggregations as unknown as
                  | MutationIntentsAggsInput
                  | undefined) ?? null
              : null;
          const trustAggs =
            trustSettled.status === 'fulfilled'
              ? (trustSettled.value.aggregations as unknown as
                  | ActorTrustTiersAggsInput
                  | undefined) ?? null
              : null;

          // Log (at debug) when a section failed — helps diagnose "why is my
          // drift tile empty" on a real cluster without shouting at users on
          // cold-start clusters where the index just doesn't exist yet.
          if (outcomesSettled.status === 'rejected') {
            logger.debug(`ARGUS pulse outcomes query failed: ${String(outcomesSettled.reason)}`);
          }
          if (mutationSettled.status === 'rejected') {
            logger.debug(
              `ARGUS pulse mutation-intents query failed: ${String(mutationSettled.reason)}`
            );
          }
          if (trustSettled.status === 'rejected') {
            logger.debug(`ARGUS pulse trust-tier query failed: ${String(trustSettled.reason)}`);
          }

          const result = buildGovernancePulse({
            windowStart,
            windowEnd,
            aggs: outcomesAggs,
            mutationAggs,
            trustAggs,
            hoursSavedOverrides: parseHoursSavedOverrides(request.query.constants, logger),
          });

          return response.ok({ body: result });
        } catch (err) {
          const error = transformError(err);
          logger.error(`ARGUS governance_pulse route failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};

/**
 * The outcomes query uses a filter sub-aggregation for `rollback_count`, so
 * the raw payload nests the count under `rollback_count.c.value`. Flatten it
 * back to the builder's expected `rollback_count.value` shape.
 */
const normaliseOutcomesAggs = (
  raw: Record<string, unknown> | undefined
): GovernancePulseAggsInput | null => {
  if (!raw) return null;
  const filtered = raw as {
    outcomes_total?: { value?: number | null };
    rollback_count?: { c?: { value?: number | null } };
    avg_mttr?: { value?: number | null };
    mttr_percentiles?: {
      values?: { ['50.0']?: number | null; ['95.0']?: number | null } | null;
    };
    detect_outcomes?: { c?: { value?: number | null } };
    avg_ttd?: { value?: number | null };
    ttd_percentiles?: {
      values?: { ['50.0']?: number | null; ['95.0']?: number | null } | null;
    };
    rules_authored?: { doc_count?: number | null };
    auto_triaged_outcomes?: { doc_count?: number | null };
    auto_recovered_rollbacks?: { doc_count?: number | null };
    human_rollbacks?: { doc_count?: number | null };
  };
  return {
    outcomes_total: filtered.outcomes_total ?? null,
    rollback_count: { value: filtered.rollback_count?.c?.value ?? 0 },
    avg_mttr: filtered.avg_mttr ?? null,
    mttr_percentiles: filtered.mttr_percentiles ?? null,
    detect_count: { value: filtered.detect_outcomes?.c?.value ?? 0 },
    avg_ttd: filtered.avg_ttd ?? null,
    ttd_percentiles: filtered.ttd_percentiles ?? null,
    rules_authored: filtered.rules_authored ?? null,
    auto_triaged_outcomes: filtered.auto_triaged_outcomes ?? null,
    auto_recovered_rollbacks: filtered.auto_recovered_rollbacks ?? null,
    human_rollbacks: filtered.human_rollbacks ?? null,
  };
};

/**
 * B12 — Parse the optional `?constants=` JSON-encoded override blob into a
 * `Partial<HoursSavedConstants>` the builder can consume. Defensive on every
 * level: malformed JSON, non-object payloads, unknown keys, non-numeric
 * values are all silently dropped — the builder falls back to defaults for
 * any unset key. We only debug-log parse failures so a typo in a dashboard
 * URL never breaks the Pulse tile, but operators still have a forensic trail.
 */
const parseHoursSavedOverrides = (
  raw: string | undefined,
  logger: ArgusRoutesDeps['logger']
): Partial<HoursSavedConstants> | null => {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.debug(`ARGUS pulse hours-saved constants override is not valid JSON: ${String(err)}`);
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const candidate = parsed as Record<string, unknown>;
  const overrides: { -readonly [K in keyof HoursSavedConstants]?: HoursSavedConstants[K] } = {};
  const accept = (key: keyof HoursSavedConstants) => {
    const value = candidate[key];
    if (typeof value !== 'number') return;
    overrides[key] = value;
  };
  accept('minutes_per_authoring');
  accept('minutes_per_triage');
  accept('minutes_per_rollback_recovery');
  accept('minutes_per_human_rollback');
  return Object.keys(overrides).length > 0 ? (overrides as Partial<HoursSavedConstants>) : null;
};

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
  ARGUS_SOC_INDICES,
  ARGUS_WRITE_API_CAPABILITY,
  MUTATION_VERDICT_ROUTE,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';

/**
 * The route targets the recommendation document (source of truth for
 * mutation intents that passed through the gate cascade). Flipping `status`
 * is what actually takes a mutation out of the applier's queue:
 *
 *   approve → status = 'approved_by_human'
 *   reject  → status = 'rejected_by_human'
 *
 * We also stamp `review_reason`, `reviewed_by`, and `reviewed_at` so the
 * audit and MutationsPanel row can surface *why* without re-querying the
 * audit trail.
 */
const ACTION_VALUES = ['approve', 'reject'] as const;

type Action = (typeof ACTION_VALUES)[number];

const STATUS_FOR_ACTION: Record<Action, string> = {
  approve: 'approved_by_human',
  reject: 'rejected_by_human',
};

const bodySchema = schema.object({
  mutation_intent_id: schema.string({ minLength: 1, maxLength: 256 }),
  action: schema.oneOf([schema.literal(ACTION_VALUES[0]), schema.literal(ACTION_VALUES[1])]),
  reason: schema.maybe(schema.string({ minLength: 1, maxLength: 2048 })),
});

export const registerMutationVerdictRoute = (deps: ArgusRoutesDeps) => {
  const { router, logger } = deps;
  router.versioned
    .post({
      access: 'internal',
      path: MUTATION_VERDICT_ROUTE,
      security: {
        authz: {
          requiredPrivileges: [ARGUS_WRITE_API_CAPABILITY],
        },
      },
    })
    .addVersion(
      { version: '1', validate: { request: { body: bodySchema } } },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);
        try {
          const { mutation_intent_id: id, action, reason } = request.body;

          if (action === 'reject' && !reason) {
            return siemResponse.error({
              statusCode: 400,
              body: 'Rejections require a non-empty reason.',
            });
          }

          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;
          const username = core.security.authc.getCurrentUser()?.username ?? 'unknown';

          const previous = await fetchRecommendation(esClient, id);
          if (!previous) {
            return siemResponse.error({
              statusCode: 404,
              body: `No recommendation found for mutation_intent_id=${id}`,
            });
          }

          const previousStatus =
            typeof previous.source.status === 'string' ? previous.source.status : undefined;
          if (previousStatus && TERMINAL_STATUSES.has(previousStatus)) {
            // Refuse to re-review a mutation that has already been applied,
            // rolled back, or otherwise closed. The UI should never let this
            // happen, but we guard anyway so a stale tab can't corrupt state.
            return siemResponse.error({
              statusCode: 409,
              body: `Mutation is already in terminal status '${previousStatus}' — cannot ${action}.`,
            });
          }

          const now = new Date().toISOString();
          const newStatus = STATUS_FOR_ACTION[action];
          const reviewReason = reason ?? (action === 'approve' ? 'Approved via Argus Console' : '');

          await esClient.update({
            index: ARGUS_SOC_INDICES.recommendations,
            id: previous.doc_id,
            refresh: 'wait_for',
            doc: {
              status: newStatus,
              review_reason: reviewReason,
              reviewed_by: username,
              reviewed_at: now,
            },
          });

          const auditId = `${id}:${now}`;
          await writeAuditEntry(
            esClient,
            {
              '@timestamp': now,
              audit_id: auditId,
              action: action === 'approve' ? 'mutation_approve' : 'mutation_reject',
              subject_kind: 'mutation_intent',
              subject_id: id,
              actor: username,
              from: { status: previousStatus },
              to: { status: newStatus },
              reason: reviewReason,
            },
            logger
          );

          return response.ok({
            body: {
              mutation_intent_id: id,
              action,
              previous_status: previousStatus,
              new_status: newStatus,
              audit_id: auditId,
              reason: reviewReason || undefined,
            },
          });
        } catch (err) {
          const error = transformError(err);
          logger.error(`Argus mutation_verdict route failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};

const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'applied',
  // Once approved, the mutation leaves the human-review queue and moves
  // into the applier pipeline. Re-approving is meaningless and the UI
  // must not allow a second verdict — guard it server-side as well.
  'approved_by_human',
  'rolled_back',
  'rejected',
  'rejected_by_human',
  'rejected_backtest',
  'failed',
]);

/**
 * Recommendations are indexed with an auto-generated ES `_id` that is NOT
 * the same as `mutation_intent_id`. The UI only knows the latter (it's what
 * the applier chains through the rest of the Argus pipeline), so we look
 * up by the business key and return both the `_id` (needed for `update`)
 * and the `_source` payload.
 */
const fetchRecommendation = async (
  esClient: ElasticsearchClient,
  mutationIntentId: string
): Promise<{ doc_id: string; source: Record<string, unknown> } | undefined> => {
  // `mutation_intent_id` is mapped as `text` with a `.keyword` subfield on
  // `.soc-recommendations`, so we `term` against the keyword form *and* fall
  // back to the parent field — different deployments may have dropped the
  // multi-field during reindexing.
  const res = await esClient.search<Record<string, unknown>>({
    index: ARGUS_SOC_INDICES.recommendations,
    size: 1,
    query: {
      bool: {
        should: [
          { term: { 'mutation_intent_id.keyword': mutationIntentId } },
          { term: { mutation_intent_id: mutationIntentId } },
        ],
        minimum_should_match: 1,
      },
    },
  });
  const hit = res.hits.hits[0];
  if (!hit || !hit._source) return undefined;
  return { doc_id: hit._id as string, source: hit._source };
};

const writeAuditEntry = async (
  esClient: ElasticsearchClient,
  entry: Record<string, unknown>,
  logger: Logger
): Promise<void> => {
  try {
    await esClient.index({
      index: ARGUS_SOC_INDICES.auditTrail,
      document: entry,
    });
  } catch (err) {
    // Audit failures must not block the primary write (status transition on
    // the recommendation is the source of truth), but silent failures are
    // un-diagnosable. Log a warning so orphan verdicts are traceable.
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `Argus audit_trail write failed for ${entry.subject_kind}=${entry.subject_id}: ${message}`
    );
  }
};

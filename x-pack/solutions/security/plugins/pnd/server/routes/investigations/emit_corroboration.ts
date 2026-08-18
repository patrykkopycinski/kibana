/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { API_VERSIONS, INTERNAL_API_ACCESS, PND_INVESTIGATIONS_URL } from '@kbn/pnd-common';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { PND_API_PRIVILEGE_READ } from '../../../common/constants';
import type { RouteDependencies } from '../register_routes';

const corroborationEventSchema = z.object({
  investigationId: z.string().min(1),
  corroboratedEvents: z.array(
    z.object({
      stage: z.string(),
      evidence: z.string(),
      query: z.string().optional(),
      confidence: z.number().min(0).max(1),
    })
  ),
  gapEvents: z.array(
    z.object({
      stage: z.string(),
      expected: z.string(),
      possibleCauses: z.string().optional(),
    })
  ),
  confidence: z.number().min(0).max(1),
  unresolvedQuestions: z.array(z.string()),
});

const CORROBORATION_PATH = `${PND_INVESTIGATIONS_URL}/_emit_corroboration` as const;

export const registerEmitCorroborationRoute = ({
  router,
  logger,
  getInvestigationStore,
}: RouteDependencies) => {
  router.versioned
    .post({
      path: CORROBORATION_PATH,
      access: INTERNAL_API_ACCESS,
      security: {
        authz: { requiredPrivileges: [PND_API_PRIVILEGE_READ] },
      },
      summary: 'Persist a raw log corroboration report as a timeline event on an Investigation',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            body: buildRouteValidationWithZod(corroborationEventSchema),
          },
        },
      },
      async (context, request, response) => {
        const { investigationId, corroboratedEvents, gapEvents, confidence, unresolvedQuestions } =
          request.body;

        const store = getInvestigationStore();
        if (!store) {
          return response.customError({
            statusCode: 503,
            body: { message: 'Investigation store not available' },
          });
        }

        const esClient = (await context.core).elasticsearch.client.asCurrentUser;

        try {
          await store.recordDeepWatchOutcome(esClient, {
            investigationId,
            events: [
              {
                id: `corroboration-${investigationId}`,
                timestamp: new Date().toISOString(),
                type: 'corroboration-report',
                summary: JSON.stringify({
                  corroboratedEvents,
                  gapEvents,
                  confidence,
                  unresolvedQuestions,
                }),
              },
            ],
            status: 'corroborated',
            summary: `Corroboration report - confidence: ${confidence}, gaps: ${gapEvents.length}`,
          });

          return response.ok({
            body: {
              investigationId,
              persisted: true,
              corroboratedCount: corroboratedEvents.length,
              gapCount: gapEvents.length,
            },
          });
        } catch (error) {
          logger.error(`Failed to persist corroboration report: ${error}`);
          return response.customError({
            statusCode: 500,
            body: { message: 'Failed to persist corroboration report' },
          });
        }
      }
    );
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { KibanaRequest, RequestHandlerContext } from '@kbn/core/server';
import { daybreakApiPath } from '../../common/http_api';
import { createProposalClient } from '../client/proposals/client';
import type { ProposalClient } from '../client/proposals/client';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';
import { buildProposalFromWorkerRun } from '../common/schemas/proposal_builder';
import { enrichAlertSchema } from '../workflow/enrich_alert_schema';
import { validateReasonOutput } from '../workflow/output_validation_guard';

const fromWorkerBodySchema = schema.object({
  enrichedJson: schema.string(),
  reasonJson: schema.string(),
  sourceWatchId: schema.maybe(schema.string()),
});

export const registerProposalsFromWorkerRoute = (dependencies: RouteDependencies) => {
  const { logger, router, getSpaceId } = dependencies;
  const wrapHandler = getHandlerWrapper({ logger });

  const getScopedClient = async (
    ctx: RequestHandlerContext,
    request: KibanaRequest
  ): Promise<ProposalClient> => {
    const {
      elasticsearch: { client },
    } = await ctx.core;
    return createProposalClient({
      space: getSpaceId(request),
      logger,
      esClient: client.asInternalUser,
    });
  };

  router.post(
    {
      path: `${daybreakApiPath}/proposals/from-worker-run`,
      security: daybreakRouteSecurity,
      validate: { body: fromWorkerBodySchema },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getScopedClient(ctx, request);

      let enrichedRaw;
      let reasonRaw;
      try {
        enrichedRaw = JSON.parse(request.body.enrichedJson);
        reasonRaw = JSON.parse(request.body.reasonJson);
      } catch (err) {
        return response.badRequest({ body: { message: `Invalid JSON body: ${(err as Error).message}` } });
      }

      const enriched = enrichAlertSchema(enrichedRaw);
      const reason = validateReasonOutput({ structured_output: reasonRaw });

      const proposal = buildProposalFromWorkerRun({
        id: enriched.alertId,
        enriched,
        reason,
        sourceWatchId: request.body.sourceWatchId,
        sourceWorkerId: 'daybreak-alert-analysis-worker',
        capability: 'alert-analysis',
        space: getSpaceId(request),
      });

      const created = await client.create(proposal);
      return response.ok({ body: created });
    })
  );
};

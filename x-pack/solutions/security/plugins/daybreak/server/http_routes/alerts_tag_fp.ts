/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { RequestHandlerContext, KibanaRequest } from '@kbn/core/server';
import { daybreakApiPath } from '../../common/http_api';
import { createProposalClient } from '../client/proposals/client';
import type { ProposalClient } from '../client/proposals/client';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';
import { resolveProposalAlertId } from '../workflow/resolve_proposal_alert_id';

const tagFpBodySchema = schema.object({
  proposalId: schema.string(),
  alertId: schema.maybe(schema.string()),
  tag: schema.maybe(schema.string()),
});

export const registerAlertsTagFpRoute = ({
  logger,
  router,
  getSpaceId,
}: RouteDependencies) => {
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
      path: `${daybreakApiPath}/alerts/tag-fp`,
      security: daybreakRouteSecurity,
      validate: { body: tagFpBodySchema },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getScopedClient(ctx, request);
      const proposal = await client.get(request.body.proposalId);
      const resolvedAlertId =
        request.body.alertId ?? resolveProposalAlertId(proposal) ?? proposal.id;
      const tag = request.body.tag ?? 'FP';

      logger.info(
        `daybreak: tag-fp post-dismiss — proposalId=${proposal.id}, alertId=${resolvedAlertId}, tag=${tag}, status=${proposal.status}`
      );

      return response.ok({
        body: {
          proposalId: proposal.id,
          alertId: resolvedAlertId,
          tag,
          tagged: true,
          stub: true,
        },
      });
    })
  );
};

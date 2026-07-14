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
import { createSkiClient } from '../client/ski/client';
import type { SkiClient } from '../client/ski/client';
import { mapSkiToHuntProposal } from '../common/schemas/hunt_adapter';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';

const huntBodySchema = schema.object({
  proposalId: schema.string(),
  skiId: schema.string(),
  sourceWatchId: schema.maybe(schema.string()),
  sourceWorkerId: schema.maybe(schema.string()),
});

export const registerProposalsFromHuntRoute = (dependencies: RouteDependencies) => {
  const { logger, router, getSpaceId } = dependencies;
  const wrapHandler = getHandlerWrapper({ logger });

  const getProposalClient = async (
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

  const getSkiClient = async (
    ctx: RequestHandlerContext,
    request: KibanaRequest
  ): Promise<SkiClient> => {
    const {
      elasticsearch: { client },
    } = await ctx.core;
    return createSkiClient({
      space: getSpaceId(request),
      logger,
      esClient: client.asInternalUser,
    });
  };

  router.post(
    {
      path: `${daybreakApiPath}/proposals/from-hunt`,
      security: daybreakRouteSecurity,
      validate: { body: huntBodySchema },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const space = getSpaceId(request);
      const ski = await (await getSkiClient(ctx, request)).get(request.body.skiId);

      const proposal = mapSkiToHuntProposal({
        proposalId: request.body.proposalId,
        ski,
        sourceWatchId: request.body.sourceWatchId,
        sourceWorkerId: request.body.sourceWorkerId,
        space,
      });

      const created = await (await getProposalClient(ctx, request)).create(proposal);
      return response.ok({ body: created });
    })
  );
};

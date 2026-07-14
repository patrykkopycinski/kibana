/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { KibanaRequest, RequestHandlerContext } from '@kbn/core/server';
import { daybreakApiPath } from '../../common/http_api';
import { createActionResultClient } from '../client/action_results/client';
import type { ActionResultClient } from '../client/action_results/client';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';

export const registerActionResultRoutes = ({ logger, router, getSpaceId }: RouteDependencies) => {
  const wrapHandler = getHandlerWrapper({ logger });

  const getClient = async (
    ctx: RequestHandlerContext,
    request: KibanaRequest
  ): Promise<ActionResultClient> => {
    const {
      elasticsearch: { client },
    } = await ctx.core;
    return createActionResultClient({
      space: getSpaceId(request),
      logger,
      esClient: client.asInternalUser,
    });
  };

  router.get(
    {
      path: `${daybreakApiPath}/action-results`,
      security: daybreakRouteSecurity,
      validate: {
        query: schema.object({
          proposalId: schema.maybe(schema.string()),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getClient(ctx, request);
      const results = request.query.proposalId
        ? await client.listByProposalId(request.query.proposalId)
        : await client.list();
      return response.ok({ body: { results } });
    })
  );

  router.get(
    {
      path: `${daybreakApiPath}/action-results/{id}`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getClient(ctx, request);
      const actionResult = await client.get(request.params.id);
      return response.ok({ body: actionResult });
    })
  );
};

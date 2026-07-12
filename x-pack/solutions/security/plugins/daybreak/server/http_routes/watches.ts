/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { KibanaRequest, RequestHandlerContext } from '@kbn/core/server';
import { daybreakApiPath } from '../../common/http_api';
import { createWatchClient } from '../client/watch/client';
import type { WatchClient } from '../client/watch/client';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';

const watchStatusSchema = schema.oneOf([
  schema.literal('active'),
  schema.literal('paused'),
  schema.literal('draft'),
]);
const autonomyTierSchema = schema.oneOf([
  schema.literal('auto-run'),
  schema.literal('proposed-diff'),
  schema.literal('approval-required'),
]);

export const registerWatchRoutes = ({ logger, router, getSpaceId }: RouteDependencies) => {
  const wrapHandler = getHandlerWrapper({ logger });
  const getScopedClient = async (
    ctx: RequestHandlerContext,
    request: KibanaRequest
  ): Promise<WatchClient> => {
    const {
      elasticsearch: { client },
    } = await ctx.core;
    return createWatchClient({
      space: getSpaceId(request),
      logger,
      esClient: client.asInternalUser,
    });
  };

  router.get(
    {
      path: `${daybreakApiPath}/watches`,
      security: daybreakRouteSecurity,
      validate: false,
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const results = await (await getScopedClient(ctx, request)).list();
      return response.ok({ body: { results } });
    })
  );

  router.get(
    {
      path: `${daybreakApiPath}/watches/{id}`,
      security: daybreakRouteSecurity,
      validate: { params: schema.object({ id: schema.string() }) },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const watch = await (await getScopedClient(ctx, request)).get(request.params.id);
      return response.ok({ body: watch });
    })
  );

  router.post(
    {
      path: `${daybreakApiPath}/watches`,
      security: daybreakRouteSecurity,
      validate: {
        body: schema.object({
          id: schema.string(),
          name: schema.string(),
          description: schema.string(),
          surface: schema.string(),
          status: schema.maybe(watchStatusSchema),
          autonomyTier: autonomyTierSchema,
          skillIds: schema.maybe(schema.arrayOf(schema.string())),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const watch = await (await getScopedClient(ctx, request)).create(request.body);
      return response.ok({ body: watch });
    })
  );

  router.put(
    {
      path: `${daybreakApiPath}/watches/{id}`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({ id: schema.string() }),
        body: schema.object({
          name: schema.maybe(schema.string()),
          description: schema.maybe(schema.string()),
          surface: schema.maybe(schema.string()),
          status: schema.maybe(watchStatusSchema),
          autonomyTier: schema.maybe(autonomyTierSchema),
          skillIds: schema.maybe(schema.arrayOf(schema.string())),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const watch = await (
        await getScopedClient(ctx, request)
      ).update(request.params.id, request.body);
      return response.ok({ body: watch });
    })
  );
};

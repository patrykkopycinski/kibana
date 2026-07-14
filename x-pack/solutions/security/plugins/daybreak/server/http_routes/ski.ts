/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { KibanaRequest, RequestHandlerContext } from '@kbn/core/server';
import { daybreakApiPath } from '../../common/http_api';
import { createSkiClient } from '../client/ski/client';
import type { SkiClient } from '../client/ski/client';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';

const skiTypeSchema = schema.oneOf([
  schema.literal('technology'),
  schema.literal('vulnerability'),
  schema.literal('threat'),
  schema.literal('coverage_gap'),
]);

export const registerSkiRoutes = ({ logger, router, getSpaceId }: RouteDependencies) => {
  const wrapHandler = getHandlerWrapper({ logger });
  const getScopedClient = async (
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

  router.get(
    {
      path: `${daybreakApiPath}/ski`,
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
      path: `${daybreakApiPath}/ski/{id}`,
      security: daybreakRouteSecurity,
      validate: { params: schema.object({ id: schema.string() }) },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const ski = await (await getScopedClient(ctx, request)).get(request.params.id);
      return response.ok({ body: ski });
    })
  );

  router.post(
    {
      path: `${daybreakApiPath}/ski`,
      security: daybreakRouteSecurity,
      validate: {
        body: schema.object({
          id: schema.string(),
          type: skiTypeSchema,
          normalizedName: schema.string(),
          source: schema.string(),
          collectedAt: schema.maybe(schema.string()),
          confidence: schema.number(),
          scope: schema.string(),
          supportingEvidence: schema.maybe(schema.arrayOf(schema.string())),
          relatedRefs: schema.maybe(schema.arrayOf(schema.string())),
          expiresAt: schema.maybe(schema.string()),
          sourceWatch: schema.maybe(schema.string()),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const ski = await (await getScopedClient(ctx, request)).create(request.body);
      return response.ok({ body: ski });
    })
  );
};

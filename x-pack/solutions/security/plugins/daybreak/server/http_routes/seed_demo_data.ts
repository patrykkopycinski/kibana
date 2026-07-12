/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { RequestHandlerContext } from '@kbn/core/server';
import { daybreakApiPath } from '../../common/http_api';
import { seedDemoData } from '../seed_demo_data';
import type { RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';

export const registerSeedDemoDataRoute = ({ logger, router, getSpaceId }: RouteDependencies) => {
  const wrapHandler = getHandlerWrapper({ logger });

  router.post(
    {
      path: `${daybreakApiPath}/seed-demo`,
      security: {
        authz: {
          enabled: false,
          reason: 'Internal demo-data seed route for local development only.',
        },
      },
      validate: {
        body: schema.object({
          confirm: schema.literal(true),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx: RequestHandlerContext, request, response) => {
      const {
        elasticsearch: { client },
      } = await ctx.core;
      const result = await seedDemoData({
        space: getSpaceId(request),
        logger,
        esClient: client.asInternalUser,
      });
      return response.ok({ body: result });
    })
  );
};

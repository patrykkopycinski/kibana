/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, RequestHandlerContext } from '@kbn/core/server';
import { daybreakApiPath } from '../../common/http_api';
import { createWorkerEvalRecordClient } from '../client/worker_eval_records';
import type { WorkerEvalRecordClient } from '../client/worker_eval_records';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';

export const registerWorkerEvalRecordRoutes = (dependencies: RouteDependencies) => {
  const { logger, router, getSpaceId } = dependencies;
  const wrapHandler = getHandlerWrapper({ logger });

  const getClient = async (
    ctx: RequestHandlerContext,
    request: KibanaRequest
  ): Promise<WorkerEvalRecordClient> => {
    const {
      elasticsearch: { client },
    } = await ctx.core;
    return createWorkerEvalRecordClient({
      space: getSpaceId(request),
      logger,
      esClient: client.asInternalUser,
    });
  };

  router.get(
    {
      path: `${daybreakApiPath}/worker-eval-records`,
      security: daybreakRouteSecurity,
      validate: false,
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) =>
      response.ok({ body: { results: await (await getClient(ctx, request)).list() } })
    )
  );
};

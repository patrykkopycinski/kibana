/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { KibanaRequest, RequestHandlerContext } from '@kbn/core/server';
import { daybreakApiPath } from '../../common/http_api';
import { createWorkflowClient } from '../client/workflow/client';
import type { WorkflowClient } from '../client/workflow/client';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';

const workflowBodySchema = {
  id: schema.string(),
  name: schema.string(),
  trigger: schema.string(),
  skillId: schema.string(),
  outcome: schema.string(),
  watchIds: schema.maybe(schema.arrayOf(schema.string())),
  enabled: schema.maybe(schema.boolean()),
  priority: schema.maybe(schema.number()),
};

export const registerWorkflowRoutes = (dependencies: RouteDependencies) => {
  const { logger, router, getSpaceId } = dependencies;
  const wrapHandler = getHandlerWrapper({ logger });
  const getClient = async (
    ctx: RequestHandlerContext,
    request: KibanaRequest
  ): Promise<WorkflowClient> => {
    const {
      elasticsearch: { client },
    } = await ctx.core;
    return createWorkflowClient({
      space: getSpaceId(request),
      logger,
      esClient: client.asInternalUser,
    });
  };

  router.get(
    {
      path: `${daybreakApiPath}/workflows`,
      security: daybreakRouteSecurity,
      validate: false,
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) =>
      response.ok({ body: { results: await (await getClient(ctx, request)).list() } })
    )
  );
  router.get(
    {
      path: `${daybreakApiPath}/workflows/{id}`,
      security: daybreakRouteSecurity,
      validate: { params: schema.object({ id: schema.string() }) },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) =>
      response.ok({ body: await (await getClient(ctx, request)).get(request.params.id) })
    )
  );
  router.post(
    {
      path: `${daybreakApiPath}/workflows`,
      security: daybreakRouteSecurity,
      validate: { body: schema.object(workflowBodySchema) },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) =>
      response.ok({ body: await (await getClient(ctx, request)).create(request.body) })
    )
  );
  router.post(
    {
      path: `${daybreakApiPath}/workflows/{id}/execute`,
      security: daybreakRouteSecurity,
      validate: { params: schema.object({ id: schema.string() }) },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const workflow = await (await getClient(ctx, request)).get(request.params.id);
      if (!workflow.enabled) {
        return response.conflict({ body: { message: `Workflow "${workflow.id}" is paused.` } });
      }
      if (!dependencies.executeAlertAnalysisWorker) {
        return response.customError({
          statusCode: 503,
          body: { message: 'Daybreak workflow execution engine is unavailable.' },
        });
      }
      const workflowExecutionId = await dependencies.executeAlertAnalysisWorker(request);
      const updated = await (
        await getClient(ctx, request)
      ).recordExecution(workflow.id, new Date().toISOString());
      return response.ok({ body: { workflow: updated, workflowExecutionId } });
    })
  );

  router.delete(
    {
      path: `${daybreakApiPath}/workflows/{id}`,
      security: daybreakRouteSecurity,
      validate: { params: schema.object({ id: schema.string() }) },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) =>
      response.ok({ body: await (await getClient(ctx, request)).delete(request.params.id) })
    )
  );

  router.put(
    {
      path: `${daybreakApiPath}/workflows/{id}`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({ id: schema.string() }),
        body: schema.object({
          name: schema.maybe(schema.string()),
          trigger: schema.maybe(schema.string()),
          skillId: schema.maybe(schema.string()),
          outcome: schema.maybe(schema.string()),
          watchIds: schema.maybe(schema.arrayOf(schema.string())),
          enabled: schema.maybe(schema.boolean()),
          priority: schema.maybe(schema.number()),
          lastRunAt: schema.maybe(schema.string()),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) =>
      response.ok({
        body: await (await getClient(ctx, request)).update(request.params.id, request.body),
      })
    )
  );
};

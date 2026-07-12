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

const proposalStatusSchema = schema.oneOf([
  schema.literal('new'),
  schema.literal('needs-evidence'),
  schema.literal('approved'),
  schema.literal('modified'),
  schema.literal('dismissed'),
  schema.literal('escalated'),
  schema.literal('deferred'),
]);

const proposalSeveritySchema = schema.oneOf([
  schema.literal('low'),
  schema.literal('medium'),
  schema.literal('high'),
  schema.literal('critical'),
]);

interface RequestAuthWithUser {
  getCurrentUser(): { username: string; profile_uid?: string } | null;
}

export const registerProposalRoutes = ({ logger, router, getSpaceId }: RouteDependencies) => {
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

  const getActor = (request: KibanaRequest): string => {
    const user = (request.auth as unknown as RequestAuthWithUser | undefined)?.getCurrentUser?.();
    return user?.profile_uid ?? user?.username ?? 'unknown';
  };

  // List proposals
  router.get(
    {
      path: `${daybreakApiPath}/proposals`,
      security: daybreakRouteSecurity,
      validate: {
        query: schema.object({
          status: schema.maybe(proposalStatusSchema),
          severity: schema.maybe(proposalSeveritySchema),
          capability: schema.maybe(schema.string()),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getScopedClient(ctx, request);
      const results = await client.list({
        status: request.query.status,
        severity: request.query.severity,
        capability: request.query.capability,
      });
      return response.ok({ body: { results } });
    })
  );

  // Get proposal by id
  router.get(
    {
      path: `${daybreakApiPath}/proposals/{id}`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getScopedClient(ctx, request);
      const proposal = await client.get(request.params.id);
      return response.ok({ body: proposal });
    })
  );

  // Transition proposal status — gate-approval flow (FR-7, FR-016, FR-017).
  // The readiness gate runs server-side inside transitionStatus; a failed
  // gate surfaces as a 422 (Unprocessable Content) carrying the GateFailure
  // body, so the UI can render the specific missing requirement (FR-018).
  router.post(
    {
      path: `${daybreakApiPath}/proposals/{id}/transition`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
        body: schema.object({
          targetStatus: proposalStatusSchema,
          actor: schema.maybe(schema.string()),
          reason: schema.maybe(schema.string()),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getScopedClient(ctx, request);
      const actor = request.body.actor ?? getActor(request);
      const proposal = await client.transitionStatus(
        request.params.id,
        request.body.targetStatus,
        actor,
        request.body.reason
      );
      return response.ok({ body: proposal });
    })
  );
};

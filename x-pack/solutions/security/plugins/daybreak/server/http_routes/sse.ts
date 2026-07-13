/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { KibanaRequest, RequestHandlerContext } from '@kbn/core/server';
import { daybreakApiPath } from '../../common/http_api';
import { createSseClient } from '../client/sse/client';
import type { SseClient } from '../client/sse/client';
import { buildSseFromInvestigation, buildSseFromProposal } from '../common/schemas/sse_builder';
import { createInvestigationClient } from '../client/investigations/client';
import type { InvestigationClient } from '../client/investigations/client';
import { createProposalClient } from '../client/proposals/client';
import type { ProposalClient } from '../client/proposals/client';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';

const sseStatusSchema = schema.oneOf([
  schema.literal('open'),
  schema.literal('acknowledged'),
  schema.literal('closed'),
  schema.literal('escalated'),
]);

export const registerSseRoutes = ({ logger, router, getSpaceId }: RouteDependencies) => {
  const wrapHandler = getHandlerWrapper({ logger });

  const getSseClient = async (
    ctx: RequestHandlerContext,
    request: KibanaRequest
  ): Promise<SseClient> => {
    const {
      elasticsearch: { client },
    } = await ctx.core;
    return createSseClient({
      space: getSpaceId(request),
      logger,
      esClient: client.asInternalUser,
    });
  };

  const getInvestigationClient = async (
    ctx: RequestHandlerContext,
    request: KibanaRequest
  ): Promise<InvestigationClient> => {
    const {
      elasticsearch: { client },
    } = await ctx.core;
    return createInvestigationClient({
      space: getSpaceId(request),
      logger,
      esClient: client.asInternalUser,
    });
  };

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

  // List SSEs
  router.get(
    {
      path: `${daybreakApiPath}/sse`,
      security: daybreakRouteSecurity,
      validate: false,
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getSseClient(ctx, request);
      const results = await client.list();
      return response.ok({ body: { results } });
    })
  );

  // Get SSE by id
  router.get(
    {
      path: `${daybreakApiPath}/sse/{id}`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({ id: schema.string() }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getSseClient(ctx, request);
      const sse = await client.get(request.params.id);
      return response.ok({ body: sse });
    })
  );

  // Create an SSE from a proposal
  router.post(
    {
      path: `${daybreakApiPath}/sse/from-proposal`,
      security: daybreakRouteSecurity,
      validate: {
        body: schema.object({
          proposalId: schema.string(),
          sseId: schema.maybe(schema.string()),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const proposalClient = await getProposalClient(ctx, request);
      const sseClient = await getSseClient(ctx, request);
      const proposal = await proposalClient.get(request.body.proposalId);
      const sseId = request.body.sseId ?? `sse-${proposal.id}`;
      const sse = buildSseFromProposal({ sseId, proposal });
      const created = await sseClient.create(sse);
      return response.ok({ body: created });
    })
  );

  // Create an SSE from an investigation
  router.post(
    {
      path: `${daybreakApiPath}/sse/from-investigation`,
      security: daybreakRouteSecurity,
      validate: {
        body: schema.object({
          investigationId: schema.string(),
          sseId: schema.maybe(schema.string()),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const investigationClient = await getInvestigationClient(ctx, request);
      const sseClient = await getSseClient(ctx, request);
      const investigation = await investigationClient.get(request.body.investigationId);
      const sseId = request.body.sseId ?? `sse-${investigation.id}`;
      const sse = buildSseFromInvestigation({ sseId, investigation });
      const created = await sseClient.create(sse);
      return response.ok({ body: created });
    })
  );

  // Update SSE status
  router.put(
    {
      path: `${daybreakApiPath}/sse/{id}`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({ id: schema.string() }),
        body: schema.object({
          status: schema.maybe(sseStatusSchema),
          description: schema.maybe(schema.string()),
          destinations: schema.maybe(
            schema.arrayOf(
              schema.object({
                id: schema.string(),
                kind: schema.oneOf([
                  schema.literal('case'),
                  schema.literal('siem'),
                  schema.literal('webhook'),
                  schema.literal('slack'),
                  schema.literal('email'),
                ]),
                reference: schema.maybe(schema.string()),
              })
            )
          ),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getSseClient(ctx, request);
      const updated = await client.update(request.params.id, request.body);
      return response.ok({ body: updated });
    })
  );

  // Delete SSE
  router.delete(
    {
      path: `${daybreakApiPath}/sse/{id}`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({ id: schema.string() }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getSseClient(ctx, request);
      const deleted = await client.delete(request.params.id);
      return response.ok({ body: { deleted } });
    })
  );
};

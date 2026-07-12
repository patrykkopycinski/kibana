/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { KibanaRequest, RequestHandlerContext } from '@kbn/core/server';
import { daybreakApiPath } from '../../common/http_api';
import { createEvidenceClient } from '../client/evidence/client';
import type { EvidenceClient } from '../client/evidence/client';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';

const evidenceKindSchema = schema.oneOf([
  schema.literal('alert'),
  schema.literal('event'),
  schema.literal('entity'),
  schema.literal('timeline'),
  schema.literal('query'),
  schema.literal('assumption'),
  schema.literal('external'),
]);

const evidenceStanceSchema = schema.oneOf([schema.literal('for'), schema.literal('against')]);

const evidenceProvenanceSchema = schema.oneOf([
  schema.literal('capability'),
  schema.literal('skillVersion'),
  schema.literal('tool'),
]);

export const registerEvidenceRoutes = ({ logger, router, getSpaceId }: RouteDependencies) => {
  const wrapHandler = getHandlerWrapper({ logger });

  const getScopedClient = async (
    ctx: RequestHandlerContext,
    request: KibanaRequest
  ): Promise<EvidenceClient> => {
    const {
      elasticsearch: { client },
    } = await ctx.core;
    return createEvidenceClient({
      space: getSpaceId(request),
      logger,
      esClient: client.asInternalUser,
    });
  };

  // List evidence
  router.get(
    {
      path: `${daybreakApiPath}/evidence`,
      security: daybreakRouteSecurity,
      validate: {
        query: schema.object({
          kind: schema.maybe(evidenceKindSchema),
          stance: schema.maybe(evidenceStanceSchema),
          provenance: schema.maybe(evidenceProvenanceSchema),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getScopedClient(ctx, request);
      const results = await client.list({
        kind: request.query.kind,
        stance: request.query.stance,
        provenance: request.query.provenance,
      });
      return response.ok({ body: { results } });
    })
  );

  // Get evidence by id
  router.get(
    {
      path: `${daybreakApiPath}/evidence/{id}`,
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
      const evidence = await client.get(request.params.id);
      return response.ok({ body: evidence });
    })
  );
};

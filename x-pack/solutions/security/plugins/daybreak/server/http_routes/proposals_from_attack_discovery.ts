/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { KibanaRequest, RequestHandlerContext } from '@kbn/core/server';
import { daybreakApiPath } from '../../common/http_api';
import { createProposalClient } from '../client/proposals/client';
import type { ProposalClient } from '../client/proposals/client';
import { createEvidenceClient } from '../client/evidence/client';
import {
  mapAttackDiscoveryToProposal,
  type AttackDiscoveryInput,
} from '../common/schemas/attack_discovery_adapter';
import { toEvidenceProperties } from '../common/schemas/evidence_package';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';

const adBodySchema = schema.object({
  proposalId: schema.string(),
  ad: schema.object({}, { unknowns: 'allow' }),
  generation: schema.maybe(
    schema.object({
      execution_uuid: schema.string(),
      connector_id: schema.string(),
      connector_name: schema.maybe(schema.string()),
      status: schema.maybe(schema.string()),
      alerts_context_count: schema.maybe(schema.number()),
      persisted_count: schema.maybe(schema.number()),
    })
  ),
  continuation: schema.maybe(
    schema.object({
      investigationId: schema.maybe(schema.string()),
      caseId: schema.maybe(schema.string()),
      priorContinuationDecisionIds: schema.maybe(schema.arrayOf(schema.string())),
      evidenceDeltaMarkdown: schema.maybe(schema.string()),
    })
  ),
  sourceWatchId: schema.maybe(schema.string()),
  sourceWorkerId: schema.maybe(schema.string()),
  persistEvidence: schema.maybe(schema.boolean()),
});

export const registerProposalsFromAttackDiscoveryRoute = (dependencies: RouteDependencies) => {
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

  router.post(
    {
      path: `${daybreakApiPath}/proposals/from-attack-discovery`,
      security: daybreakRouteSecurity,
      validate: { body: adBodySchema },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const proposalClient = await getProposalClient(ctx, request);
      const space = getSpaceId(request);

      const mapped = mapAttackDiscoveryToProposal({
        proposalId: request.body.proposalId,
        ad: request.body.ad as AttackDiscoveryInput,
        generation: request.body.generation,
        continuation: request.body.continuation,
        sourceWatchId: request.body.sourceWatchId,
        sourceWorkerId: request.body.sourceWorkerId,
        space,
      });

      if (request.body.persistEvidence !== false) {
        const {
          elasticsearch: { client },
        } = await ctx.core;
        const evidenceClient = createEvidenceClient({
          space,
          logger,
          esClient: client.asInternalUser,
        });
        for (const evidencePackage of mapped.evidencePackages) {
          const props = toEvidenceProperties(evidencePackage);
          await evidenceClient.create({
            id: props.id,
            kind: props.kind,
            summary: props.summary,
            provenance: props.provenance,
            confidence: props.confidence,
            stance: props.stance,
            sourceRef: props.sourceRef,
            limitations: props.limitations,
            sensitivityLabel: props.sensitivityLabel,
          });
        }
      }

      const created = await proposalClient.create(mapped.proposal);
      return response.ok({
        body: {
          ...created,
          evidencePackageIds: mapped.evidencePackages.map((pkg) => pkg.id),
          normalizedInputKind: mapped.normalized.inputKind,
        },
      });
    })
  );
};

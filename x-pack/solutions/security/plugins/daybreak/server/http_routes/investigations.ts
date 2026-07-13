/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { KibanaRequest, RequestHandlerContext } from '@kbn/core/server';
import { daybreakApiPath } from '../../common/http_api';
import { createInvestigationClient } from '../client/investigations/client';
import type { InvestigationClient } from '../client/investigations/client';
import { buildInvestigationFromProposal } from '../common/schemas/investigation_builder';
import { createProposalClient } from '../client/proposals/client';
import type { ProposalClient } from '../client/proposals/client';
import type { TimelineEntry } from '../common/schemas/investigation';
import {
  correlateProposalsToInvestigation,
  extractCorrelationEntitiesFromProposal,
  resolveInvestigationHostNames,
} from '../workflow/correlate_investigation_entities';
import { DAYBREAK_STUB_ENDPOINT_ACTIONS } from '../common/demo_flags';
import {
  ENDPOINT_FORENSIC_ANALYSIS_SKILL_ID,
  ENDPOINT_FORENSIC_DISCOVER_TELEMETRY_TOOL_ID,
} from '../workflow/execute_skill_bounded_tool';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';

const investigationStatusSchema = schema.oneOf([
  schema.literal('open'),
  schema.literal('closed'),
  schema.literal('escalated'),
]);

const parseHostInput = (hosts: string | string[] | undefined): string[] | undefined => {
  if (!hosts) {
    return undefined;
  }
  if (Array.isArray(hosts)) {
    return hosts.map((host) => host.trim()).filter(Boolean);
  }
  const trimmed = hosts.trim();
  if (!trimmed || trimmed.startsWith('{{')) {
    return undefined;
  }
  return trimmed
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
};

const parseTimeWindowHours = (value: number | string | undefined): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('{{')) {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const summarizeForensicResult = (toolResult: unknown, hosts: string[]): string => {
  if (!toolResult || typeof toolResult !== 'object') {
    return `Forensic scope requested for hosts: ${hosts.join(', ')}.`;
  }

  const data = (toolResult as { results?: Array<{ data?: Record<string, unknown> }> }).results?.[0]
    ?.data;
  if (!data) {
    return `Forensic scope requested for hosts: ${hosts.join(', ')}.`;
  }

  const recommended = Array.isArray(data.recommended_indices)
    ? (data.recommended_indices as string[]).join(', ')
    : 'n/a';
  const availableCount = Array.isArray(data.available_indices)
    ? (data.available_indices as string[]).length
    : 0;
  const windowHours =
    typeof data.time_window_hours === 'number' ? data.time_window_hours : 'default';

  return `Forensic telemetry scope for hosts [${hosts.join(', ')}] over ${windowHours}h. Recommended indices: ${recommended}. Available indices: ${availableCount}.`;
};

const buildStubForensicToolResult = (hosts: string[], timeWindowHours: number) => ({
  stub: true,
  results: [
    {
      data: {
        hosts,
        time_window_hours: timeWindowHours,
        recommended_indices: ['logs-endpoint.events.*'],
        available_indices: ['logs-endpoint.events.process', 'logs-endpoint.events.network'],
        message: `Stubbed forensic telemetry scope for demo (no Fleet endpoint enrolled).`,
      },
    },
  ],
});

export const registerInvestigationRoutes = (dependencies: RouteDependencies) => {
  const { logger, router, getSpaceId } = dependencies;
  const wrapHandler = getHandlerWrapper({ logger });

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

  router.get(
    {
      path: `${daybreakApiPath}/investigations`,
      security: daybreakRouteSecurity,
      validate: false,
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getInvestigationClient(ctx, request);
      const results = await client.list();
      return response.ok({ body: { results } });
    })
  );

  router.get(
    {
      path: `${daybreakApiPath}/investigations/{id}`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({ id: schema.string() }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getInvestigationClient(ctx, request);
      const investigation = await client.get(request.params.id);
      return response.ok({ body: investigation });
    })
  );

  router.post(
    {
      path: `${daybreakApiPath}/investigations/from-proposal`,
      security: daybreakRouteSecurity,
      validate: {
        body: schema.object({
          proposalId: schema.string(),
          investigationId: schema.maybe(schema.string()),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const proposalClient = await getProposalClient(ctx, request);
      const investigationClient = await getInvestigationClient(ctx, request);
      const proposal = await proposalClient.get(request.body.proposalId);
      const investigationId = request.body.investigationId ?? `investigation-${proposal.id}`;
      const investigation = buildInvestigationFromProposal({
        investigationId,
        proposal,
      });
      const created = await investigationClient.create(investigation);
      return response.ok({ body: created });
    })
  );

  router.put(
    {
      path: `${daybreakApiPath}/investigations/{id}`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({ id: schema.string() }),
        body: schema.object({
          status: schema.maybe(investigationStatusSchema),
          summary: schema.maybe(schema.string()),
          openQuestions: schema.maybe(schema.arrayOf(schema.string())),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getInvestigationClient(ctx, request);
      const updated = await client.update(request.params.id, request.body);
      return response.ok({ body: updated });
    })
  );

  router.delete(
    {
      path: `${daybreakApiPath}/investigations/{id}`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({ id: schema.string() }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const client = await getInvestigationClient(ctx, request);
      const deleted = await client.delete(request.params.id);
      return response.ok({ body: { deleted } });
    })
  );

  router.post(
    {
      path: `${daybreakApiPath}/investigations/{id}/enrich`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({ id: schema.string() }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const investigationClient = await getInvestigationClient(ctx, request);
      const proposalClient = await getProposalClient(ctx, request);
      const investigation = await investigationClient.get(request.params.id);
      const proposals = await proposalClient.list();
      const relatedProposals = correlateProposalsToInvestigation(investigation, proposals);

      const now = new Date().toISOString();
      const newTimelineEntries = relatedProposals.map((proposal) => ({
        timestamp: proposal.createdAt ?? now,
        description: `Related proposal ${proposal.id}: ${proposal.title} (${proposal.status})`,
        evidenceRef: proposal.id,
      }));

      const existingEntityKeys = new Set(
        investigation.entities.map((entity) => `${entity.type}:${entity.name.toLowerCase()}`)
      );
      const newEntities = relatedProposals.flatMap((proposal) =>
        extractCorrelationEntitiesFromProposal(proposal)
          .filter((entity) => !existingEntityKeys.has(`${entity.type}:${entity.name.toLowerCase()}`))
          .map((entity) => ({
            id: `${investigation.id}-entity-${entity.type}-${entity.name}`,
            name: entity.name,
            type: entity.type,
            relevance: 'contextual' as const,
          }))
      );

      const updated = await investigationClient.update(request.params.id, {
        timeline: [...investigation.timeline, ...newTimelineEntries],
        entities: [...investigation.entities, ...newEntities],
      });

      return response.ok({ body: updated });
    })
  );

  router.post(
    {
      path: `${daybreakApiPath}/investigations/{id}/forensic`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({ id: schema.string() }),
        body: schema.object({
          hosts: schema.maybe(
            schema.oneOf([schema.arrayOf(schema.string()), schema.string(), schema.number()])
          ),
          timeWindowHours: schema.maybe(
            schema.oneOf([schema.number(), schema.string(), schema.literal('')])
          ),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      if (!dependencies.executeSkillBoundedTool && !DAYBREAK_STUB_ENDPOINT_ACTIONS) {
        return response.customError({
          statusCode: 503,
          body: { message: 'Agent Builder skill tools are unavailable for forensic analysis.' },
        });
      }

      const investigationClient = await getInvestigationClient(ctx, request);
      const proposalClient = await getProposalClient(ctx, request);
      const investigation = await investigationClient.get(request.params.id);

      let sourceProposal;
      try {
        sourceProposal = await proposalClient.get(investigation.sourceProposalId);
      } catch {
        sourceProposal = undefined;
      }

      const isEscalated =
        investigation.status === 'escalated' || sourceProposal?.status === 'escalated';
      if (!isEscalated) {
        return response.customError({
          statusCode: 422,
          body: {
            message: `Investigation '${investigation.id}' must be escalated (or sourced from an escalated proposal) before forensic reconstruction.`,
          },
        });
      }

      const explicitHosts = parseHostInput(
        typeof request.body.hosts === 'number' ? String(request.body.hosts) : request.body.hosts
      );
      const hosts = resolveInvestigationHostNames(investigation, sourceProposal, explicitHosts);
      if (hosts.length === 0) {
        return response.customError({
          statusCode: 422,
          body: {
            message:
              'Could not resolve host scope for forensic analysis. Provide hosts in the request body or seed host entities on the investigation.',
          },
        });
      }

      const {
        elasticsearch: { client },
      } = await ctx.core;
      const timeWindowHours = parseTimeWindowHours(request.body.timeWindowHours) ?? 72;
      const toolResult = DAYBREAK_STUB_ENDPOINT_ACTIONS
        ? buildStubForensicToolResult(hosts, timeWindowHours)
        : await dependencies.executeSkillBoundedTool!(
            request,
            {
              skillId: ENDPOINT_FORENSIC_ANALYSIS_SKILL_ID,
              toolId: ENDPOINT_FORENSIC_DISCOVER_TELEMETRY_TOOL_ID,
              toolParams: {
                hosts,
                time_window_hours: timeWindowHours,
              },
            },
            {
              esClient: client,
              agentId: 'daybreak-forensic-worker',
            }
          );

      const now = new Date().toISOString();
      const timelineEntry: TimelineEntry = {
        timestamp: now,
        description: `Endpoint forensic analysis (${ENDPOINT_FORENSIC_ANALYSIS_SKILL_ID}) scoped for investigation ${investigation.id}. ${summarizeForensicResult(toolResult, hosts)}`,
        evidenceRef: investigation.evidenceRefs[0],
      };

      const updated = await investigationClient.update(request.params.id, {
        timeline: [...investigation.timeline, timelineEntry],
      });

      return response.ok({
        body: {
          investigationId: updated.id,
          skillId: ENDPOINT_FORENSIC_ANALYSIS_SKILL_ID,
          toolId: ENDPOINT_FORENSIC_DISCOVER_TELEMETRY_TOOL_ID,
          hosts,
          timeWindowHours,
          toolResult,
          timelineEntry,
          investigation: updated,
        },
      });
    })
  );

  router.post(
    {
      path: `${daybreakApiPath}/investigations/{id}/run`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({ id: schema.string() }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      if (!dependencies.executeInvestigationWorker) {
        return response.customError({
          statusCode: 503,
          body: { message: 'Daybreak investigation worker is unavailable.' },
        });
      }
      const workflowExecutionId = await dependencies.executeInvestigationWorker(request, {
        investigationId: request.params.id,
      });
      return response.ok({ body: { workflowExecutionId } });
    })
  );

  router.post(
    {
      path: `${daybreakApiPath}/investigations/{id}/run-forensic`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({ id: schema.string() }),
        body: schema.object({
          hosts: schema.maybe(schema.arrayOf(schema.string())),
          timeWindowHours: schema.maybe(schema.number()),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      if (!dependencies.executeForensicWorker) {
        return response.customError({
          statusCode: 503,
          body: { message: 'Daybreak forensic worker is unavailable.' },
        });
      }

      const workflowExecutionId = await dependencies.executeForensicWorker(request, {
        investigationId: request.params.id,
        hosts: request.body.hosts,
        timeWindowHours: request.body.timeWindowHours,
      });

      return response.ok({ body: { workflowExecutionId } });
    })
  );
};

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
import { createActionResultClient } from '../client/action_results/client';
import { createProposalClient } from '../client/proposals/client';
import type { ProposalClient } from '../client/proposals/client';
import type { TimelineEntry } from '../common/schemas/investigation';
import { buildActionResultFromResponse } from '../common/schemas/action_result_builder';
import { DAYBREAK_STUB_ENDPOINT_ACTIONS } from '../common/demo_flags';
import { ENDPOINT_RESPONSE_ACTIONS_SKILL_ID } from '../workflow/execute_skill_bounded_tool';
import { resolveProposalHostName } from '../workflow/resolve_proposal_host';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';

const responseActionSchema = schema.oneOf([
  schema.literal('get_processes'),
  schema.literal('isolate'),
]);

export const ENDPOINT_RESPONSE_RUNNING_PROCESSES_TOOL_ID =
  'endpoint-response-actions.running_processes';
export const ENDPOINT_RESPONSE_ISOLATE_TOOL_ID = 'endpoint-response-actions.isolate_host';

const normalizeOptionalString = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith('{{')) {
    return undefined;
  }
  return trimmed;
};

const summarizeToolResult = (toolResult: unknown): string => {
  if (!toolResult || typeof toolResult !== 'object') {
    return 'Response action completed.';
  }

  const results = (toolResult as { results?: Array<{ data?: Record<string, unknown> }> }).results;
  const first = results?.[0]?.data;
  if (!first) {
    return 'Response action completed.';
  }

  if (typeof first.message === 'string') {
    return first.message;
  }

  if (first.found === false) {
    return typeof first.message === 'string'
      ? first.message
      : 'No endpoint found for the requested host.';
  }

  const action = typeof first.action === 'string' ? first.action : 'response-action';
  const hostName = typeof first.hostName === 'string' ? first.hostName : 'host';
  const status = typeof first.status === 'string' ? first.status : 'completed';
  return `${action} on ${hostName}: ${status}`;
};

const buildStubResponseToolResult = (action: string, hostName: string) => ({
  stub: true,
  results: [
    {
      data: {
        action,
        hostName,
        status: 'stubbed-success',
        found: true,
        message: `Stubbed ${action} on ${hostName} (demo mode — no Fleet endpoint enrolled).`,
      },
    },
  ],
});

export const registerProposalActResponseRoutes = (dependencies: RouteDependencies) => {
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

  router.post(
    {
      path: `${daybreakApiPath}/proposals/{id}/act/response`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({ id: schema.string() }),
        body: schema.object({
          action: schema.maybe(responseActionSchema),
          hostName: schema.maybe(schema.string()),
          comment: schema.maybe(schema.string()),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      if (!dependencies.executeSkillBoundedTool && !DAYBREAK_STUB_ENDPOINT_ACTIONS) {
        return response.customError({
          statusCode: 503,
          body: { message: 'Agent Builder skill tools are unavailable for response actions.' },
        });
      }

      const proposalClient = await getProposalClient(ctx, request);
      const investigationClient = await getInvestigationClient(ctx, request);
      const proposal = await proposalClient.get(request.params.id);

      if (proposal.status !== 'approved') {
        return response.customError({
          statusCode: 422,
          body: {
            message: `Proposal '${proposal.id}' must be approved before dispatching a response action (current status: ${proposal.status}).`,
          },
        });
      }

      const action = request.body.action ?? 'get_processes';
      const investigations = await investigationClient.list();
      const hostName = resolveProposalHostName({
        proposal,
        explicitHostName: normalizeOptionalString(request.body.hostName),
        investigations,
      });

      if (!hostName) {
        return response.customError({
          statusCode: 422,
          body: {
            message:
              'Could not resolve a target host for this proposal. Provide hostName in the request body or link an investigation with a host entity.',
          },
        });
      }

      const toolId =
        action === 'isolate'
          ? ENDPOINT_RESPONSE_ISOLATE_TOOL_ID
          : ENDPOINT_RESPONSE_RUNNING_PROCESSES_TOOL_ID;
      const comment =
        request.body.comment ??
        `Daybreak proposal ${proposal.id} approved response action (${action}).`;

      const toolResult = DAYBREAK_STUB_ENDPOINT_ACTIONS
        ? buildStubResponseToolResult(action, hostName)
        : await dependencies.executeSkillBoundedTool!(request, {
            skillId: ENDPOINT_RESPONSE_ACTIONS_SKILL_ID,
            toolId,
            toolParams: {
              hostName,
              comment,
            },
          });

      const now = new Date().toISOString();
      const timelineEntry: TimelineEntry = {
        timestamp: now,
        description: `Response action '${action}' dispatched for host ${hostName} from approved proposal ${proposal.id}. ${summarizeToolResult(toolResult)}`,
        evidenceRef: proposal.evidenceRefs[0],
      };

      const linkedInvestigation = investigations.find(
        (investigation) => investigation.sourceProposalId === proposal.id
      );

      let investigationId: string | undefined;
      if (linkedInvestigation) {
        const updated = await investigationClient.update(linkedInvestigation.id, {
          timeline: [...linkedInvestigation.timeline, timelineEntry],
        });
        investigationId = updated.id;
      }

      const {
        elasticsearch: { client: esClient },
      } = await ctx.core;
      const actionResultClient = createActionResultClient({
        space: getSpaceId(request),
        logger,
        esClient: esClient.asInternalUser,
      });
      const actionResult = buildActionResultFromResponse({
        proposal,
        action,
        hostName,
        toolResult,
        investigationId,
      });
      await actionResultClient.create(actionResult);

      return response.ok({
        body: {
          proposalId: proposal.id,
          action,
          hostName,
          toolId,
          toolResult,
          investigationId,
          timelineEntry,
          actionResultId: actionResult.id,
        },
      });
    })
  );

  router.post(
    {
      path: `${daybreakApiPath}/proposals/{id}/run-response-action`,
      security: daybreakRouteSecurity,
      validate: {
        params: schema.object({ id: schema.string() }),
        body: schema.object({
          action: schema.maybe(responseActionSchema),
          hostName: schema.maybe(schema.string()),
        }),
      },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      if (!dependencies.executeResponseActionWorker) {
        return response.customError({
          statusCode: 503,
          body: { message: 'Daybreak response-action worker is unavailable.' },
        });
      }

      const workflowExecutionId = await dependencies.executeResponseActionWorker(request, {
        proposalId: request.params.id,
        action: request.body.action,
        hostName: request.body.hostName,
      });

      return response.ok({ body: { workflowExecutionId } });
    })
  );
};

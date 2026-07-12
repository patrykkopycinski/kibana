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
import type { ProposalProperties } from '../client/proposals/types';
import { createWorkerEvalRecordClient } from '../client/worker_eval_records';
import type { WorkerEvalRecordClient } from '../client/worker_eval_records';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';
import { buildProposalFromWorkerRun } from '../common/schemas/proposal_builder';
import { enrichAlertSchema } from '../workflow/enrich_alert_schema';
import { validateReasonOutput } from '../workflow/output_validation_guard';
import { daybreakGoldenDataset, type ExpectedProposalShape } from '../evals/golden_dataset';
import { scoreProposalShape } from '../evals/offline_dataset_gate';
import type { WorkerEvalRecordProvenance } from '../client/worker_eval_records';

const fromWorkerBodySchema = schema.object({
  enrichedJson: schema.string(),
  reasonJson: schema.string(),
  sourceWatchId: schema.maybe(schema.string()),
});

const DEFAULT_LIVE_PROVENANCE: WorkerEvalRecordProvenance = {
  modelId: 'eis-anthropic-claude-5-sonnet',
  connectorId: 'eis-anthropic-claude-5-sonnet',
  costBasis: 'priced',
};

const proposalToExpectedShape = (proposal: ProposalProperties): ExpectedProposalShape => ({
  title: proposal.title,
  capability: proposal.capability,
  severity: proposal.severity,
  confidence: proposal.confidence,
  recommendation: proposal.recommendation ?? '',
  status: proposal.status,
});

export const registerProposalsFromWorkerRoute = (dependencies: RouteDependencies) => {
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

  const getWorkerEvalClient = async (
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

  router.post(
    {
      path: `${daybreakApiPath}/proposals/from-worker-run`,
      security: daybreakRouteSecurity,
      validate: { body: fromWorkerBodySchema },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const proposalClient = await getProposalClient(ctx, request);

      let enrichedRaw;
      let reasonRaw;
      try {
        enrichedRaw = JSON.parse(request.body.enrichedJson);
        reasonRaw = JSON.parse(request.body.reasonJson);
      } catch (err) {
        return response.badRequest({
          body: { message: `Invalid JSON body: ${(err as Error).message}` },
        });
      }

      const enriched = enrichAlertSchema(enrichedRaw);

      const extractStructuredOutput = (raw: unknown): unknown => {
        if (raw == null || typeof raw !== 'object') {
          return raw;
        }
        const record = raw as Record<string, unknown>;
        if (record.structured_output != null) {
          return record.structured_output;
        }
        const text =
          typeof record.content === 'string'
            ? record.content
            : typeof record.message === 'string'
            ? record.message
            : undefined;
        if (text == null) {
          return raw;
        }
        // Strip markdown fences and any leading/trailing whitespace
        const stripped = text
          .replace(/^```(json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        try {
          return JSON.parse(stripped);
        } catch {
          return raw;
        }
      };

      const structuredOutput = extractStructuredOutput(reasonRaw);
      const reason = validateReasonOutput({ structured_output: structuredOutput });

      const proposal = buildProposalFromWorkerRun({
        id: enriched.alertId,
        enriched,
        reason,
        sourceWatchId: request.body.sourceWatchId,
        sourceWorkerId: 'daybreak-alert-analysis-worker',
        capability: 'alert-analysis',
        space: getSpaceId(request),
      });

      const created = await proposalClient.create(proposal);

      const rowId = enriched.rowId;
      if (rowId) {
        const example = daybreakGoldenDataset.examples.find((e) => e.id === rowId);
        if (example) {
          const actual = proposalToExpectedShape(created);
          const scoreResult = scoreProposalShape(actual, example.output);
          const workerEvalClient = await getWorkerEvalClient(ctx, request);
          await workerEvalClient
            .create({
              runId: rowId,
              dataset: daybreakGoldenDataset.name,
              environment: 'live-workflow',
              capability: 'alert-analysis',
              actual: actual as Record<string, unknown>,
              expected: example.output as Record<string, unknown>,
              humanDecision: 'pending',
              score: scoreResult.score,
              provenance: DEFAULT_LIVE_PROVENANCE,
            })
            .catch((error) => {
              logger.error(
                `daybreak: failed to create worker eval record for ${rowId}: ${error.message}`
              );
            });
        }
      }

      return response.ok({ body: created });
    })
  );
};

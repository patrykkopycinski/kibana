/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { i18n } from '@kbn/i18n';
import {
  ARGUS_CVE_ADVISORIES_INDEX,
  type StructuredAdvisory,
  type VariantTraceEvent,
} from '@kbn/argus-exploit-to-detection';

import {
  argusSynthesizeAdvisoryInputSchema,
  argusSynthesizeAdvisoryStepCommonDefinition,
} from '../../../../common/workflows/step_types/argus_synthesize_advisory_step/argus_synthesize_advisory_step_common';
import {
  SYNTHESIS_DRIVER_AGENT_ID,
  SYNTHESIS_DRIVER_AGENT_VERSION,
  SYNTHESIS_DRIVER_INITIAL_TRUST_TIER,
  SYNTHESIS_EVOLUTION_LOG_INDEX,
  SYNTHESIS_MUTATION_INTENTS_INDEX,
  SYNTHESIS_REASONING_TRACE_INDEX,
  synthesizeOne,
} from '../../../lib/argus/synthesis';
import {
  EvolutionLogRowSchema,
  MutationIntentEnvelopeSchema,
  ReasoningTraceEventSchema,
  checkContract,
} from '../../../lib/argus/synthesis/contracts';

export { argusSynthesizeAdvisoryInputSchema };

const fetchAdvisoryById = async (
  esClient: ElasticsearchClient,
  advisoryId: string
): Promise<StructuredAdvisory | undefined> => {
  try {
    const response = await esClient.search<StructuredAdvisory & { '@timestamp'?: string }>({
      index: ARGUS_CVE_ADVISORIES_INDEX,
      size: 1,
      query: { term: { advisory_id: advisoryId } },
    });
    const source = response.hits.hits[0]?._source;
    if (!source) return undefined;
    // Vision-doc 4.1 — thread the advisory's ingest timestamp through to the
    // synthesizer so `buildMutationIntent` can stamp `synthesis_lag_ms` onto
    // the produced envelope. `.soc-cve-advisories` is a data stream; every
    // doc carries `@timestamp` at ingest time, which is the canonical
    // "trigger" event for the trigger-to-rule KPI.
    if (source.ingested_at === undefined && source['@timestamp']) {
      return { ...source, ingested_at: source['@timestamp'] };
    }
    return source;
  } catch {
    return undefined;
  }
};

const writeReasoningTraces = async (
  esClient: ElasticsearchClient,
  traces: readonly VariantTraceEvent[],
  logger: Logger
): Promise<void> => {
  if (traces.length === 0) return;
  // B16 — drop drifted trace documents at write-time so the ContractError
  // is loud instead of silently writing a malformed doc into the data
  // stream. Best-effort: surviving rows still get written.
  const validTraces: Array<Record<string, unknown>> = [];
  for (const event of traces) {
    const candidate = { '@timestamp': new Date().toISOString(), ...event };
    const check = checkContract(ReasoningTraceEventSchema, candidate);
    if (check.ok) {
      validTraces.push(candidate);
    } else {
      logger.warn(
        `[argus-synthesize-advisory-step] [contract] reasoning-trace doc failed schema check; ` +
          `dropping. issues=${(check.issues ?? []).join('; ')}`
      );
    }
  }
  if (validTraces.length === 0) return;
  try {
    const operations = validTraces.flatMap((doc) => [
      { index: { _index: SYNTHESIS_REASONING_TRACE_INDEX } },
      doc,
    ]);
    await esClient.bulk({ refresh: false, operations });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn(
      `[argus-synthesize-advisory-step] Failed to write ${validTraces.length} reasoning traces: ${reason}`
    );
  }
};

const writeEvolutionLog = async (
  esClient: ElasticsearchClient,
  payload: {
    callerId: string;
    advisoryId: string;
    recId?: string;
    outcomeKind: string;
    reason?: string;
    traceCount: number;
    durationMs: number;
  },
  logger: Logger
): Promise<void> => {
  const document = {
    '@timestamp': new Date().toISOString(),
    event_type: 'synthesis.advisory',
    agent_id: SYNTHESIS_DRIVER_AGENT_ID,
    source: SYNTHESIS_DRIVER_AGENT_ID,
    actor: `${SYNTHESIS_DRIVER_AGENT_ID}.${payload.callerId}`,
    trust_tier: SYNTHESIS_DRIVER_INITIAL_TRUST_TIER,
    result: payload.outcomeKind === 'synthesized' ? 'ok' : payload.outcomeKind,
    message:
      `Synthesis attempt for ${payload.advisoryId} via ${payload.callerId}: ` +
      `${payload.outcomeKind}${payload.recId ? ` rec=${payload.recId}` : ''}` +
      `${payload.reason ? ` reason=${payload.reason}` : ''} ` +
      `traces=${payload.traceCount} duration=${payload.durationMs}ms`,
    metrics_snapshot: {
      caller_id: payload.callerId,
      advisory_id: payload.advisoryId,
      rec_id: payload.recId,
      outcome_kind: payload.outcomeKind,
      reason: payload.reason,
      trace_count: payload.traceCount,
      duration_ms: payload.durationMs,
      agent_version: SYNTHESIS_DRIVER_AGENT_VERSION,
    },
  };
  // B16 — guard against the kind of legacy nested shape (`agent.id`,
  // `actor.trust_tier`) that broke the data-stream mapping during the
  // F-015 boot. If the contract is violated we skip the write rather
  // than poison the stream.
  const check = checkContract(EvolutionLogRowSchema, document);
  if (!check.ok) {
    logger.error(
      `[argus-synthesize-advisory-step] [contract] evolution-log row failed schema check; ` +
        `skipping write. issues=${(check.issues ?? []).join('; ')}`
    );
    return;
  }
  try {
    await esClient.index({
      index: SYNTHESIS_EVOLUTION_LOG_INDEX,
      refresh: false,
      document,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn(`[argus-synthesize-advisory-step] Failed to write evolution-log row: ${reason}`);
  }
};

export const argusSynthesizeAdvisoryStepDefinition = createServerStepDefinition({
  ...argusSynthesizeAdvisoryStepCommonDefinition,
  handler: async (context) => {
    const { advisory_id: advisoryId, caller_id: callerId, dry_run: dryRun } = context.input;
    const logger = context.logger as Logger;
    const startMs = Date.now();
    const esClient = context.contextManager.getScopedEsClient();

    try {
      const advisory = await fetchAdvisoryById(esClient, advisoryId);
      if (!advisory) {
        const durationMs = Date.now() - startMs;
        if (!dryRun) {
          await writeEvolutionLog(
            esClient,
            {
              callerId,
              advisoryId,
              outcomeKind: 'advisory_not_found',
              traceCount: 0,
              durationMs,
            },
            logger
          );
        }
        return {
          output: {
            advisory_id: advisoryId,
            outcome_kind: 'advisory_not_found' as const,
            trace_count: 0,
            duration_ms: durationMs,
            dry_run: dryRun,
          },
        };
      }

      const outcome = await synthesizeOne({
        advisory,
        logger,
        now: startMs,
        callerId,
      });

      const traceCount = outcome.traces.length;
      const durationMs = Date.now() - startMs;

      if (outcome.kind === 'dead_letter_high_rejection_rate') {
        if (!dryRun) {
          await Promise.all([
            writeReasoningTraces(esClient, outcome.traces, logger),
            writeEvolutionLog(
              esClient,
              {
                callerId,
                advisoryId,
                outcomeKind: outcome.kind,
                reason: outcome.reason,
                traceCount,
                durationMs,
              },
              logger
            ),
          ]);
        }
        return {
          output: {
            advisory_id: advisoryId,
            outcome_kind: outcome.kind,
            reason: outcome.reason,
            trace_count: traceCount,
            duration_ms: durationMs,
            dry_run: dryRun,
          },
        };
      }

      const mutationIntent = outcome.mutation_intent;
      if (!mutationIntent) {
        // synthesize_one returned a non-dead-letter outcome without a
        // mutation_intent — should not happen, but treat defensively.
        return {
          error: new Error(
            `Synthesis for advisory=${advisoryId} returned no mutation intent for outcome=${outcome.kind}`
          ),
        };
      }

      const recId = mutationIntent.rec_id;

      // B16 — write-time contract guard. The synthesis chain is
      // canonical, so a drift here is a real bug — fail closed rather
      // than poison .soc-mutation-intents with a malformed envelope.
      const intentCheck = checkContract(MutationIntentEnvelopeSchema, mutationIntent);
      if (!intentCheck.ok) {
        const issues = (intentCheck.issues ?? []).join('; ');
        logger.error(
          `[argus-synthesize-advisory-step] [contract] mutation_intent failed schema check; ` +
            `refusing to write. advisory=${advisoryId} rec=${recId} issues=${issues}`
        );
        if (!dryRun) {
          await writeEvolutionLog(
            esClient,
            {
              callerId,
              advisoryId,
              recId,
              outcomeKind: 'mutation_intent_contract_violation',
              reason: issues,
              traceCount,
              durationMs,
            },
            logger
          );
        }
        return {
          error: new Error(
            `mutation_intent failed schema check for advisory=${advisoryId}: ${issues}`
          ),
        };
      }

      if (dryRun) {
        return {
          output: {
            advisory_id: advisoryId,
            outcome_kind: outcome.kind,
            rec_id: recId,
            trace_count: traceCount,
            variant_count: mutationIntent.variant_count,
            duration_ms: durationMs,
            dry_run: true,
          },
        };
      }

      await esClient.index({
        index: SYNTHESIS_MUTATION_INTENTS_INDEX,
        id: recId,
        refresh: 'wait_for',
        document: mutationIntent,
      });

      // Best-effort audit-trail writes.
      await Promise.all([
        writeReasoningTraces(esClient, outcome.traces, logger),
        writeEvolutionLog(
          esClient,
          {
            callerId,
            advisoryId,
            recId,
            outcomeKind: outcome.kind,
            traceCount,
            durationMs,
          },
          logger
        ),
      ]);

      return {
        output: {
          advisory_id: advisoryId,
          outcome_kind: outcome.kind,
          rec_id: recId,
          trace_count: traceCount,
          variant_count: mutationIntent.variant_count,
          duration_ms: durationMs,
          dry_run: false,
        },
      };
    } catch (error) {
      logger.error(
        i18n.translate('xpack.securitySolution.workflows.steps.argusSynthesizeAdvisory.errorLog', {
          defaultMessage: 'Failed to synthesise rule candidate for advisory {advisoryId}',
          values: { advisoryId },
        }),
        error
      );
      return {
        error: new Error(
          error instanceof Error
            ? error.message
            : `Failed to synthesise rule candidate for advisory ${advisoryId}`
        ),
      };
    }
  },
});

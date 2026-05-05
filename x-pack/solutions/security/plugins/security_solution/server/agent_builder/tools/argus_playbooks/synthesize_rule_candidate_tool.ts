/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType, ToolResultType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import type { IScopedClusterClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import {
  ARGUS_CVE_ADVISORIES_INDEX,
  type StructuredAdvisory,
  type VariantTraceEvent,
} from '@kbn/argus-exploit-to-detection';

import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../plugin_contract';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
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
import { ARGUS_SYNTHESIZE_RULE_CANDIDATE_TOOL_ID } from './constants';

/**
 * ARGUS chat-skill tool — synthesize a rule candidate from a CVE.
 *
 * This is the chat-skill entry point for Path A (RFC B1, §3.3). It is the
 * **only** sanctioned way for a chat skill (e.g. `argusAssessCveSkill`) to
 * produce a CVE-driven mutation intent. The legacy
 * `argus.file_mutation_intent` tool blocks `origin: 'cti_ingest'` to enforce
 * this — the chat LLM must now go through the same gates as the
 * autonomous TaskManager driver (Pareto frontier, validateLlmVariant
 * golden-set blocklist, axis markers, dead-letter rate cap).
 *
 * Today the tool runs with the deterministic scripted variant provider
 * (the same fallback the driver uses when `@kbn/inference` is unavailable).
 * Wiring the inference-backed provider through the agent-builder request
 * context is tracked separately — once the start-contract bridge lands,
 * production deployments will inject `createInferenceVariantProvider` here
 * and the chat skill will inherit real-LLM behaviour for free.
 */
const synthesizeRuleCandidateSchema = z.object({
  advisory_id: z
    .string()
    .min(1)
    .describe(
      'The advisory id (typically a CVE id, e.g. CVE-2024-12345) of the advisory to synthesise a rule for. Must already exist in `.soc-cve-advisories`.'
    ),
  dry_run: z
    .boolean()
    .default(false)
    .describe(
      'When true, runs the full Path A pipeline (Pareto + variant generation + validation) but does not write the resulting mutation intent to Elasticsearch.'
    ),
});

export function argusSynthesizeRuleCandidateTool(
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger
): BuiltinToolDefinition<typeof synthesizeRuleCandidateSchema> {
  return {
    id: ARGUS_SYNTHESIZE_RULE_CANDIDATE_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Synthesise an ARGUS rule candidate from an advisory (CVE) using Path A end-to-end ' +
      '(Pareto frontier, variant validation, golden-set blocklist). Writes a mutation intent ' +
      'to `.soc-mutation-intents` and a reasoning trace to `.soc-reasoning-trace`. Use this ' +
      'for cti_ingest synthesis instead of `argus.file_mutation_intent`. Returns the assigned ' +
      '`rec_id`, the chosen rule candidate, and per-variant trace counts.',
    schema: synthesizeRuleCandidateSchema,
    tags: ['security', 'argus', 'argus:playbook', 'mutation-intent', 'synthesis'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) =>
        getAgentBuilderResourceAvailability({ core, request, logger }),
    },
    handler: async (params, { esClient }) => {
      const { advisory_id: advisoryId, dry_run: dryRun } = params;
      const now = Date.now();

      let advisory: StructuredAdvisory | undefined;
      try {
        const lookup = await esClient.asCurrentUser.search<StructuredAdvisory>({
          index: ARGUS_CVE_ADVISORIES_INDEX,
          size: 1,
          query: { term: { advisory_id: advisoryId } },
        });
        advisory = lookup.hits.hits[0]?._source;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logger.warn(
          `argus.synthesize_rule_candidate advisory lookup failed for ${advisoryId}: ${reason}`
        );
      }

      if (!advisory) {
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `No advisory found in ${ARGUS_CVE_ADVISORIES_INDEX} with advisory_id="${advisoryId}". Cannot synthesise a rule without a structured advisory — try ingesting the CVE first.`,
                advisory_id: advisoryId,
              },
            },
          ],
        };
      }

      const outcome = await synthesizeOne({
        advisory,
        logger,
        now,
        callerId: 'chat-skill',
      });

      const traceCount = outcome.traces.length;

      if (outcome.kind === 'dead_letter_high_rejection_rate') {
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Synthesis dead-lettered for advisory=${advisoryId}: ${
                  outcome.reason ?? 'rejection rate above threshold'
                }. The advisory likely needs human review or a richer CTI payload.`,
                advisory_id: advisoryId,
                kind: outcome.kind,
                reason: outcome.reason,
                trace_count: traceCount,
              },
            },
          ],
        };
      }

      const mutationIntent = outcome.mutation_intent;
      if (!mutationIntent) {
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message:
                  'Synthesis returned no mutation intent — this should not happen for a non-dead-letter outcome.',
                advisory_id: advisoryId,
              },
            },
          ],
        };
      }

      const recId = mutationIntent.rec_id;

      if (dryRun) {
        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                message: `Dry-run OK — Path A produced rec_id=${recId} but no document was written.`,
                advisory_id: advisoryId,
                rec_id: recId,
                rule_candidate: outcome.rule_candidate,
                preview: mutationIntent,
                trace_count: traceCount,
                dry_run: true,
              },
            },
          ],
        };
      }

      // B16 — write-time contract guard. mutation_intent is the canonical
      // chat-skill output, so a drift is a real bug — fail closed rather
      // than corrupt .soc-mutation-intents.
      const intentCheck = checkContract(MutationIntentEnvelopeSchema, mutationIntent);
      if (!intentCheck.ok) {
        const issues = (intentCheck.issues ?? []).join('; ');
        logger.error(
          `argus.synthesize_rule_candidate [contract] mutation_intent failed schema check; ` +
            `refusing to write. advisory=${advisoryId} rec=${recId} issues=${issues}`
        );
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Mutation intent failed schema check (B16): ${issues}`,
                advisory_id: advisoryId,
                rec_id: recId,
              },
            },
          ],
        };
      }

      try {
        await esClient.asCurrentUser.index({
          index: SYNTHESIS_MUTATION_INTENTS_INDEX,
          id: recId,
          refresh: 'wait_for',
          document: mutationIntent,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logger.error(
          `argus.synthesize_rule_candidate failed to write mutation_intent ${recId}: ${reason}`
        );
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Synthesis succeeded but writing the mutation intent failed: ${reason}`,
                advisory_id: advisoryId,
                rec_id: recId,
              },
            },
          ],
        };
      }

      // Best-effort: append reasoning traces and an evolution-log row. These
      // mirror the autonomous driver's writes, so chat-skill-driven and
      // task-driven synthesis activity end up in the same audit indices.
      void writeReasoningTraces(esClient, outcome.traces, logger);
      void writeEvolutionLog(
        esClient,
        {
          callerId: 'chat-skill',
          advisoryId,
          recId,
          traceCount,
          durationMs: Date.now() - now,
        },
        logger
      );

      return {
        results: [
          {
            type: ToolResultType.other,
            data: {
              message: `Synthesised rule candidate ${recId} for ${advisoryId} via Path A.`,
              advisory_id: advisoryId,
              rec_id: recId,
              status: 'pending',
              rule_candidate: outcome.rule_candidate,
              trace_count: traceCount,
            },
          },
        ],
      };
    },
  };
}

/* ----------------------- Audit-log writers ----------------------- */

const writeReasoningTraces = async (
  esClient: IScopedClusterClient,
  traces: readonly VariantTraceEvent[],
  logger: Logger
): Promise<void> => {
  if (traces.length === 0) return;
  // B16 — drop drifted trace docs at write-time so the chat-skill audit
  // trail mirrors the workflow step's behaviour.
  const validTraces: Array<Record<string, unknown>> = [];
  for (const event of traces) {
    const candidate = { '@timestamp': new Date().toISOString(), ...event };
    const check = checkContract(ReasoningTraceEventSchema, candidate);
    if (check.ok) {
      validTraces.push(candidate);
    } else {
      logger.warn(
        `argus.synthesize_rule_candidate [contract] reasoning-trace doc failed schema check; ` +
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
    await esClient.asCurrentUser.bulk({ refresh: false, operations });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn(
      `argus.synthesize_rule_candidate failed to write ${validTraces.length} reasoning traces: ${reason}`
    );
  }
};

const writeEvolutionLog = async (
  esClient: IScopedClusterClient,
  payload: {
    callerId: string;
    advisoryId: string;
    recId: string;
    traceCount: number;
    durationMs: number;
  },
  logger: Logger
): Promise<void> => {
  // B16 / F-015 part a — produce the canonical FLAT shape (`event_type`,
  // `agent_id`, `actor`, `trust_tier` as top-level scalars). The legacy
  // nested shape (`event`, `agent.id`, etc.) was rejected by the
  // data-stream mapping with `document_parsing_exception`.
  const document = {
    '@timestamp': new Date().toISOString(),
    event_type: 'synthesis.chat_skill',
    agent_id: SYNTHESIS_DRIVER_AGENT_ID,
    source: SYNTHESIS_DRIVER_AGENT_ID,
    actor: `${SYNTHESIS_DRIVER_AGENT_ID}.${payload.callerId}`,
    trust_tier: SYNTHESIS_DRIVER_INITIAL_TRUST_TIER,
    result: 'ok',
    message:
      `Chat-skill synthesis for ${payload.advisoryId} via ${payload.callerId}: ` +
      `rec=${payload.recId} traces=${payload.traceCount} duration=${payload.durationMs}ms`,
    metrics_snapshot: {
      caller_id: payload.callerId,
      advisory_id: payload.advisoryId,
      rec_id: payload.recId,
      outcome_kind: 'synthesized',
      trace_count: payload.traceCount,
      duration_ms: payload.durationMs,
      agent_version: SYNTHESIS_DRIVER_AGENT_VERSION,
    },
  };
  const check = checkContract(EvolutionLogRowSchema, document);
  if (!check.ok) {
    logger.error(
      `argus.synthesize_rule_candidate [contract] evolution-log row failed schema check; ` +
        `skipping write. issues=${(check.issues ?? []).join('; ')}`
    );
    return;
  }
  try {
    await esClient.asCurrentUser.index({
      index: SYNTHESIS_EVOLUTION_LOG_INDEX,
      refresh: false,
      document,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn(`argus.synthesize_rule_candidate failed to write evolution-log row: ${reason}`);
  }
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import { isValidTraceId } from '@opentelemetry/api';
import {
  createTrajectoryEvaluator,
  getToolCallSteps,
  withEvaluatorSpan,
  type DefaultEvaluators,
  type EvalsExecutorClient,
  type EvaluationDataset,
  type Evaluator,
  type TaskOutput,
} from '@kbn/evals';
import type { ToolingLog } from '@kbn/tooling-log';
import type {
  PersonaMatrixExample,
  PersonaMatrixExampleInput,
  PersonaMatrixExampleOutput,
} from './datasets/persona_matrix_prompts';
import type { PersonaMatrixChatClient } from './chat_client';

/**
 * Default runner concurrency (see kbn-evals-runner's `client.ts`, `concurrency ?? 5`)
 * assumes a frontier cloud connector that can absorb 5 parallel long-context
 * agentic conversations. A single local vLLM deploy (e.g. an L4 GPU running a
 * 30B MoE model) cannot: 5 concurrent multi-turn converse calls saturate its
 * request queue faster than it can drain them, so Kibana's client-side
 * timeout fires before vLLM replies and every example fails with a
 * `fetch failed` transport error — not a real evaluation failure, a resource
 * exhaustion death spiral (queue depth climbs monotonically, never recovers,
 * because retries add more load to an already-backed-up queue).
 *
 * Override with SECURITY_PERSONA_MATRIX_EVAL_CONCURRENCY=N when targeting a
 * resource-constrained backend (e.g. =1 or =2 for a single local GPU). Same
 * pattern as ATTACK_DISCOVERY_EVAL_CONCURRENCY / LEAD_GENERATION_EVAL_CONCURRENCY.
 */
const resolveConcurrency = (): number | undefined => {
  const raw = process.env.SECURITY_PERSONA_MATRIX_EVAL_CONCURRENCY;
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(1, Math.floor(parsed));
};

/**
 * ExpectedToolCalled — verifies the primary expected tool was invoked.
 * Reads `expectedTools` from example metadata (first entry) or `tool_sequence`
 * from the expected output.
 */
const createPersonaMatrixExpectedToolCalledEvaluator = (): Evaluator => ({
  name: 'ExpectedToolCalled',
  kind: 'CODE',
  evaluate: async ({ output, expected, metadata }) => {
    // Try tool_sequence from expected output first, then expectedTools from metadata
    const toolSequence = (expected as PersonaMatrixExampleOutput | undefined)?.tool_sequence;
    const meta = metadata as { expectedTools?: string[] } | undefined;
    const expectedTools = meta?.expectedTools ?? toolSequence;

    if (!expectedTools?.length) {
      return {
        score: null,
        label: 'N/A',
        explanation: 'No expectedTools annotation — skipping ExpectedToolCalled.',
      };
    }

    const expectedToolId = expectedTools[0];
    const usedToolIds = getToolCallSteps(output as TaskOutput)
      .map((step) => step.tool_id)
      .filter((id): id is string => Boolean(id));

    return {
      score: usedToolIds.includes(expectedToolId) ? 1 : 0,
      metadata: { expectedToolId, usedToolIds },
    };
  },
});

/**
 * SkillInvoked — verifies the agent loaded an acceptable skill for THIS example.
 *
 * Scored per-example from the example's own metadata, not fanned out across the
 * whole dataset: an `alert-analysis` prompt must not be scored against the
 * `workflow-authoring` assertion. `expectedSkill` and `allowSkills` are a union
 * — loading any one of them passes. Examples with no `expectedSkill` are N/A
 * (score `null`), which is the correct shape for prompts whose documented
 * contract is a direct tool call with no skill load.
 */
const VALID_SKILL_NAME = /^[a-zA-Z0-9_-]+$/;

const createPersonaMatrixSkillInvokedEvaluator = ({
  traceEsClient,
  log,
}: {
  traceEsClient: EsClient;
  log: ToolingLog;
}): Evaluator => ({
  name: 'SkillInvoked',
  kind: 'CODE',
  evaluate: async ({ output, metadata }) => {
    const meta = metadata as { expectedSkill?: string; allowSkills?: string[] } | undefined;
    const acceptedSkills = [meta?.expectedSkill, ...(meta?.allowSkills ?? [])].filter(
      (s): s is string => typeof s === 'string' && s.length > 0
    );

    if (!acceptedSkills.length) {
      return {
        score: null,
        label: 'N/A',
        explanation: 'No expectedSkill/allowSkills annotation — skipping SkillInvoked.',
      };
    }

    const invalid = acceptedSkills.filter((s) => !VALID_SKILL_NAME.test(s));
    if (invalid.length) {
      return {
        score: null,
        label: 'error',
        explanation: `Invalid skill name(s): ${invalid.join(', ')}`,
      };
    }

    const traceId = (output as { traceId?: string } | undefined)?.traceId;
    if (!traceId || !isValidTraceId(traceId)) {
      return {
        score: null,
        label: 'unavailable',
        explanation: `No usable traceId for SkillInvoked (traceId: ${traceId ?? 'none'})`,
      };
    }

    // Skill loading in this build goes through the dedicated `load_skill`
    // tool (id `internalTools.loadSkill` = 'load_skill', see
    // agent-builder-common/tools/constants.ts), not a `filestore.read` on a
    // SKILL.md path. Its schema (load_skill.ts) takes a bare `skill` name or
    // path string, and the exported gen_ai.tool.call.arguments attribute is
    // the JSON-stringified call params, e.g. `{"skill":"alert-triage"}` —
    // verified live via direct ES inspection of
    // .ds-traces-agent_builder.otel-default-* docs. Matching on the JSON
    // `"skill":"<name>"` substring (rather than a `/name/SKILL.md` path,
    // which this tool never emits) is robust to the tool accepting a bare
    // name, a folder path, or a full SKILL.md path per its own docstring.
    const skillPredicate = acceptedSkills
      .map(
        (skillName) =>
          `attributes.gen_ai.tool.call.arguments LIKE "*\\"skill\\":\\"${skillName}\\"*"`
      )
      .join(' OR ');

    const query = `FROM traces-*
| WHERE trace.id == "${traceId}"
| STATS
  total_tool_spans = COUNT(
    CASE(attributes.elastic.inference.span.kind == "TOOL", 1, NULL)
  ),
  skill_invoked = COUNT(
    CASE(
      attributes.gen_ai.tool.name == "load_skill" AND (${skillPredicate}),
      1,
      NULL
    )
  )`;

    try {
      const response = (await traceEsClient.esql.query({ query })) as unknown as {
        columns: Array<{ name: string }>;
        values: unknown[][];
      };
      const row = response.values?.[0];
      const idx = (name: string) => response.columns?.findIndex((c) => c.name === name) ?? -1;
      const toolSpansIdx = idx('total_tool_spans');
      const invokedIdx = idx('skill_invoked');

      if (!row || toolSpansIdx === -1 || invokedIdx === -1) {
        return {
          score: null,
          label: 'unavailable',
          explanation: 'Expected columns not found in trace query response',
        };
      }

      // No tool spans at all means the trace is not yet searchable, not that the
      // skill was skipped — scoring 0 here would be a false failure.
      if (!(row[toolSpansIdx] as number | undefined)) {
        return {
          score: null,
          label: 'unavailable',
          explanation: 'No tool spans found for trace — trace data likely incomplete',
        };
      }

      const invoked = ((row[invokedIdx] as number | undefined) ?? 0) > 0;
      return { score: invoked ? 1 : 0, metadata: { acceptedSkills, invoked } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warning(`SkillInvoked failed for trace ${traceId}: ${message}`);
      return { score: null, label: 'error', explanation: `SkillInvoked query failed: ${message}` };
    }
  },
});

export function createEvaluatePersonaMatrixDataset({
  chatClient,
  evaluators,
  executorClient,
  traceEsClient,
  log,
}: {
  chatClient: PersonaMatrixChatClient;
  evaluators: DefaultEvaluators;
  executorClient: EvalsExecutorClient;
  traceEsClient: EsClient;
  log: ToolingLog;
}) {
  return async function evaluateDataset({
    dataset,
  }: {
    dataset: EvaluationDataset<PersonaMatrixExample>;
  }): Promise<void> {
    const skillInvokedEvaluator = createPersonaMatrixSkillInvokedEvaluator({
      traceEsClient,
      log,
    });

    const trajectoryEvaluator = createTrajectoryEvaluator({
      extractToolCalls: (output) => {
        const steps = (output as { steps?: Array<{ tool_id?: string }> })?.steps;
        if (!Array.isArray(steps)) return [];
        return steps.map((s) => s.tool_id).filter((t): t is string => typeof t === 'string');
      },
      goldenPathExtractor: (expected) => {
        const meta = expected as { tool_sequence?: string[] };
        return meta?.tool_sequence ?? [];
      },
    });

    const correctnessEvaluators = [
      evaluators.correctnessAnalysis(),
      evaluators.groundednessAnalysis(),
    ];

    const expectedToolCalledEvaluator = createPersonaMatrixExpectedToolCalledEvaluator();

    const { inputTokens, outputTokens, toolCalls, latency } = evaluators.traceBasedEvaluators;

    const allEvaluators: Evaluator[] = [
      skillInvokedEvaluator,
      trajectoryEvaluator,
      expectedToolCalledEvaluator,
      ...correctnessEvaluators,
      evaluators.criteria([
        'Relevance: The response directly addresses the user security question.',
        'Clarity: The response is well-structured and easy to follow.',
        'Accuracy: Security concepts and recommendations are technically correct.',
        'Completeness: The response covers the key aspects of the question.',
      ]),
      inputTokens,
      outputTokens,
      toolCalls,
      latency,
    ];

    await executorClient.runExperiment(
      {
        datasets: [dataset],
        metadata: { suite: 'security-persona-matrix', source: 'persona-matrix-eval' },
        concurrency: resolveConcurrency(),
        task: async (example) => {
          const input = example.input as PersonaMatrixExampleInput;
          const question = input?.question;
          if (!question) throw new Error('Missing question in example input');
          const response = await chatClient.query(question, input?.attachment);

          const taskOutput: TaskOutput = {
            response,
            traceId: response.traceId ?? null,
            steps: response.steps,
            skillId: response.traceId ?? 'unknown',
            tags: example.metadata?.tags ?? [],
          } as TaskOutput;

          // Run correctnessAnalysis (structured LLM judge) and attach metadata
          try {
            const correctnessResult = await withEvaluatorSpan('CorrectnessAnalysis', {}, () =>
              evaluators.correctnessAnalysis().evaluate({
                input,
                expected: example.output,
                output: taskOutput,
                metadata: example.metadata,
              })
            );
            return {
              ...(taskOutput as object),
              correctnessAnalysis: correctnessResult?.metadata,
            } as TaskOutput;
          } catch {
            // Judge model may fail; continue without correctnessAnalysis
            return taskOutput;
          }
        },
      },
      allEvaluators
    );

    log.info('[persona-matrix] dataset evaluation complete');
  };
}

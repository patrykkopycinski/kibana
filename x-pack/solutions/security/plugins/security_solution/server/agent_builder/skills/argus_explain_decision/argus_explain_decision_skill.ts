/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType, ToolType } from '@kbn/agent-builder-common/tools';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { z } from '@kbn/zod/v4';

import type { ReasoningChainSubject } from '@kbn/argus-console-common';

import { fetchReasoningChain } from '../../../lib/argus/fetch_reasoning_chain';
import { buildDecisionGraph } from '../../../lib/argus/routes/decision_graph';

const TOOL_ID = 'security.argus.explain_decision' as const;

/**
 * Agent Builder skill that mirrors the ARGUS Console `ReasoningDrilldownPanel`.
 * Any reasoning chain a human can inspect in the UI is also addressable by an
 * agent — this is the agent-native parity guarantee described in the ARGUS
 * design notes. The skill delegates to `fetchReasoningChain`, the same helper
 * the internal HTTP route calls, so UI and agent payloads never diverge.
 */
export const argusExplainDecisionSkill = defineSkillType({
  id: 'argus-explain-decision',
  name: 'argus-explain-decision',
  basePath: 'skills/security/argus',
  description:
    'Explain an ARGUS (Mythos-Resilient Defender) decision by returning the full reasoning chain ' +
    'for an alert or reasoning run. Returns the ordered reasoning steps, the escalation verdict, ' +
    'trust tier, and any injection-surface flags the defender raised. Use when the user asks why ' +
    'ARGUS escalated or suppressed an alert, or wants to inspect the thought process behind an ' +
    'autonomous SOC decision.',
  content: `# ARGUS Explain Decision

## When to use this skill

Use this skill whenever a user wants to understand **why** ARGUS reached a particular
verdict on an alert or reasoning run. Typical prompts:

- "Why did ARGUS escalate alert X?"
- "Show me the reasoning chain for run Y."
- "What injection surfaces did ARGUS flag on this alert?"
- "What was ARGUS's trust tier for this decision?"

## How to invoke

Call \`${TOOL_ID}\` with:

- \`subject_kind\`: \`"alert"\` when you have an alert \`_id\`, or \`"run"\` when you have
  a reasoning \`run_id\` (for example from a trace link).
- \`subject_id\`: the corresponding identifier.

## What you get back

A \`ReasoningChainBuildResult\` payload — the same shape the ARGUS Console renders:

- \`subject\` — echo of the input, so the caller can correlate.
- When a trace is found:
  - \`run_id\`, \`verdict\` (\`escalate\` | \`suppress\` | \`inconclusive\`)
  - \`trust_tier\` (\`high\` | \`medium\` | \`low\`)
  - \`steps\` — ordered reasoning steps with prompts, tool calls, and rationales
  - \`injection_surface_flags\` — any input channels ARGUS considered untrusted
- When no trace is available: \`reason_code: 'no_trace'\` — explain to the user that
  the alert was not produced by an ARGUS run, and suggest checking the rule that
  generated it instead.

## Optional: decision-graph neighborhood

Pass \`include_decision_graph: true\` (and optionally \`decision_graph_depth\`, default
2, max 3) to also receive the typed-edge neighborhood rooted at the reasoning run —
the same payload the ARGUS Console \"Decision graph\" flyout renders. This lets you
answer follow-up questions like \"what advisories, rules, and intents fed into this
decision?\" in a single skill call, matching the agent-native parity guarantee.

## Best practices

- Always pass the reasoning chain back to the user verbatim when they ask "why" —
  ARGUS decisions must be auditable. Summaries are fine for long chains, but keep
  the verdict and trust tier exact.
- When the chain is \`inconclusive\` or trust tier is \`low\`, highlight the specific
  steps that introduced doubt rather than restating the verdict.
- If \`injection_surface_flags\` is non-empty, lead with them — they explain why the
  defender may have been cautious.
- Only request \`include_decision_graph\` when the user is asking about provenance
  or upstream/downstream relationships — the graph payload can be large.`,
  getRegistryTools: () => [],
  getInlineTools: () => [
    {
      id: TOOL_ID,
      type: ToolType.builtin,
      description:
        'Fetch the ARGUS reasoning chain for an alert or reasoning run. Returns the ordered ' +
        'steps, verdict, trust tier, and injection-surface flags the defender recorded. Use when ' +
        'the user asks why ARGUS reached a decision.',
      schema: z.object({
        subject_kind: z
          .enum(['alert', 'run'])
          .describe(
            'What `subject_id` refers to. Use `alert` when you have an alert `_id`, or `run` ' +
              'when you already have an ARGUS reasoning `run_id`.'
          ),
        subject_id: z
          .string()
          .min(1)
          .max(1024)
          .describe('The alert `_id` or reasoning `run_id` to explain.'),
        include_decision_graph: z
          .boolean()
          .default(false)
          .describe(
            'When true, also fetch the decision-graph neighborhood rooted at the reasoning ' +
              'run — the same payload the ARGUS Console flyout renders. Adds `decisionGraph` to ' +
              'the response data.'
          ),
        decision_graph_depth: z
          .number()
          .int()
          .min(1)
          .max(3)
          .default(2)
          .describe(
            'BFS depth for the decision-graph neighborhood. Ignored unless ' +
              '`include_decision_graph` is true. Server-capped at 3.'
          ),
      }),
      handler: async (
        {
          subject_kind: subjectKindRaw,
          subject_id: subjectIdRaw,
          include_decision_graph: includeDecisionGraphRaw,
          decision_graph_depth: decisionGraphDepthRaw,
        },
        context
      ) => {
        const subjectKind = subjectKindRaw as 'alert' | 'run';
        const subjectId = String(subjectIdRaw);
        const includeDecisionGraph = Boolean(includeDecisionGraphRaw);
        const decisionGraphDepth = Number(decisionGraphDepthRaw) || 2;
        const subject: ReasoningChainSubject = { kind: subjectKind, id: subjectId };

        try {
          const result = await fetchReasoningChain(context.esClient.asCurrentUser, subject);

          if ('reason_code' in result && result.reason_code === 'no_trace') {
            return {
              results: [
                {
                  type: ToolResultType.other,
                  data: {
                    message:
                      'No ARGUS reasoning trace found for the requested subject. The alert may ' +
                      'not have been produced by an ARGUS run.',
                    subject,
                  },
                },
              ],
            };
          }

          const runId = result.chain?.run_id;
          let decisionGraph: Awaited<ReturnType<typeof buildDecisionGraph>> | undefined;
          if (includeDecisionGraph && runId) {
            try {
              decisionGraph = await buildDecisionGraph({
                esClient: context.esClient.asCurrentUser,
                rootKind: 'reasoning',
                rootId: runId,
                depth: decisionGraphDepth,
              });
            } catch (graphError) {
              // Best-effort — don't fail the whole explain call if the graph
              // index is unavailable or empty. The caller can detect the gap
              // by the absence of `decisionGraph` in the response.
              decisionGraph = undefined;
            }
          }

          return {
            results: [
              {
                type: ToolResultType.other,
                data: {
                  message: `ARGUS reasoning chain for ${subject.kind}:${subject.id}${
                    decisionGraph
                      ? ` (with decision graph, ${decisionGraph.nodes.length} nodes, ${decisionGraph.edges.length} edges)`
                      : ''
                  }`,
                  reasoningChain: result,
                  ...(decisionGraph ? { decisionGraph } : {}),
                },
              },
            ],
          };
        } catch (error) {
          return {
            results: [
              {
                type: ToolResultType.error,
                data: {
                  message: `Failed to fetch ARGUS reasoning chain: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                },
              },
            ],
          };
        }
      },
    },
  ],
});

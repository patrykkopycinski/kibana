/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — ES|QL draft validation step, shared definition.
 *
 * Pure guard over model output: the only security boundary between what a
 * model drafted and what later steps preview, attach and propose. The input is
 * the drafted rule object; the output is either the validated rule — tags
 * injected, schedule set to the shipped trial window — or a `skip_reason`
 * naming the rule that fired. Parse errors are expected input, not failure:
 * a draft that does not parse skips, it never throws.
 */

import { z, lazySchema } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { BaseStepDefinition } from '@kbn/workflows';
import { i18n } from '@kbn/i18n';

import { DETONATE_PROTOTYPE_NAMESPACE } from '../../../detonate_prototype';

export const DetonateValidateDraftStepId = `${DETONATE_PROTOTYPE_NAMESPACE}.validateDraft` as const;

/** Drafted-rule fields the step validates and re-emits. Mirrors the shape `draft_creation` emits. */
export const detonateValidateDraftRuleSchema = lazySchema(() =>
  z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    query: z.string().min(1),
    language: z.literal('esql'),
    type: z.literal('esql'),
    interval: z.string(),
    from: z.string(),
    to: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    risk_score: z.number().int().min(0).max(100),
    threat: z.array(z.record(z.string(), z.unknown())),
    tags: z.array(z.string()),
  })
);

export const detonateValidateDraftInputSchema = lazySchema(() =>
  z.object({
    rule: detonateValidateDraftRuleSchema,
    task_id: z
      .string()
      .min(1)
      .max(128)
      .describe('Detonate run id the draft belongs to; lands in the `detonate:<task_id>` tag.'),
    space_id: z
      .string()
      .min(1)
      .max(128)
      .describe('Run space; names the sandbox stream the count query targets.'),
  })
);

export const detonateValidateDraftOutputSchema = lazySchema(() =>
  z.object({
    valid: z.boolean(),
    /** Set when `valid` is true: the rule to carry forward, never `draft_creation`'s copy. */
    rule: detonateValidateDraftRuleSchema.optional(),
    /** Set when `valid` is false: names the guard rule or shape check that fired. */
    skip_reason: z.string().optional(),
    /** Always set when valid: sandbox count query, ready for the `sandbox_count` route. */
    sandbox_query: z.string().optional(),
    /** Always set when valid: the per-run candidate tag injected into the rule. */
    candidate_tag: z.string().optional(),
    /** Always set when valid: production count query (sources untouched, LIMIT removed, count appended). */
    production_query: z.string().optional(),
    /** Always set when valid: true when the pipeline aggregates (`STATS … BY`), so the count is over groups. */
    aggregating: z.boolean().optional(),
    /** Always set when valid: index patterns the query reads, for the comment's scope line. */
    source_patterns: z.array(z.string()).optional(),
  })
);

export const detonateValidateDraftStepCommonDefinition: BaseStepDefinition<
  typeof detonateValidateDraftInputSchema,
  typeof detonateValidateDraftOutputSchema
> = {
  id: DetonateValidateDraftStepId,
  category: StepCategory.KibanaSecurity,
  label: i18n.translate('xpack.securitySolution.workflows.steps.validateDraft.label', {
    defaultMessage: 'Validate ES|QL draft (prototype)',
  }),
  description: i18n.translate('xpack.securitySolution.workflows.steps.validateDraft.description', {
    defaultMessage:
      'Parses a drafted ES|QL rule with the full ES|QL parser and rejects anything that reads outside the space default indices or could reach the detonate sandbox stream. A rejected draft is never previewed, attached or proposed.',
  }),
  inputSchema: detonateValidateDraftInputSchema,
  outputSchema: detonateValidateDraftOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.validateDraft.documentation.details',
      {
        defaultMessage:
          'Prototype step. The guard walks the parsed AST (never string matching): single local FROM with sources contained in `securitySolution:defaultIndex`, no SET header, no subquery, no cluster prefix, no `::` selector, no `-` exclusion, no date-math, and nothing that could match the sandbox stream `.kibana-detonate-sandbox-*`. On success the output rule carries the drafted tags plus `detonate:trial`, `detonate:<task_id>` and a fresh `detonate:candidate:<uuid>` tag, and the trial schedule (interval/from replaced). `sandbox_query` is the sandbox-count variant built from the same AST.',
      }
    ),
    examples: [
      `## Gate a drafted rule before any preview or proposal
\`\`\`yaml
- name: validate_draft
  type: ${DetonateValidateDraftStepId}
  with:
    rule: "\${{ steps.draft_creation.output.structured_output.rule }}"
    task_id: "{{ inputs.task_id }}"
    space_id: "{{ workflow.spaceId }}"

- name: propose
  type: workflow.execute
  if: "\${{ steps.validate_draft.output.valid == true }}"
  with: ...
\`\`\``,
    ],
  },
};

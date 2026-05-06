/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { BaseStepDefinition } from '@kbn/workflows';
import { i18n } from '@kbn/i18n';

/**
 * Path A end-to-end synthesis for a single CVE advisory, exposed as a
 * workflow step. Replaces the old TaskManager-driven autonomous loop —
 * the workflow `soc_argus_synthesis_driver.yaml` schedules ticks, reads
 * the kill switch, and iterates advisories; this step handles the
 * heavy lift per advisory (Pareto frontier, variant generation /
 * validation, mutation-intent assembly, write).
 */
export const argusSynthesizeAdvisoryInputSchema = z.object({
  advisory_id: z
    .string()
    .min(1)
    .describe(
      'The advisory id (typically a CVE id, e.g. CVE-2024-12345) of the advisory to synthesise a rule for. Must already exist in `.soc-cve-advisories`.'
    ),
  caller_id: z
    .string()
    .min(1)
    .default('workflow')
    .describe(
      'Tag embedded in `corpus_id` and the audit log so per-tick traces can be attributed back to the workflow execution that produced them.'
    ),
  dry_run: z
    .boolean()
    .default(false)
    .describe(
      'When true, runs the full Path A pipeline (Pareto + variant generation + validation) but does not persist any document.'
    ),
});

export const argusSynthesizeAdvisoryOutputSchema = z.object({
  advisory_id: z.string(),
  outcome_kind: z.enum([
    'synthesized',
    'dead_letter_high_rejection_rate',
    'advisory_not_found',
    'advisory_invalid',
  ]),
  rec_id: z.string().optional(),
  reason: z.string().optional(),
  trace_count: z.number(),
  variant_count: z.number().optional(),
  duration_ms: z.number(),
  dry_run: z.boolean(),
});

export const argusSynthesizeAdvisoryStepCommonDefinition: BaseStepDefinition<
  typeof argusSynthesizeAdvisoryInputSchema,
  typeof argusSynthesizeAdvisoryOutputSchema
> = {
  id: 'security.argusSynthesizeAdvisory',
  label: i18n.translate('xpack.securitySolution.workflows.steps.argusSynthesizeAdvisory.label', {
    defaultMessage: 'ARGUS — Synthesise advisory',
  }),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.argusSynthesizeAdvisory.description',
    {
      defaultMessage:
        'Run Path A end-to-end on a single CVE advisory: pick the Pareto-optimal draft rule, generate and validate the polymorphic variant corpus, and write the canonical mutation intent + reasoning trace. The workflow that wraps this step (e.g. soc_argus_synthesis_driver.yaml) handles scheduling, kill-switch checks, and advisory selection.',
    }
  ),
  category: StepCategory.Kibana,
  stability: 'tech_preview',
  inputSchema: argusSynthesizeAdvisoryInputSchema,
  outputSchema: argusSynthesizeAdvisoryOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.argusSynthesizeAdvisory.documentation.details',
      {
        defaultMessage:
          "Looks up the advisory in .soc-cve-advisories, runs the deterministic Pareto frontier from @kbn/argus-exploit-to-detection, generates polymorphic variants (with a strict golden-set blocklist + axis-marker validator), and writes a mutation-intent envelope to .soc-mutation-intents using workflow-execution credentials. Per-variant reasoning traces are appended to .soc-reasoning-trace and a tick-level row is appended to .soc-evolution-log. When the validator's rejection rate clears the dead-letter threshold the step returns outcome_kind=dead_letter_high_rejection_rate without writing.",
      }
    ),
    examples: [
      `## Synthesize one advisory inside a foreach
\`\`\`yaml
- name: synthesize_advisory
  type: security.argusSynthesizeAdvisory
  with:
    advisory_id: "{{ foreach.item._source.advisory_id }}"
    caller_id: "soc_argus_synthesis_driver"
\`\`\``,
    ],
  },
};

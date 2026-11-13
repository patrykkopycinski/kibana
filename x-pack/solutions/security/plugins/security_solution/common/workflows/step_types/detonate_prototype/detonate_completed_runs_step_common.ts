/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Read-only: finds this space's completed detonations whose source alert has
 * no verdict yet. A `verdict_applied` decision in the results index is the
 * handled marker — the service records no completion time, so "already
 * written back" is read off the decision, not off the run. The step writes nothing; the sweep applies.
 */

import { z, lazySchema } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { BaseStepDefinition } from '@kbn/workflows';
import { i18n } from '@kbn/i18n';

import { DETONATE_PROTOTYPE_NAMESPACE, DETONATE_VERDICTS } from '../../../detonate_prototype';

export const DetonateCompletedRunsStepId =
  `${DETONATE_PROTOTYPE_NAMESPACE}.detonateCompletedRuns` as const;

export const DETONATE_COMPLETED_RUNS_DEFAULT_MAX_PENDING = 20;

export const detonateCompletedRunsInputSchema = lazySchema(() =>
  z.object({
    max_pending: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(DETONATE_COMPLETED_RUNS_DEFAULT_MAX_PENDING)
      .describe('Most write-backs one sweep returns; the rest wait for the next sweep.'),
  })
);

export const detonateCompletedRunsOutputSchema = lazySchema(() =>
  z.object({
    completed_runs: z.number().describe('Completed, successful runs read in this space.'),
    unlinked_runs: z.number().describe('Completed runs with no source alert to write back to.'),
    already_applied: z.number().describe('Source alerts whose verdict is already recorded.'),
    deferred: z.number().describe('Pending write-backs left for the next sweep.'),
    pending_count: z.number(),
    pending: z.array(
      z.object({
        task_id: z.string(),
        alert_id: z.string(),
        sample_hash: z.string().optional(),
        created_at: z.string(),
        verdict: z.enum(DETONATE_VERDICTS),
        evidence: z.string(),
        suggested_tag: z.string(),
      })
    ),
  })
);

export const detonateCompletedRunsStepCommonDefinition: BaseStepDefinition<
  typeof detonateCompletedRunsInputSchema,
  typeof detonateCompletedRunsOutputSchema
> = {
  id: DetonateCompletedRunsStepId,
  category: StepCategory.KibanaSecurity,
  label: i18n.translate('xpack.securitySolution.workflows.steps.detonateCompletedRuns.label', {
    defaultMessage: 'Detonate completed runs (prototype)',
  }),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.detonateCompletedRuns.description',
    {
      defaultMessage:
        "Lists this space's completed detonations whose source alert has no recorded detonation verdict yet, newest run per alert, with the verdict and evidence to write back.",
    }
  ),
  inputSchema: detonateCompletedRunsInputSchema,
  outputSchema: detonateCompletedRunsOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.detonateCompletedRuns.documentation.details',
      {
        defaultMessage:
          'Prototype step. Read-only. Failed and unfinished runs are skipped. Runs without an alert:<id> tag (submitted from the detonation page or by the assistant) are counted but cannot be written back.',
      }
    ),
    examples: [
      `## Write back every verdict nobody applied yet
\`\`\`yaml
- name: completed_runs
  type: ${DetonateCompletedRunsStepId}
  with:
    max_pending: 20

- name: write_back
  type: foreach
  if: "\${{ steps.completed_runs.output.pending_count > 0 }}"
  foreach: "\${{ steps.completed_runs.output.pending }}"
  steps:
    - name: apply
      type: detonate.prototype.applyDetonationVerdict
      with:
        verdict: "{{ foreach.item.verdict }}"
        alert_id: "{{ foreach.item.alert_id }}"
        task_id: "{{ foreach.item.task_id }}"
        evidence: "{{ foreach.item.evidence }}"
\`\`\``,
    ],
  },
};

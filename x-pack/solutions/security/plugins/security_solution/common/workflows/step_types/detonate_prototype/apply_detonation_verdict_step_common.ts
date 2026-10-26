/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — apply-verdict step, shared definition.
 *
 * The writing half of the verdict: tags the alert (`detonate:<verdict>`),
 * writes the evidence as an alert note, and never touches alert status. The
 * status decision stays with a human — closing on `quiet` is a suggestion
 * surfaces can render, not an action the step takes.
 */

import { z, lazySchema } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { BaseStepDefinition } from '@kbn/workflows';
import { i18n } from '@kbn/i18n';

import { DETONATE_PROTOTYPE_NAMESPACE, DETONATE_VERDICTS } from '../../../detonate_prototype';
import { MAX_COMMENT_LENGTH } from '../../../constants';

export const ApplyDetonationVerdictStepId =
  `${DETONATE_PROTOTYPE_NAMESPACE}.applyDetonationVerdict` as const;

export const applyDetonationVerdictInputSchema = lazySchema(() =>
  z.object({
    verdict: z.enum(DETONATE_VERDICTS),
    alert_id: z.string().min(1).max(128),
    task_id: z.string().min(1).max(128),
    evidence: z
      .string()
      .min(1)
      .max(MAX_COMMENT_LENGTH - 256)
      .describe('Human-readable evidence line, written as the alert note body.'),
  })
);

export const applyDetonationVerdictOutputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    tag: z.string(),
    note_id: z.string().optional(),
    message: z.string(),
  })
);

export const applyDetonationVerdictStepCommonDefinition: BaseStepDefinition<
  typeof applyDetonationVerdictInputSchema,
  typeof applyDetonationVerdictOutputSchema
> = {
  id: ApplyDetonationVerdictStepId,
  category: StepCategory.KibanaSecurity,
  label: i18n.translate('xpack.securitySolution.workflows.steps.applyDetonationVerdict.label', {
    defaultMessage: 'Apply detonation verdict (prototype)',
  }),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.applyDetonationVerdict.description',
    {
      defaultMessage:
        'Tags the alert `detonate:<verdict>` and adds the detonation evidence as an alert note. Never changes alert status.',
    }
  ),
  inputSchema: applyDetonationVerdictInputSchema,
  outputSchema: applyDetonationVerdictOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.applyDetonationVerdict.documentation.details',
      {
        defaultMessage:
          'Prototype step. Writes exactly two things to the alert: the `detonate:<verdict>` tag and a note carrying the evidence and a link to the run. Closing the alert on a `quiet` verdict stays a human decision — the step never sets status.',
      }
    ),
    examples: [
      `## Detonate, then write the verdict back to the alert it came from
\`\`\`yaml
- name: detonate
  type: detonate.prototype.detonateSample
  with:
    sample_hash: "{{ event.file.hash.sha256 }}"
    tags:
      - "alert:{{ event.alert_id }}"

- name: verdict
  type: detonate.prototype.detonateVerdict
  with:
    task_id: "{{ steps.detonate.output.task_id }}"

- name: apply
  type: ${ApplyDetonationVerdictStepId}
  with:
    verdict: "{{ steps.verdict.output.verdict }}"
    alert_id: "{{ steps.verdict.output.alert_id }}"
    task_id: "{{ steps.verdict.output.task_id }}"
    evidence: "{{ steps.verdict.output.evidence }}"
\`\`\``,
    ],
  },
};

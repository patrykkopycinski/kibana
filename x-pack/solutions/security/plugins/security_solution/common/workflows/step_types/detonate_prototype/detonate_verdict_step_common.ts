/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — verdict step, shared definition.
 *
 * Pure: turns a detonation task's output into a verdict object and writes
 * nothing. Workflows that only want the conclusion (or want to branch on it
 * before deciding whether to touch the alert) use this step; the writing
 * half is `apply_detonation_verdict`.
 */

import { z, lazySchema } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { BaseStepDefinition } from '@kbn/workflows';
import { i18n } from '@kbn/i18n';

import {
  DETONATE_PROTOTYPE_NAMESPACE,
  DETONATION_RUN_STATUSES,
  DETONATE_VERDICTS,
  DETONATE_VM_OS_FAMILIES,
} from '../../../detonate_prototype';

export const DetonateVerdictStepId = `${DETONATE_PROTOTYPE_NAMESPACE}.detonateVerdict` as const;

export const detonateVerdictInputSchema = lazySchema(() =>
  z.object({
    task_id: z.string().min(1).max(128).describe('The detonation task to derive a verdict from.'),
    /** Optional because the derivation also reads the task's `alert:<id>` tag. */
    alert_id: z
      .string()
      .min(1)
      .max(128)
      .optional()
      .describe("Alert the run was started from. Defaults to the task's `alert:<id>` tag."),
  })
);

export const detonateVerdictOutputSchema = lazySchema(() =>
  z.object({
    status: z.enum(DETONATION_RUN_STATUSES),
    /** Present only when `status` is `complete`. */
    verdict: z.enum(DETONATE_VERDICTS).optional(),
    task_id: z.string(),
    alert_id: z.string().optional(),
    /** Sandbox OS, when the run recorded one — endpoint artifacts are per-OS. */
    vm_os_family: z.enum(DETONATE_VM_OS_FAMILIES).optional(),
    total_alerts_count: z.number().int(),
    endpoint_alert_event_codes: z.array(z.string()),
    detection_rule_names: z.array(z.string()),
    evidence: z.string(),
  })
);

export type DetonateVerdictStepOutput = z.infer<ReturnType<typeof detonateVerdictOutputSchema>>;

export const detonateVerdictStepCommonDefinition: BaseStepDefinition<
  typeof detonateVerdictInputSchema,
  typeof detonateVerdictOutputSchema
> = {
  id: DetonateVerdictStepId,
  category: StepCategory.KibanaSecurity,
  label: i18n.translate('xpack.securitySolution.workflows.steps.detonateVerdict.label', {
    defaultMessage: 'Detonate verdict (prototype)',
  }),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.detonateVerdict.description',
    {
      defaultMessage:
        'Derives a verdict (malicious, benign or inconclusive) from a complete detonation run; a failed or unfinished run reports its status and no verdict. Writes nothing.',
    }
  ),
  inputSchema: detonateVerdictInputSchema,
  outputSchema: detonateVerdictOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.detonateVerdict.documentation.details',
      {
        defaultMessage:
          'Prototype step. Reads the detonation task and derives the verdict with the same rule the Detonate page uses: a run that failed or has not finished has `status` `failed` or `running` and no verdict; a complete run with diagnostic-only alerts is `inconclusive`, a complete run with zero alerts is `benign` (no malicious behavior observed in the sandbox, not proof the sample is safe), and a run with production endpoint alerts or detection rule hits is `malicious`. Pure — the writing half is `detonate.prototype.applyDetonationVerdict`.',
      }
    ),
    examples: [
      `## Branch on what the sample did
\`\`\`yaml
- name: verdict
  type: ${DetonateVerdictStepId}
  with:
    task_id: "{{ steps.detonate.output.task_id }}"

- name: tag_alert
  type: detonate.prototype.applyDetonationVerdict
  if: "\${{ steps.verdict.output.status == 'complete' }}"
  with:
    verdict: "{{ steps.verdict.output.verdict }}"
    alert_id: "{{ steps.verdict.output.alert_id }}"
    evidence: "{{ steps.verdict.output.evidence }}"
\`\`\``,
    ],
  },
};

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
  DETONATE_VERDICTS,
  DETONATE_VM_OS_FAMILIES,
} from '../../../detonate_prototype';
import type { DetonateVmOsFamily } from '../../../detonate_prototype';

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
    verdict: z.enum(DETONATE_VERDICTS),
    task_id: z.string(),
    alert_id: z.string().optional(),
    /** Sandbox OS, when the run recorded one — endpoint artifacts are per-OS. */
    vm_os_family: z.enum(DETONATE_VM_OS_FAMILIES).optional(),
    total_alerts_count: z.number().int(),
    endpoint_alert_event_codes: z.array(z.string()),
    detection_rule_names: z.array(z.string()),
    evidence: z.string(),
    suggested_tag: z.string(),
  })
);

export interface DetonateVerdictStepOutput {
  verdict: (typeof DETONATE_VERDICTS)[number];
  task_id: string;
  alert_id?: string;
  vm_os_family?: DetonateVmOsFamily;
  total_alerts_count: number;
  endpoint_alert_event_codes: string[];
  detection_rule_names: string[];
  evidence: string;
  suggested_tag: string;
}

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
        'Derives a verdict (malicious, quiet or inconclusive) from a finished detonation run. Writes nothing.',
    }
  ),
  inputSchema: detonateVerdictInputSchema,
  outputSchema: detonateVerdictOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.detonateVerdict.documentation.details',
      {
        defaultMessage:
          'Prototype step. Reads the detonation task and derives the verdict with the same rule the Detonate page uses: failed or unfinished runs are `inconclusive` (never benign), a completed run with zero alerts is `quiet`, and a run with alerts is `malicious`. Pure — the writing half is `security.applyDetonationVerdict`.',
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
  type: security.applyDetonationVerdict
  with:
    verdict: "{{ steps.verdict.output.verdict }}"
    alert_id: "{{ steps.verdict.output.alert_id }}"
    evidence: "{{ steps.verdict.output.evidence }}"
\`\`\``,
    ],
  },
};

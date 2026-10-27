/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. as a
 * contributor license agreements. Licensed under the Elastic License 2.0;
 * you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — reputation step, shared definition.
 *
 * Pure: asks the detonate service's reputation gate about one digest and
 * returns the answer. `unknown` is passed through untouched — it is honest
 * uncertainty ("no prior verdict"), never benign, and it is the workflow
 * (the `switch` after this step) that decides unknown means "detonate".
 */

import { z, lazySchema } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { BaseStepDefinition } from '@kbn/workflows';
import { i18n } from '@kbn/i18n';

import {
  DETONATE_PROTOTYPE_NAMESPACE,
  DETONATE_REPUTATION_STATUSES,
} from '../../../detonate_prototype';

export const DetonateReputationStepId =
  `${DETONATE_PROTOTYPE_NAMESPACE}.detonateReputation` as const;

export const detonateReputationInputSchema = lazySchema(() =>
  z.object({
    sha256: z
      .string()
      .min(32)
      .max(64)
      .describe('sha256 of the sample to look up, typically `file.hash.sha256` from an alert.'),
  })
);

export const detonateReputationOutputSchema = lazySchema(() =>
  z.object({
    sha256: z.string(),
    status: z.enum(DETONATE_REPUTATION_STATUSES),
    source: z.string(),
    malware_family: z.string().optional(),
    last_seen: z.string().optional(),
  })
);

export interface DetonateReputationStepOutput {
  sha256: string;
  status: (typeof DETONATE_REPUTATION_STATUSES)[number];
  source: string;
  malware_family?: string;
  last_seen?: string;
}

export const detonateReputationStepCommonDefinition: BaseStepDefinition<
  typeof detonateReputationInputSchema,
  typeof detonateReputationOutputSchema
> = {
  id: DetonateReputationStepId,
  category: StepCategory.KibanaSecurity,
  label: i18n.translate('xpack.securitySolution.workflows.steps.detonateReputation.label', {
    defaultMessage: 'Detonate reputation (prototype)',
  }),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.detonateReputation.description',
    {
      defaultMessage:
        'Asks the detonate service reputation gate about one sha256. Pure — returns `known-malicious` or `unknown`; `unknown` is honest uncertainty, not benign.',
    }
  ),
  inputSchema: detonateReputationInputSchema,
  outputSchema: detonateReputationOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.detonateReputation.documentation.details',
      {
        defaultMessage:
          'Prototype step. The gate only answers `known-malicious` or `unknown` — there is no benign answer, so a workflow must route `unknown` to a detonation rather than reading it as clean. Use it as the switch before `security.detonateSample` so already-known malware is never detonated again.',
      }
    ),
    examples: [
      `## Only detonate what the reputation gate has never seen
\`\`\`yaml
- name: reputation
  type: ${DetonateReputationStepId}
  with:
    sha256: "{{ inputs.sample_hash }}"

- name: gate
  type: switch
  expression: "{% if steps.reputation.output.status == 'known-malicious' %}skip{% endif %}"
  cases:
    - match: skip
      steps:
        - name: close_alert
          type: security.applyDetonationVerdict
          with:
            verdict: "malicious"
            ...
\`\`\``,
    ],
  },
};

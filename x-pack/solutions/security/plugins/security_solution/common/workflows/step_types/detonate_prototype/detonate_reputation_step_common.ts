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
 * Detonate prototype — prior-run lookup step, shared definition.
 *
 * Pure: reads this space's earlier runs of one digest and returns whether the
 * newest completed one was malicious. The step id keeps its `reputation` name
 * so existing workflows resolve. `unknown` is honest uncertainty ("no prior
 * malicious run here"), never benign, and it is the workflow (the `switch`
 * after this step) that decides unknown means "detonate".
 */

import { z, lazySchema } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { BaseStepDefinition } from '@kbn/workflows';
import { i18n } from '@kbn/i18n';

import {
  DETONATE_PRIOR_RUN_STATUSES,
  DETONATE_PROTOTYPE_NAMESPACE,
  DETONATE_VERDICTS,
} from '../../../detonate_prototype';

export const DetonateReputationStepId =
  `${DETONATE_PROTOTYPE_NAMESPACE}.detonateReputation` as const;

export const detonateReputationInputSchema = lazySchema(() =>
  z.object({
    sha256: z
      .string()
      .length(64)
      .describe('sha256 of the sample to look up, typically `file.hash.sha256` from an alert.'),
  })
);

export const detonateReputationOutputSchema = lazySchema(() =>
  z.object({
    sha256: z.string(),
    status: z.enum(DETONATE_PRIOR_RUN_STATUSES),
    source: z.string(),
    last_task_id: z.string().optional().describe('The run the status was read from.'),
    last_verdict: z.enum(DETONATE_VERDICTS).optional(),
    last_seen: z.string().optional(),
  })
);

export const detonateReputationStepCommonDefinition: BaseStepDefinition<
  typeof detonateReputationInputSchema,
  typeof detonateReputationOutputSchema
> = {
  id: DetonateReputationStepId,
  category: StepCategory.KibanaSecurity,
  label: i18n.translate('xpack.securitySolution.workflows.steps.detonateReputation.label', {
    defaultMessage: 'Detonate prior-run lookup (prototype)',
  }),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.detonateReputation.description',
    {
      defaultMessage:
        'Looks up earlier detonations of one sha256 in this space. Pure — returns `known-malicious` or `unknown`; `unknown` is honest uncertainty, not benign.',
    }
  ),
  inputSchema: detonateReputationInputSchema,
  outputSchema: detonateReputationOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.detonateReputation.documentation.details',
      {
        defaultMessage:
          'Prototype step. Answers `known-malicious` when the newest completed run of the sample in this space was malicious, otherwise `unknown` — there is no benign answer, so a workflow must route `unknown` to a detonation rather than reading it as clean. Use it as the switch before `detonate.prototype.detonateSample` so malware this space has already detonated is not detonated again.',
      }
    ),
    examples: [
      `## Only detonate what this space has not already seen detonate
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
          type: detonate.prototype.applyDetonationVerdict
          with:
            verdict: "malicious"
            ...
\`\`\``,
    ],
  },
};

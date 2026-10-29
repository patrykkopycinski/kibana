/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Read-only: summarizes every completed detonation of one sample, newest
 * first, into the evidence the proposal logic acts on — the quiet streak,
 * whether it clears the proposal threshold, and the proposal text. The step
 * proposes nothing itself; the workflow decides what to raise.
 */

import { z, lazySchema } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { BaseStepDefinition } from '@kbn/workflows';
import { i18n } from '@kbn/i18n';

import {
  DETONATE_PROTOTYPE_NAMESPACE,
  DETONATE_VERDICTS,
  PROPOSAL_QUIET_STREAK_THRESHOLD,
} from '../../../detonate_prototype';

export const DetonateRunHistoryStepId =
  `${DETONATE_PROTOTYPE_NAMESPACE}.detonateRunHistory` as const;

export const detonateRunHistoryInputSchema = lazySchema(() =>
  z.object({
    sha256: z
      .string()
      .length(64)
      .describe('sha256 of the sample whose completed detonations to summarize.'),
  })
);

export const detonateRunHistoryOutputSchema = lazySchema(() =>
  z.object({
    sha256: z.string(),
    completed_runs: z.number(),
    quiet_streak: z.number(),
    proposal_eligible: z.boolean(),
    runs: z.array(
      z.object({
        task_id: z.string(),
        created_at: z.string(),
        verdict: z.enum(DETONATE_VERDICTS),
      })
    ),
    evidence_comment: z.string(),
  })
);

export const detonateRunHistoryStepCommonDefinition: BaseStepDefinition<
  typeof detonateRunHistoryInputSchema,
  typeof detonateRunHistoryOutputSchema
> = {
  id: DetonateRunHistoryStepId,
  category: StepCategory.KibanaSecurity,
  label: i18n.translate('xpack.securitySolution.workflows.steps.detonateRunHistory.label', {
    defaultMessage: 'Detonate run history (prototype)',
  }),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.detonateRunHistory.description',
    {
      defaultMessage:
        'Summarizes every completed detonation of one sha256, newest first: the consecutive quiet-run streak and whether it clears the {threshold}-run exception-proposal bar.',
      values: { threshold: PROPOSAL_QUIET_STREAK_THRESHOLD },
    }
  ),
  inputSchema: detonateRunHistoryInputSchema,
  outputSchema: detonateRunHistoryOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.detonateRunHistory.documentation.details',
      {
        defaultMessage:
          'Prototype step. Read-only. Failed and unfinished runs are excluded, so they neither extend nor break the streak. A quiet streak is evidence toward an exception, never proof the sample is benign — gate anything it feeds behind an analyst.',
      }
    ),
    examples: [
      `## Propose an exception once a sample has run quiet enough times
\`\`\`yaml
- name: history
  type: ${DetonateRunHistoryStepId}
  with:
    sha256: "{{ inputs.sha256 }}"

- name: propose_exception
  type: workflow.execute
  if: "\${{ steps.history.output.proposal_eligible == true }}"
  with:
    workflow-id: system-create-alertzero-proposal
    run-as-mode: inherit
    inputs:
      conversationId: "{{ inputs.conversation_id }}"
      comment: "{{ steps.history.output.evidence_comment }}"
\`\`\``,
    ],
  },
};

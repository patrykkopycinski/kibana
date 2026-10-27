/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — case-comment step, shared definition.
 *
 * The F5 half of the verdict write-back: when an alert already lives in a
 * case, the verdict evidence belongs in that case's timeline too, next to
 * every other note the investigation collected. Takes an explicit case_id —
 * it never guesses which case an alert is in; the caller resolves that.
 */

import { z, lazySchema } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { BaseStepDefinition } from '@kbn/workflows';
import { i18n } from '@kbn/i18n';

import { DETONATE_PROTOTYPE_NAMESPACE } from '../../../detonate_prototype';
import { MAX_COMMENT_LENGTH } from '../../../constants';
import { MAX_DOCUMENT_ID_LENGTH } from '../common/constants';

export const CaseCommentStepId = `${DETONATE_PROTOTYPE_NAMESPACE}.caseComment` as const;

export const caseCommentInputSchema = lazySchema(() =>
  z.object({
    case_id: z
      .string()
      .min(1)
      .max(MAX_DOCUMENT_ID_LENGTH)
      .describe('The id of the case to comment on. Resolve it before calling; never guessed.'),
    comment: z
      .string()
      .min(1)
      .max(MAX_COMMENT_LENGTH - 256)
      .describe('The comment body. Markdown is supported.'),
  })
);

export const caseCommentOutputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    comment_id: z.string().optional().describe('The id of the created case comment.'),
    message: z.string(),
  })
);

export const caseCommentStepCommonDefinition: BaseStepDefinition<
  typeof caseCommentInputSchema,
  typeof caseCommentOutputSchema
> = {
  id: CaseCommentStepId,
  category: StepCategory.KibanaSecurity,
  label: i18n.translate('xpack.securitySolution.workflows.steps.caseComment.label', {
    defaultMessage: 'Add case comment (prototype)',
  }),
  description: i18n.translate('xpack.securitySolution.workflows.steps.caseComment.description', {
    defaultMessage:
      'Adds a user comment to a case. Used to carry detonation evidence into the case timeline.',
  }),
  inputSchema: caseCommentInputSchema,
  outputSchema: caseCommentOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.caseComment.documentation.details',
      {
        defaultMessage:
          'Prototype step. Posts one user comment to the case identified by `case_id` through the Cases API. It does not attach alerts, create cases, or change case status.',
      }
    ),
    examples: [
      `## Carry a detonation verdict into the case the alert belongs to
\`\`\`yaml
- name: case_comment
  type: ${CaseCommentStepId}
  with:
    case_id: "{{ variables.case_id }}"
    comment: "Detonation verdict: {{ steps.verdict.output.verdict }} — {{ steps.verdict.output.evidence }}"
\`\`\``,
    ],
  },
};

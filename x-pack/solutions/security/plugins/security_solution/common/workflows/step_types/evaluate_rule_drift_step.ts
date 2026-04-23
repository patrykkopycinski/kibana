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

export const evaluateRuleDriftInputSchema = z.object({
  rule_id: z.string().min(1).describe('kibana.alert.rule.uuid of the detection rule'),
  window_hours: z
    .number()
    .int()
    .min(1)
    .max(168)
    .default(24)
    .describe('Lookback window in hours (max 168 — 7 days)'),
  fp_threshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.3)
    .describe('Maximum acceptable false-positive rate (closed as false_positive / total alerts)'),
});

export const evaluateRuleDriftOutputSchema = z.object({
  drift_score: z.number().min(0).max(1),
  fp_rate: z.number(),
  fn_indicators: z.number(),
  verdict: z.enum(['pass', 'warn', 'fail']),
  details: z.object({
    hourly_alerts: z.array(z.object({ key: z.string(), doc_count: z.number() })),
    baseline_rate: z.number(),
    trend: z.number(),
  }),
});

export const evaluateRuleDriftStepCommonDefinition: BaseStepDefinition<
  typeof evaluateRuleDriftInputSchema,
  typeof evaluateRuleDriftOutputSchema
> = {
  id: 'security.evaluateRuleDrift',
  label: i18n.translate('xpack.securitySolution.workflows.steps.evaluateRuleDrift.label', {
    defaultMessage: 'Evaluate rule drift',
  }),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.evaluateRuleDrift.description',
    {
      defaultMessage:
        'Compare detection alert volume and closure outcomes for a rule against the prior window to estimate drift, false-positive rate, and a pass / warn / fail verdict.',
    }
  ),
  category: StepCategory.Kibana,
  stability: 'tech_preview',
  inputSchema: evaluateRuleDriftInputSchema,
  outputSchema: evaluateRuleDriftOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.evaluateRuleDrift.documentation.details',
      {
        defaultMessage:
          'Runs Elasticsearch aggregations on .alerts-security.alerts-* for the rule UUID: hourly volume for the current window, the same for the baseline window immediately before it, false-positive rate from workflow status closures, and heuristic drift / anomaly indicators.',
      }
    ),
    examples: [
      `## Check drift for the last day
\`\`\`yaml
- name: rule_drift
  type: security.evaluateRuleDrift
  with:
    rule_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    window_hours: 24
    fp_threshold: 0.3
\`\`\``,
    ],
  },
};

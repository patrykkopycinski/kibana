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

export const shadowExecuteRuleInputSchema = z.object({
  rule_query: z.string().describe('The detection rule query to shadow-execute'),
  rule_type: z.enum(['kql', 'eql', 'esql']).default('kql'),
  index_patterns: z.array(z.string()).default(['logs-*']),
  time_window: z.string().default('24h'),
  max_hits_per_hour_threshold: z
    .number()
    .default(50)
    .describe('Fail the step when estimated hits per hour exceed this value'),
});

export const shadowExecuteRuleOutputSchema = z.object({
  total_hits: z.number(),
  hits_per_hour: z.number(),
  verdict: z.enum(['pass', 'fail']),
  reason: z.string(),
  histogram: z
    .array(
      z.object({
        key: z.string(),
        doc_count: z.number(),
      })
    )
    .optional(),
});

export const shadowExecuteRuleStepCommonDefinition: BaseStepDefinition<
  typeof shadowExecuteRuleInputSchema,
  typeof shadowExecuteRuleOutputSchema
> = {
  id: 'security.shadowExecuteRule',
  label: i18n.translate('xpack.securitySolution.workflows.steps.shadowExecuteRule.label', {
    defaultMessage: 'Shadow Execute Rule',
  }),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.shadowExecuteRule.description',
    {
      defaultMessage:
        'Shadow-execute a draft detection rule against live-backed indices without creating alerts. Returns volume metrics, an hourly histogram when using KQL, and a pass or fail verdict against a hits-per-hour threshold.',
    }
  ),
  category: StepCategory.Kibana,
  stability: 'tech_preview',
  inputSchema: shadowExecuteRuleInputSchema,
  outputSchema: shadowExecuteRuleOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.shadowExecuteRule.documentation.details',
      {
        defaultMessage:
          'Evaluates the rule query over the requested indices and recent time window, estimates hits per hour, optionally buckets matches per hour for KQL queries, and fails when throughput exceeds max_hits_per_hour_threshold. No alerting artifacts are written.',
      }
    ),
    examples: [
      `## Shadow-execute a KQL rule
\`\`\`yaml
- name: shadow_execute_rule
  type: security.shadowExecuteRule
  with:
    rule_query: 'event.kind: event and event.type: start'
    rule_type: kql
    index_patterns:
      - 'logs-*'
    time_window: '24h'
    max_hits_per_hour_threshold: 50
\`\`\``,
    ],
  },
};

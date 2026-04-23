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

export const backtestRuleInputSchema = z.object({
  query: z.string().describe('The KQL, EQL, or ES|QL query to evaluate against historical data'),
  query_type: z.enum(['kql', 'eql', 'esql']).default('kql'),
  index_patterns: z.array(z.string()).default(['logs-*', '.alerts-security.alerts-*']),
  time_window: z
    .string()
    .default('7d')
    .describe('Lookback window (e.g. 7d, 24h, 30m) parsed relative to execution time'),
  severity_threshold: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

export const backtestRuleOutputSchema = z.object({
  total_hits: z.number(),
  hits_per_hour: z.number(),
  estimated_fp_rate: z.number(),
  verdict: z.enum(['pass', 'fail', 'warn']),
  sample_hits: z
    .array(
      z.object({
        _id: z.string(),
        _index: z.string(),
        timestamp: z.string().optional(),
      })
    )
    .optional(),
  time_range: z.object({ gte: z.string(), lte: z.string() }),
});

export const backtestRuleStepCommonDefinition: BaseStepDefinition<
  typeof backtestRuleInputSchema,
  typeof backtestRuleOutputSchema
> = {
  id: 'security.backtestRule',
  label: i18n.translate('xpack.securitySolution.workflows.steps.backtestRule.label', {
    defaultMessage: 'Backtest Rule',
  }),
  description: i18n.translate('xpack.securitySolution.workflows.steps.backtestRule.description', {
    defaultMessage:
      'Backtest a draft detection rule query against historical data to estimate hit volume, a benign-proxy false-positive rate, and an overall pass, warn, or fail verdict.',
  }),
  category: StepCategory.Kibana,
  stability: 'tech_preview',
  inputSchema: backtestRuleInputSchema,
  outputSchema: backtestRuleOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.backtestRule.documentation.details',
      {
        defaultMessage:
          'Runs the supplied query over the configured indices and time window, computes total matches and hits per hour, estimates a false-positive ratio using a lightweight benign-event heuristic (subset of hits matching common success or allowed-style outcomes), samples a few documents, and assigns verdict pass when volume and FP ratio stay under conservative thresholds.',
      }
    ),
    examples: [
      `## Backtest a KQL rule
\`\`\`yaml
- name: backtest_rule
  type: security.backtestRule
  with:
    query: 'host.name: "srv-01" and event.category: "process"'
    query_type: kql
    index_patterns:
      - 'logs-*'
    time_window: '7d'
\`\`\``,
    ],
  },
};

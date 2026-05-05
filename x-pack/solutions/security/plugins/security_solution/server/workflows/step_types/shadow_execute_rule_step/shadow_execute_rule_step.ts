/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { i18n } from '@kbn/i18n';
import {
  shadowExecuteRuleInputSchema,
  shadowExecuteRuleStepCommonDefinition,
} from '../../../../common/workflows/step_types/shadow_execute_rule_step/shadow_execute_rule_step_common';
import {
  buildTimestampRangeFilter,
  computeRelativeTimeRange,
  countHitsEql,
  countHitsEsql,
  countHitsKql,
  hourlyHistogramKql,
} from '../shared/rule_query_execution_utils';

export { shadowExecuteRuleInputSchema };

export const shadowExecuteRuleStepDefinition = createServerStepDefinition({
  ...shadowExecuteRuleStepCommonDefinition,
  handler: async (context) => {
    try {
      const { rule_query, rule_type, index_patterns, time_window, max_hits_per_hour_threshold } =
        context.input;
      const esClient = context.contextManager.getScopedEsClient();
      const { gte, lte, ms } = computeRelativeTimeRange(time_window);
      const timeFilter = buildTimestampRangeFilter(gte, lte);
      const hoursInWindow = Math.max(ms / (60 * 60 * 1000), 1 / 60);

      let totalHits = 0;
      let histogram: Array<{ key: string; doc_count: number }> | undefined;

      if (rule_type === 'kql') {
        const { total } = await countHitsKql({
          esClient,
          indices: index_patterns,
          kql: rule_query,
          timeFilter,
        });
        totalHits = total;
        histogram = await hourlyHistogramKql({
          esClient,
          indices: index_patterns,
          kql: rule_query,
          timeFilter,
        });
      } else if (rule_type === 'eql') {
        const { total } = await countHitsEql({
          esClient,
          indices: index_patterns,
          eql: rule_query,
          timeFilter,
        });
        totalHits = total;
        histogram = undefined;
      } else {
        const { total } = await countHitsEsql({
          esClient,
          indices: index_patterns,
          esql: rule_query,
          timeFilter,
        });
        totalHits = total;
        histogram = undefined;
      }

      const hitsPerHour = totalHits / hoursInWindow;
      const passes = hitsPerHour <= max_hits_per_hour_threshold;
      const verdict: 'pass' | 'fail' = passes ? 'pass' : 'fail';
      const reason = passes
        ? i18n.translate('xpack.securitySolution.workflows.steps.shadowExecuteRule.reasonPass', {
            defaultMessage:
              'Shadow execution volume is within the configured threshold ({hitsPerHour} hits/hour, limit {threshold}).',
            values: {
              hitsPerHour: Math.round(hitsPerHour * 100) / 100,
              threshold: max_hits_per_hour_threshold,
            },
          })
        : i18n.translate('xpack.securitySolution.workflows.steps.shadowExecuteRule.reasonFail', {
            defaultMessage:
              'Shadow execution exceeded the hits-per-hour threshold ({hitsPerHour} > {threshold}).',
            values: {
              hitsPerHour: Math.round(hitsPerHour * 100) / 100,
              threshold: max_hits_per_hour_threshold,
            },
          });

      return {
        output: {
          total_hits: totalHits,
          hits_per_hour: hitsPerHour,
          verdict,
          reason,
          histogram,
        },
      };
    } catch (error) {
      context.logger.error(
        i18n.translate('xpack.securitySolution.workflows.steps.shadowExecuteRule.errorLog', {
          defaultMessage: 'Failed to shadow-execute rule',
        }),
        error
      );
      return {
        error: new Error(error instanceof Error ? error.message : 'Failed to shadow-execute rule'),
      };
    }
  },
});

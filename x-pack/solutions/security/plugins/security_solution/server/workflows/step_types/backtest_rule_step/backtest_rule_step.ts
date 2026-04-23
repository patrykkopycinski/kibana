/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { i18n } from '@kbn/i18n';
import {
  backtestRuleInputSchema,
  backtestRuleStepCommonDefinition,
} from '../../../../common/workflows/step_types/backtest_rule_step/backtest_rule_step_common';
import {
  buildTimestampRangeFilter,
  computeRelativeTimeRange,
  countBenignSubsetEql,
  countBenignSubsetKql,
  countHitsEql,
  countHitsEsql,
  countHitsKql,
  mapEqlSampleEvents,
  mapSampleHits,
} from '../shared/rule_query_execution_utils';

export { backtestRuleInputSchema };

const resolveVerdict = (hitsPerHour: number, estimatedFpRate: number): 'pass' | 'warn' | 'fail' => {
  const passVolume = hitsPerHour < 50;
  const passFp = estimatedFpRate < 0.3;
  if (passVolume && passFp) {
    return 'pass';
  }
  if ((!passVolume && !passFp) || hitsPerHour >= 100 || estimatedFpRate >= 0.5) {
    return 'fail';
  }
  return 'warn';
};

export const backtestRuleStepDefinition = createServerStepDefinition({
  ...backtestRuleStepCommonDefinition,
  handler: async (context) => {
    try {
      const { query, query_type, index_patterns, time_window, severity_threshold } = context.input;
      void severity_threshold;
      const esClient = context.contextManager.getScopedEsClient();
      const { gte, lte, ms } = computeRelativeTimeRange(time_window);
      const timeFilter = buildTimestampRangeFilter(gte, lte);
      const hoursInWindow = Math.max(ms / (60 * 60 * 1000), 1 / 60);

      let totalHits = 0;
      let sampleHits: Array<{ _id: string; _index: string; timestamp?: string }> | undefined;
      let benignHits = 0;

      if (query_type === 'kql') {
        const { total, hits } = await countHitsKql({
          esClient,
          indices: index_patterns,
          kql: query,
          timeFilter,
        });
        totalHits = total;
        sampleHits = mapSampleHits(hits);
        benignHits = await countBenignSubsetKql({
          esClient,
          indices: index_patterns,
          kql: query,
          timeFilter,
        });
      } else if (query_type === 'eql') {
        const { total, events } = await countHitsEql({
          esClient,
          indices: index_patterns,
          eql: query,
          timeFilter,
        });
        totalHits = total;
        sampleHits = mapEqlSampleEvents(events);
        benignHits = await countBenignSubsetEql({
          esClient,
          indices: index_patterns,
          eql: query,
          timeFilter,
        });
      } else {
        const { total } = await countHitsEsql({
          esClient,
          indices: index_patterns,
          esql: query,
          timeFilter,
        });
        totalHits = total;
        sampleHits = undefined;
        benignHits = 0;
      }

      const hitsPerHour = totalHits / hoursInWindow;
      const estimatedFpRate = totalHits > 0 ? Math.min(1, benignHits / totalHits) : 0;
      const verdict = resolveVerdict(hitsPerHour, estimatedFpRate);

      return {
        output: {
          total_hits: totalHits,
          hits_per_hour: hitsPerHour,
          estimated_fp_rate: estimatedFpRate,
          verdict,
          sample_hits: sampleHits,
          time_range: { gte, lte },
        },
      };
    } catch (error) {
      context.logger.error(
        i18n.translate('xpack.securitySolution.workflows.steps.backtestRule.errorLog', {
          defaultMessage: 'Failed to backtest rule query',
        }),
        error
      );
      return {
        error: new Error(error instanceof Error ? error.message : 'Failed to backtest rule query'),
      };
    }
  },
});

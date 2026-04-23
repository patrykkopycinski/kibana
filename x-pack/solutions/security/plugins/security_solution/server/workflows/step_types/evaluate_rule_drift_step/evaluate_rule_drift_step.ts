/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch/lib/api/types';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import {
  ALERT_RULE_UUID,
  ALERT_WORKFLOW_REASON,
  ALERT_WORKFLOW_STATUS,
} from '@kbn/rule-data-utils';
import { i18n } from '@kbn/i18n';
import {
  evaluateRuleDriftInputSchema,
  evaluateRuleDriftStepCommonDefinition,
} from '../../../../common/workflows/step_types/evaluate_rule_drift_step';

export { evaluateRuleDriftInputSchema };

const ALERT_INDICES = ['.alerts-security.alerts-*'] as const;
const TIMESTAMP_FIELD = '@timestamp';

const ruleScope = (ruleId: string): estypes.QueryDslQueryContainer => ({
  bool: {
    filter: [{ term: { [ALERT_RULE_UUID]: ruleId } }],
  },
});

const timeRange = (gte: string, lte: string): estypes.QueryDslQueryContainer => ({
  range: {
    [TIMESTAMP_FIELD]: {
      gte,
      lte,
      format: 'strict_date_optional_time',
    },
  },
});

const driftVerdict = (params: {
  driftScore: number;
  fpRate: number;
  fpThreshold: number;
}): 'pass' | 'warn' | 'fail' => {
  if (params.fpRate > params.fpThreshold || params.driftScore >= 0.75) {
    return 'fail';
  }
  if (params.driftScore >= 0.4 || params.fpRate > params.fpThreshold * 0.7) {
    return 'warn';
  }
  return 'pass';
};

export const evaluateRuleDriftStepDefinition = createServerStepDefinition({
  ...evaluateRuleDriftStepCommonDefinition,
  handler: async (context) => {
    try {
      const { rule_id: ruleId, window_hours: windowHours, fp_threshold: fpThreshold } =
        context.input;
      const esClient = context.contextManager.getScopedEsClient();
      const windowMs = windowHours * 60 * 60 * 1000;
      const lte = Date.now();
      const currentGte = lte - windowMs;
      const baselineLte = currentGte;
      const baselineGte = baselineLte - windowMs;

      const currentRange = timeRange(new Date(currentGte).toISOString(), new Date(lte).toISOString());
      const baselineRange = timeRange(
        new Date(baselineGte).toISOString(),
        new Date(baselineLte).toISOString()
      );

      const histAgg = {
        by_hour: {
          date_histogram: {
            field: TIMESTAMP_FIELD,
            fixed_interval: '1h',
            min_doc_count: 0,
          },
        },
      } as const;

      const [currentRes, baselineRes, fpRes] = await Promise.all([
        esClient.search({
          index: ALERT_INDICES,
          ignore_unavailable: true,
          allow_no_indices: true,
          size: 0,
          track_total_hits: true,
          query: {
            bool: {
              filter: [currentRange, ruleScope(ruleId)],
            },
          },
          aggs: histAgg,
        }),
        esClient.search({
          index: ALERT_INDICES,
          ignore_unavailable: true,
          allow_no_indices: true,
          size: 0,
          track_total_hits: true,
          query: {
            bool: {
              filter: [baselineRange, ruleScope(ruleId)],
            },
          },
          aggs: histAgg,
        }),
        esClient.search({
          index: ALERT_INDICES,
          ignore_unavailable: true,
          allow_no_indices: true,
          size: 0,
          track_total_hits: true,
          query: {
            bool: {
              filter: [
                currentRange,
                ruleScope(ruleId),
                { term: { [ALERT_WORKFLOW_STATUS]: 'closed' } },
                { term: { [ALERT_WORKFLOW_REASON]: 'false_positive' } },
              ],
            },
          },
        }),
      ]);

      const currentTotal =
        typeof currentRes.hits.total === 'number'
          ? currentRes.hits.total
          : currentRes.hits.total?.value ?? 0;
      const baselineTotal =
        typeof baselineRes.hits.total === 'number'
          ? baselineRes.hits.total
          : baselineRes.hits.total?.value ?? 0;
      const fpTotal =
        typeof fpRes.hits.total === 'number' ? fpRes.hits.total : fpRes.hits.total?.value ?? 0;

      const fpRate = currentTotal > 0 ? fpTotal / currentTotal : 0;

      const currentBuckets = (
        currentRes.aggregations?.by_hour as
          | { buckets?: Array<{ key: number; key_as_string?: string; doc_count: number }> }
          | undefined
      )?.buckets;
      const baselineBuckets = (
        baselineRes.aggregations?.by_hour as
          | { buckets?: Array<{ key: number; key_as_string?: string; doc_count: number }> }
          | undefined
      )?.buckets;

      const hourlyAlerts = (currentBuckets ?? []).map((b) => ({
        key: b.key_as_string ?? new Date(b.key).toISOString(),
        doc_count: b.doc_count,
      }));

      const baselineRate = baselineTotal / Math.max(windowHours, 1e-6);
      const currentRate = currentTotal / Math.max(windowHours, 1e-6);
      const trend =
        baselineTotal > 0 ? (currentTotal - baselineTotal) / baselineTotal : currentTotal > 0 ? 1 : 0;

      const baselineHourlyCounts = (baselineBuckets ?? []).map((b) => b.doc_count);
      const baselineAvg =
        baselineHourlyCounts.length > 0
          ? baselineHourlyCounts.reduce((a, b) => a + b, 0) / baselineHourlyCounts.length
          : 0;
      const baselineMax = baselineHourlyCounts.length > 0 ? Math.max(...baselineHourlyCounts) : 0;

      let fnIndicators = 0;
      if (currentTotal < baselineTotal * 0.5 && baselineTotal >= 5) {
        fnIndicators += 1;
      }
      if (fpRate > fpThreshold) {
        fnIndicators += 1;
      }
      const maxHourly = hourlyAlerts.length > 0 ? Math.max(...hourlyAlerts.map((h) => h.doc_count)) : 0;
      if (baselineAvg > 0 && maxHourly > baselineAvg * 3) {
        fnIndicators += 1;
      }
      if (baselineMax > 0 && maxHourly > baselineMax * 3) {
        fnIndicators += 1;
      }

      const volumeDrift = Math.min(1, Math.abs(trend));
      const fpComponent = fpThreshold > 0 ? Math.min(1, fpRate / fpThreshold) : fpRate > 0 ? 1 : 0;
      const driftScore = Math.min(1, volumeDrift * 0.55 + fpComponent * 0.45);

      const verdict = driftVerdict({ driftScore, fpRate, fpThreshold });

      return {
        output: {
          drift_score: driftScore,
          fp_rate: fpRate,
          fn_indicators: fnIndicators,
          verdict,
          details: {
            hourly_alerts: hourlyAlerts,
            baseline_rate: baselineRate,
            trend,
          },
        },
      };
    } catch (error) {
      context.logger.error(
        i18n.translate('xpack.securitySolution.workflows.steps.evaluateRuleDrift.errorLog', {
          defaultMessage: 'Failed to evaluate rule drift',
        }),
        error instanceof Error ? error : new Error(String(error))
      );
      return {
        error: new Error(error instanceof Error ? error.message : 'Failed to evaluate rule drift'),
      };
    }
  },
});

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import { buildEsQuery } from '@kbn/es-query';
import { ARGUS_SOC_INDICES } from '@kbn/argus-console-common';
import { SECURITY_SOLUTION_RULE_TYPE_IDS, SIGNALS_ID } from '@kbn/securitysolution-rules';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import type { estypes } from '@elastic/elasticsearch';
import { i18n } from '@kbn/i18n';
import {
  syncDetectionCorpusInputSchema,
  syncDetectionCorpusStepCommonDefinition,
} from '../../../../common/workflows/step_types/sync_detection_corpus_step/sync_detection_corpus_step_common';

export { syncDetectionCorpusInputSchema };

const SIEM_RULE_TYPE_IDS = [SIGNALS_ID, ...SECURITY_SOLUTION_RULE_TYPE_IDS];

const esQueryConfig = {
  allowLeadingWildcards: true,
  queryStringOptions: { analyze_wildcard: true },
  ignoreFilterIfFieldNotInIndex: true,
  dateFormatTZ: 'Zulu',
} as const;

const collectMitreTechniqueIds = (threat: unknown): string[] => {
  const out: string[] = [];
  if (!Array.isArray(threat)) {
    return out;
  }
  for (const block of threat) {
    if (block && typeof block === 'object') {
      const techniques = (block as { technique?: unknown[] }).technique;
      if (Array.isArray(techniques)) {
        for (const tech of techniques) {
          if (tech && typeof tech === 'object') {
            const id = (tech as { id?: string }).id;
            if (id) {
              out.push(id);
            }
            const subs = (tech as { subtechnique?: Array<{ id?: string }> }).subtechnique;
            if (Array.isArray(subs)) {
              for (const s of subs) {
                if (s?.id) {
                  out.push(s.id);
                }
              }
            }
          }
        }
      }
    }
  }
  return out;
};

interface RuleSource {
  type?: string;
  alert?: {
    name?: string;
    enabled?: boolean;
    tags?: string[];
    alertTypeId?: string;
    params?: Record<string, unknown>;
  };
}

export const syncDetectionCorpusStepDefinition = createServerStepDefinition({
  ...syncDetectionCorpusStepCommonDefinition,
  handler: async (context) => {
    const errors: string[] = [];
    let skippedCount = 0;

    try {
      const { max_rules, filter } = context.input;
      const esClient = context.contextManager.getScopedEsClient();

      const baseMust: estypes.QueryDslQueryContainer[] = [
        { term: { type: 'alert' } },
        { term: { 'alert.enabled': true } },
        {
          terms: {
            'alert.consumer': ['siem', 'securitySolution'],
          },
        },
        {
          terms: {
            'alert.alertTypeId': SIEM_RULE_TYPE_IDS,
          },
        },
      ];

      if (filter && filter.trim().length > 0) {
        const kqlDsl = buildEsQuery(
          { title: ALERTING_CASES_SAVED_OBJECT_INDEX, fields: [] },
          { query: filter, language: 'kuery' },
          [],
          esQueryConfig
        );
        baseMust.push(kqlDsl);
      }

      const searchRes = await esClient.search<RuleSource>({
        index: ALERTING_CASES_SAVED_OBJECT_INDEX,
        ignore_unavailable: true,
        expand_wildcards: ['open', 'hidden'],
        size: max_rules,
        track_total_hits: false,
        query: {
          bool: {
            must: baseMust,
          },
        },
      });

      const hits = searchRes.hits.hits;
      const bulkOperations: Array<Record<string, unknown>> = [];
      const syncedAt = new Date().toISOString();

      for (const hit of hits) {
        const src = hit._source;
        const alert = src?.alert;
        const params = alert?.params ?? {};
        const ruleId =
          (typeof params.ruleId === 'string' && params.ruleId) ||
          (hit._id ? hit._id.replace(/^alert:/, '') : '');
        if (ruleId) {
          const name = typeof alert?.name === 'string' ? alert.name : '';
          const description = typeof params.description === 'string' ? params.description : '';
          const ruleType = typeof alert?.alertTypeId === 'string' ? alert.alertTypeId : '';
          const severity = typeof params.severity === 'string' ? params.severity : '';
          const tags = Array.isArray(alert?.tags) ? alert.tags : [];
          const threat = params.threat;
          const indexPatterns = Array.isArray(params.index)
            ? (params.index as string[])
            : typeof params.index === 'string'
            ? [params.index]
            : [];

          const doc = {
            rule_id: ruleId,
            name,
            description,
            type: ruleType,
            severity,
            tags,
            threat,
            index_patterns: indexPatterns,
            mitre_technique: collectMitreTechniqueIds(threat),
            source: 'live_sync',
            synced_at: syncedAt,
          };

          bulkOperations.push({
            index: {
              _index: ARGUS_SOC_INDICES.detectionCorpus,
              _id: `live_sync:${ruleId}`,
            },
          });
          bulkOperations.push(doc);
        } else {
          skippedCount += 1;
        }
      }

      let syncedCount = 0;
      if (bulkOperations.length > 0) {
        const bulkRes = await esClient.bulk({
          refresh: false,
          operations: bulkOperations,
        });
        for (const item of bulkRes.items ?? []) {
          const op = item.index;
          if (op?.error) {
            errors.push(`${op.error.type ?? 'bulk_error'}: ${op.error.reason ?? 'unknown'}`);
          } else if (op?.status !== undefined && op.status < 300) {
            syncedCount += 1;
          }
        }
      }

      return {
        output: {
          synced_count: syncedCount,
          skipped_count: skippedCount,
          errors,
        },
      };
    } catch (error) {
      context.logger.error(
        i18n.translate('xpack.securitySolution.workflows.steps.syncDetectionCorpus.errorLog', {
          defaultMessage: 'Failed to sync detection corpus',
        }),
        error
      );
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        error: new Error(
          error instanceof Error ? error.message : 'Failed to sync detection corpus'
        ),
      };
    }
  },
});

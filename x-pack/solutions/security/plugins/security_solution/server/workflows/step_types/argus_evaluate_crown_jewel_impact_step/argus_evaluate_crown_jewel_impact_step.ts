/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { ARGUS_SOC_INDICES } from '@kbn/argus-console-common';

import {
  argusEvaluateCrownJewelImpactInputSchema,
  argusEvaluateCrownJewelImpactStepCommonDefinition,
} from '../../../../common/workflows/step_types/argus_evaluate_crown_jewel_impact_step';
import {
  evaluateCrownJewelImpact,
  type MutationTargets,
} from '../../../lib/argus/governance/crown_jewel_impact';
import {
  CrownJewelDocSchema,
  type SocCrownJewelDocument,
} from '../../../lib/argus/synthesis/contracts';

export { argusEvaluateCrownJewelImpactInputSchema };

/**
 * Load the most-recent `.soc-crown-jewels` documents and return the ones
 * that pass Zod validation. Bad documents are dropped (logged at debug)
 * rather than throwing — the gate must never crash an applier tick because
 * one operator-curated row drifted.
 */
const loadCrownJewels = async (
  esClient: ElasticsearchClient,
  size: number,
  logger: Logger
): Promise<readonly SocCrownJewelDocument[]> => {
  try {
    const response = await esClient.search<SocCrownJewelDocument>({
      index: ARGUS_SOC_INDICES.crownJewels,
      ignore_unavailable: true,
      size,
      sort: [{ '@timestamp': { order: 'desc' } }],
    });

    const validated: SocCrownJewelDocument[] = [];
    for (const hit of response.hits.hits) {
      if (!hit._source) {
        // Skip hits that came back without `_source` (rare; typically only
        // happens when the caller filters fields). The validator chain
        // below requires the full doc, so there's nothing to do.
      } else {
        const parsed = CrownJewelDocSchema.safeParse(hit._source);
        if (parsed.success) {
          validated.push(parsed.data);
        } else {
          logger.debug(
            `[argus-evaluate-crown-jewel-impact-step] skipping invalid crown-jewel doc id=${
              hit._id
            }: ${parsed.error.issues.map((i) => `${i.path.join('.')}=${i.message}`).join('; ')}`
          );
        }
      }
    }
    return validated;
  } catch (err) {
    // Empty index or missing index_pattern is fine — degrade to "no jewels"
    // so the gate trivially returns `proceed` rather than failing the
    // applier tick. Real network errors fall through to the catch in the
    // step handler.
    const reason = err instanceof Error ? err.message : String(err);
    logger.debug(
      `[argus-evaluate-crown-jewel-impact-step] crown-jewels search failed (treating as empty): ${reason}`
    );
    return [];
  }
};

/**
 * Coerce the input shape into the helper's expected `MutationTargets` shape.
 * Workflows often pass `null` or an empty array when the upstream Liquid
 * extraction had nothing to dereference; we normalise both away.
 */
const normaliseTargets = (
  raw: ReturnType<typeof argusEvaluateCrownJewelImpactInputSchema.parse>['targets']
): MutationTargets => {
  const stringArray = (arr: readonly string[] | undefined): readonly string[] | undefined => {
    if (!arr || arr.length === 0) return undefined;
    return arr;
  };
  return {
    host_names: stringArray(raw.host_names),
    host_ips: stringArray(raw.host_ips),
    user_names: stringArray(raw.user_names),
    user_ids: stringArray(raw.user_ids),
    service_names: stringArray(raw.service_names),
    index_patterns: stringArray(raw.index_patterns),
    tags: stringArray(raw.tags),
  };
};

export const argusEvaluateCrownJewelImpactStepDefinition = createServerStepDefinition({
  ...argusEvaluateCrownJewelImpactStepCommonDefinition,
  handler: async (context) => {
    const {
      rec_id: recId,
      caller_id: callerId,
      targets: rawTargets,
      jewels_size: jewelsSize,
    } = context.input;
    const logger = context.logger as Logger;

    try {
      const esClient = context.contextManager.getScopedEsClient();
      const jewels = await loadCrownJewels(esClient, jewelsSize, logger);
      const targets = normaliseTargets(rawTargets);
      const assessment = evaluateCrownJewelImpact(targets, jewels);

      // Augment the assessment's reason with the caller / rec_id so audit
      // rows can be searched by either axis without re-correlating.
      const reason = `${assessment.reason} (caller=${callerId}, rec_id=${recId}, jewels_loaded=${jewels.length})`;

      return {
        output: {
          rec_id: recId,
          recommended_action: assessment.recommended_action,
          max_tier: assessment.max_tier,
          crown_match: assessment.crown_match,
          affected_count: assessment.affected_count,
          affected: assessment.affected.map((a) => ({
            asset_id: a.asset_id,
            asset_type: a.asset_type,
            tier: a.tier,
            owner: a.owner,
            name: a.name,
            matched_kind: a.matched_kind,
            matched_value: a.matched_value,
            gate_active: a.gate_active,
          })),
          reason,
          jewels_loaded: jewels.length,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Crown-jewel gate failed for rec_id=${recId}`;
      logger.error(
        `[argus-evaluate-crown-jewel-impact-step] gate failed for rec_id=${recId}: ${message}`
      );
      return {
        error: new Error(message),
      };
    }
  },
});

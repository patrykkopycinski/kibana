/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType, ToolResultType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/logging';
import { ARGUS_SOC_INDICES } from '@kbn/argus-console-common';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../plugin_contract';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import { ARGUS_FILE_MUTATION_INTENT_TOOL_ID } from './constants';

/**
 * Input contract for the ARGUS file_mutation_intent tool.
 *
 * All origins funnel through the envelope validator ingest pipeline, so we
 * keep the zod schema deliberately narrow — the tool is a thin, auditable
 * wrapper around a single ES index, not an arbitrary recommendations poker.
 */
const fileMutationIntentSchema = z.object({
  origin: z
    .enum(['gap_analysis', 'consolidation', 'cti_ingest', 'pattern_seed', 'manual'])
    .describe(
      'Channel this intent came from. Determines downstream routing and audit log grouping.'
    ),
  rule_id: z
    .string()
    .min(1)
    .describe('Stable artifact id the proposed rule will be written under (kibana rule UUID).'),
  title: z.string().min(1).describe('Human readable short title for the mutation card.'),
  summary: z
    .string()
    .min(1)
    .describe('One-paragraph rationale — surfaces on the Mutations panel and the flyout.'),
  reason: z
    .string()
    .min(1)
    .describe('Why this change is being proposed. Used by the governance gate as context.'),
  mitre_techniques: z
    .array(z.string().regex(/^T\d{4}(\.\d{3})?$/))
    .min(1)
    .describe('ATT&CK technique ids this proposal covers.'),
  proposed_rule_delta: z
    .object({
      query: z.string().optional(),
      threshold: z.number().optional(),
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    })
    .describe(
      'Minimal rule-delta preview rendered in the Mutation Detail flyout before approval.'
    ),
  advisory_id: z
    .string()
    .optional()
    .describe('Linked CVE / KEV advisory id if origin is cti_ingest. Ignored otherwise.'),
  confidence: z
    .number()
    .min(0)
    .max(100)
    .default(60)
    .describe('Envelope-level confidence on the 0..100 scale.'),
  dry_run: z
    .boolean()
    .default(false)
    .describe('When true, validates the payload but never writes to Elasticsearch.'),
});

export function argusFileMutationIntentTool(
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger
): BuiltinToolDefinition<typeof fileMutationIntentSchema> {
  return {
    id: ARGUS_FILE_MUTATION_INTENT_TOOL_ID,
    type: ToolType.builtin,
    description:
      'File a new ARGUS mutation intent into `.soc-recommendations`. Supported origins: ' +
      'gap_analysis, consolidation, cti_ingest, pattern_seed, manual. Writes an envelope-compliant ' +
      'document and returns the assigned `rec_id`. Set `dry_run: true` to validate without writing.',
    schema: fileMutationIntentSchema,
    tags: ['security', 'argus', 'argus:playbook', 'mutation-intent'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) => getAgentBuilderResourceAvailability({ core, request, logger }),
    },
    handler: async (params, { esClient }) => {
      const recId = `arg-${params.origin}-${Date.now().toString(36)}`;
      const now = new Date().toISOString();

      const doc = {
        '@timestamp': now,
        type: 'mutation_intent' as const,
        schema_version: 2 as const,
        rec_id: recId,
        source: `argus.${params.origin}`,
        status: 'pending' as const,
        track: 'agentic' as const,
        title: params.title,
        summary: params.summary,
        confidence: params.confidence,
        kind: 'rule_create' as const,
        advisory_id: params.advisory_id ?? null,
        evidence: [
          {
            kind: 'mitre',
            detail: params.mitre_techniques.join(', '),
          },
          { kind: 'origin', detail: params.origin },
        ],
        expected_impact: {
          expected_tp_impact: `Address coverage for ${params.mitre_techniques.join(', ')}.`,
          coverage_delta: `+1 rule across ${params.mitre_techniques.length} technique(s)`,
          blast_radius: { hosts: 0, tenants: 1, rules: 1 },
          blast_tier: 'small' as const,
        },
        details: {
          artifact_type: 'rule' as const,
          artifact_id: params.rule_id,
          op: 'create' as const,
          expected_ownership: 'autosoc' as const,
          reason: params.reason,
          patch: params.proposed_rule_delta,
        },
        argus: {
          origin: params.origin,
          decision: { kind: 'rule_create', confidence: params.confidence / 100, door_class: 'two_way' },
          agent: { id: `argus.${params.origin}`, version: '1.0.0' },
          actor: { trust_tier: 'frontier' },
        },
      };

      if (params.dry_run) {
        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                message: `Dry-run OK — would write rec_id=${recId}`,
                dry_run: true,
                rec_id: recId,
                preview: doc,
              },
            },
          ],
        };
      }

      try {
        await esClient.asCurrentUser.index({
          index: ARGUS_SOC_INDICES.recommendations,
          id: recId,
          refresh: 'wait_for',
          document: doc,
        });
      } catch (error) {
        logger.error(
          `argus.file_mutation_intent failed: ${error instanceof Error ? error.message : String(error)}`
        );
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to file mutation intent: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            },
          ],
        };
      }

      return {
        results: [
          {
            type: ToolResultType.other,
            data: {
              message: `Filed mutation intent ${recId} (origin=${params.origin})`,
              rec_id: recId,
              origin: params.origin,
              status: 'pending',
            },
          },
        ],
      };
    },
  };
}

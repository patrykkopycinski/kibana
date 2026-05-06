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

/**
 * Crown-jewel governance gate (B5) — closes vision-doc clause 6.3 and the 12th
 * slot in the autonomous-applier gate cascade.
 *
 * The step takes the affected-target axes that the calling workflow can
 * reliably extract from a mutation intent (index patterns, tags, host names,
 * host IPs, user names/ids, service names) and matches them against the
 * latest `.soc-crown-jewels` snapshot using the same `evaluateCrownJewelImpact`
 * helper that the chat tool and CLI use. The output tells the caller whether
 * the mutation should `proceed` to auto-apply or be routed to `pending_review`,
 * and carries the affected-asset list so the audit row in
 * `.soc-autonomy-decisions` can name which assets triggered the escalation.
 *
 * The step never mutates the recommendation directly — that's the calling
 * workflow's job. Keeping side-effects in the workflow keeps the step
 * idempotent and makes dry-run trivially safe.
 */
export const argusEvaluateCrownJewelImpactInputSchema = z.object({
  rec_id: z
    .string()
    .min(1)
    .describe(
      'Identifier of the mutation intent / recommendation under evaluation. Threaded into the audit reason for traceability.'
    ),
  caller_id: z
    .string()
    .min(1)
    .default('soc_argus_crown_jewel_gate')
    .describe(
      'Tag embedded in the audit reason so you can attribute calls back to the workflow tick that produced them.'
    ),
  targets: z
    .object({
      host_names: z.array(z.string().min(1)).optional(),
      host_ips: z.array(z.string().min(1)).optional(),
      user_names: z.array(z.string().min(1)).optional(),
      user_ids: z.array(z.string().min(1)).optional(),
      service_names: z.array(z.string().min(1)).optional(),
      index_patterns: z.array(z.string().min(1)).optional(),
      tags: z.array(z.string().min(1)).optional(),
    })
    .describe(
      'Affected-target axes extracted from the mutation intent. The gate matches each populated axis against `.soc-crown-jewels.match_patterns[]`. Empty arrays / omitted fields are skipped, not failures.'
    ),
  jewels_size: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(1000)
    .describe(
      'Soft cap on the `.soc-crown-jewels` snapshot size loaded per call. Defaults to 1000, which fits any realistic asset register.'
    ),
});

export const argusEvaluateCrownJewelImpactOutputSchema = z.object({
  rec_id: z.string(),
  recommended_action: z.enum(['proceed', 'pending_review']),
  max_tier: z.enum(['none', 'silver', 'gold', 'platinum', 'crown']),
  crown_match: z.boolean(),
  affected_count: z.number().int().min(0),
  affected: z.array(
    z.object({
      asset_id: z.string(),
      asset_type: z.enum(['host', 'user', 'service', 'data_store', 'group']),
      tier: z.enum(['silver', 'gold', 'platinum', 'crown']),
      owner: z.string(),
      name: z.string(),
      matched_kind: z.enum([
        'host_name',
        'host_ip',
        'host_ip_range',
        'user_name',
        'user_id',
        'service_name',
        'index_pattern',
        'tag',
      ]),
      matched_value: z.string(),
      gate_active: z.boolean(),
    })
  ),
  reason: z.string(),
  jewels_loaded: z.number().int().min(0),
});

export const argusEvaluateCrownJewelImpactStepCommonDefinition: BaseStepDefinition<
  typeof argusEvaluateCrownJewelImpactInputSchema,
  typeof argusEvaluateCrownJewelImpactOutputSchema
> = {
  id: 'security.argusEvaluateCrownJewelImpact',
  label: i18n.translate(
    'xpack.securitySolution.workflows.steps.argusEvaluateCrownJewelImpact.label',
    {
      defaultMessage: 'ARGUS — Evaluate crown-jewel impact',
    }
  ),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.argusEvaluateCrownJewelImpact.description',
    {
      defaultMessage:
        "Match a mutation intent's affected targets against the operator-curated `.soc-crown-jewels` register. Returns `recommended_action: pending_review` when any matched asset is gold/platinum/crown, or silver with `gate_active: true`. Pure read; the calling workflow is responsible for mutating the recommendation status.",
    }
  ),
  category: StepCategory.Kibana,
  stability: 'tech_preview',
  inputSchema: argusEvaluateCrownJewelImpactInputSchema,
  outputSchema: argusEvaluateCrownJewelImpactOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.argusEvaluateCrownJewelImpact.documentation.details',
      {
        defaultMessage:
          'Loads the latest `.soc-crown-jewels` documents (capped via `jewels_size`, default 1000), Zod-validates each, and runs the deterministic `evaluateCrownJewelImpact` helper. Tier escalation: silver with `gate_active: true` -> pending_review; gold/platinum/crown -> always pending_review. Helper supports terms / wildcard / IPv4 CIDR matchers across 8 matcher kinds. Documents that fail Zod validation are skipped (logged at debug) so a single malformed asset row never crashes the gate.',
      }
    ),
    examples: [
      `## Wire into a foreach over pending mutation intents
\`\`\`yaml
- name: evaluate_crown_jewel_impact
  type: security.argusEvaluateCrownJewelImpact
  with:
    rec_id: "{{ foreach.item._source.rec_id }}"
    caller_id: "soc_argus_crown_jewel_gate"
    targets:
      index_patterns: "{{ foreach.item._source.details.proposed_rule_delta.index_pattern }}"
      tags: "{{ foreach.item._source.details.proposed_rule_delta.tags }}"
\`\`\``,
    ],
  },
};

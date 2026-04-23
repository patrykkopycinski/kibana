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

export const resolveEntityContextInputSchema = z.object({
  alert_document: z
    .record(z.string(), z.unknown())
    .describe(
      'Alert or signal document fields; host.name, user.name, and source.ip are read from ECS-shaped or flattened keys'
    ),
});

export const resolveEntityContextOutputSchema = z.object({
  entities: z.array(
    z.object({
      entity_id: z.string(),
      entity_type: z.string(),
      risk_score: z.number(),
      asset_criticality: z.string().nullable().optional(),
      first_seen: z.string().optional(),
      last_activity: z.string().optional(),
      watchlists: z.array(z.string()),
      behaviors: z.array(z.string()),
    })
  ),
});

export const resolveEntityContextStepCommonDefinition: BaseStepDefinition<
  typeof resolveEntityContextInputSchema,
  typeof resolveEntityContextOutputSchema
> = {
  id: 'security.resolveEntityContext',
  label: i18n.translate('xpack.securitySolution.workflows.steps.resolveEntityContext.label', {
    defaultMessage: 'Resolve entity context',
  }),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.resolveEntityContext.description',
    {
      defaultMessage:
        'Resolve Entity Store records for host, user, and IP observables from an alert document, including risk and asset context.',
    }
  ),
  category: StepCategory.Kibana,
  stability: 'tech_preview',
  inputSchema: resolveEntityContextInputSchema,
  outputSchema: resolveEntityContextOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.resolveEntityContext.documentation.details',
      {
        defaultMessage:
          'Queries the Entity Store latest index for identifiers extracted from the alert (host.name, user.name, source.ip), merges normalized fields, and returns risk scores and lifecycle data present on entity documents.',
      }
    ),
    examples: [
      `## Resolve entities for an alert
\`\`\`yaml
- name: resolve_entity_context
  type: security.resolveEntityContext
  with:
    alert_document:
      host.name: "srv-01"
      user.name: "jdoe"
      source.ip: "10.0.0.1"
\`\`\``,
    ],
  },
};

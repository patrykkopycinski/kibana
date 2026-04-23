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
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../plugin_contract';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import { ARGUS_OPEN_INVESTIGATION_TOOL_ID } from './constants';

const openInvestigationSchema = z.object({
  subject_kind: z
    .enum(['alert', 'entity', 'rule', 'rec'])
    .describe('What the investigation anchors on.'),
  subject_id: z.string().min(1).describe('Identifier for the subject (alert._id, entity name, etc).'),
  title: z.string().min(1).describe('Title for the generated case.'),
  note: z
    .string()
    .optional()
    .describe('Opening note attached to the case. Great spot for the playbook rationale.'),
});

/**
 * Opens a case in the Security Solution Cases UI with a deep link anchored on
 * the subject. The skill wrapper uses the returned URL to guide the analyst.
 */
export function argusOpenInvestigationTool(
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger
): BuiltinToolDefinition<typeof openInvestigationSchema> {
  return {
    id: ARGUS_OPEN_INVESTIGATION_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Open a Security Solution investigation case anchored on an alert, entity, rule, or ' +
      'recommendation. Returns the case id and the Kibana-relative URL — playbooks can surface it ' +
      'directly to the analyst.',
    schema: openInvestigationSchema,
    tags: ['security', 'argus', 'argus:playbook', 'cases'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) => getAgentBuilderResourceAvailability({ core, request, logger }),
    },
    handler: async (
      { subject_kind: kind, subject_id: id, title, note },
      { request }
    ) => {
      try {
        const [coreStart, pluginsStart] = await core.getStartServices();
        const casesStart = (pluginsStart as { cases?: { getCasesClientWithRequest?: Function } })
          .cases;

        if (!casesStart?.getCasesClientWithRequest) {
          return {
            results: [
              {
                type: ToolResultType.error,
                data: { message: 'Cases client is not available in this space.' },
              },
            ],
          };
        }

        const client = await casesStart.getCasesClientWithRequest(request);
        const created = await client.cases.create({
          title,
          description: note ?? `Opened via ${ARGUS_OPEN_INVESTIGATION_TOOL_ID}.`,
          tags: ['argus', 'argus:playbook', `argus:subject:${kind}`],
          connector: { id: 'none', name: 'none', type: '.none', fields: null },
          settings: { syncAlerts: false },
          owner: 'securitySolution',
        });

        const basePath = coreStart.http.basePath.get(request);
        const caseUrl = `${basePath}/app/security/cases/${created.id}`;

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                message: `Opened case ${created.id} for ${kind}:${id}`,
                case_id: created.id,
                url: caseUrl,
                subject: { kind, id },
              },
            },
          ],
        };
      } catch (error) {
        logger.error(
          `argus.open_investigation failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to open investigation: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            },
          ],
        };
      }
    },
  };
}

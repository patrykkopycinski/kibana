/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { ToolType, ToolResultType } from '@kbn/agent-builder-common';
import { getToolResultId } from '@kbn/agent-builder-server/tools';

export const CONFIRM_EVIDENCE_RECEIVED_TOOL_ID = 'daybreak-alert-analysis.confirm_evidence_received';

const schema = z.object({
  alertId: z.string().describe('The stable identifier of the alert being triaged.'),
});

export const confirmEvidenceReceivedTool = (): BuiltinSkillBoundedTool => {
  return {
    id: CONFIRM_EVIDENCE_RECEIVED_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Confirm that the alert evidence has been received and is sufficient for triage. ' +
      'Call this tool exactly once before returning the final structured verdict. ' +
      'After calling this tool, return ONLY a JSON object with fields: verdict, confidence, rationale.',
    schema,
    handler: async ({ alertId }) => {
      return {
        results: [
          {
            tool_result_id: getToolResultId(),
            type: ToolResultType.other,
            data: { confirmed: true, alertId },
          },
        ],
      };
    },
  };
};

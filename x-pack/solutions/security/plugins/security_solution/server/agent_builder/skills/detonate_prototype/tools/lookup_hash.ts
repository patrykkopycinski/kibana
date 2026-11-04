/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { z, lazySchema } from '@kbn/zod/v4';
import { ToolResultType, ToolType } from '@kbn/agent-builder-common';
import { getToolResultId } from '@kbn/agent-builder-server/tools';

import { LOOKUP_HASH_TOOL_ID } from '..';
import { lookupPriorRunsInSpace } from '../../../../detonate_prototype/space_scope';
import {
  DETONATE_TOOL_MAX_RESULT_TOKENS,
  detonateServiceErrorResult,
  insufficientPrivilegesResult,
  type DetonateSkillDeps,
} from '../types';

const lookupHashSchema = lazySchema(() =>
  z.object({
    sampleHash: z
      .string()
      .regex(
        /^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/,
        'must be a hex md5, sha1 or sha256'
      )
      .describe(
        'Hash of the sample (sha256, sha1 or md5), exactly as it would be submitted. On an alert this is `file.hash.sha256`.'
      ),
  })
);

/**
 * Answers "has this space already detonated this sample" with the same lookup
 * the triage workflow's first step uses, so the agent and the workflow never
 * disagree about whether a VM needs to be spent.
 */
export const lookupHashTool = ({
  endpointAppContextService,
  getClient,
  hasDetonatePrivilege,
}: DetonateSkillDeps): BuiltinSkillBoundedTool<typeof lookupHashSchema> => ({
  id: LOOKUP_HASH_TOOL_ID,
  type: ToolType.builtin,
  description:
    "Checks whether a sample hash was already detonated in this space and returns the newest completed run's verdict. Call this before submit_detonation: `known-malicious` and any recorded run answer the question without spending a sandbox VM. `unknown` means no malicious run is on record — it is never evidence the sample is benign.",
  schema: lookupHashSchema,
  maxResultTokens: DETONATE_TOOL_MAX_RESULT_TOKENS,
  handler: async ({ sampleHash }, { request }) => {
    if (!(await hasDetonatePrivilege(request, 'read'))) {
      return insufficientPrivilegesResult('Security Solution read or Detonate');
    }

    try {
      const {
        status,
        last_task_id: taskId,
        last_verdict: verdict,
        last_seen: lastSeen,
      } = await lookupPriorRunsInSpace(
        getClient(request),
        sampleHash,
        endpointAppContextService.getActiveSpaceId(request)
      );

      return {
        results: [
          {
            tool_result_id: getToolResultId(),
            type: ToolResultType.other,
            data: {
              kind: 'detonation_prior_run' as const,
              status,
              has_completed_run: taskId !== undefined,
              ...(taskId ? { last_task_id: taskId } : {}),
              ...(verdict ? { last_verdict: verdict } : {}),
              ...(lastSeen ? { last_seen: lastSeen } : {}),
            },
          },
        ],
      };
    } catch (error) {
      return detonateServiceErrorResult(error, 'look up prior detonations');
    }
  },
});

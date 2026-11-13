/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getAgentFromRunContext } from '@kbn/agent-builder-server';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { z, lazySchema } from '@kbn/zod/v4';
import { ToolResultType, ToolType } from '@kbn/agent-builder-common';
import { getToolResultId } from '@kbn/agent-builder-server/tools';

import { DETONATE_VM_OS_FAMILIES } from '../../../../../common/detonate_prototype';
import { SUBMIT_DETONATION_TOOL_ID } from '..';
import { submitInSpace } from '../../../../detonate_prototype/space_scope';
import { assertReadableAlertTags } from '../../../../detonate_prototype/handoffs';
import { DetonateServiceError } from '../../../../detonate_prototype/client';
import { toDetonationRecord } from '../../../../detonate_prototype/detonation_record';
import {
  DETONATE_TOOL_MAX_RESULT_TOKENS,
  detonateErrorResult,
  detonateServiceErrorResult,
  insufficientPrivilegesResult,
  type DetonateSkillDeps,
  MAX_SAMPLE_HASH_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  MIN_SAMPLE_HASH_LENGTH,
  summarizeDetonationTask,
} from '../types';

const submitDetonationSchema = lazySchema(() =>
  z.object({
    sampleHash: z
      .string()
      .min(MIN_SAMPLE_HASH_LENGTH)
      .max(MAX_SAMPLE_HASH_LENGTH)
      .describe(
        'Hash of the sample to detonate (sha256, sha1 or md5). On an alert this is `file.hash.sha256`. The service fetches the sample by hash; it cannot detonate a file that no sample source holds.'
      ),
    tags: z
      .array(z.string().max(MAX_TAG_LENGTH))
      .max(MAX_TAGS)
      .optional()
      .describe('Tags recorded on the run so it can be found again later.'),
    vmOsFamily: z
      .enum(DETONATE_VM_OS_FAMILIES)
      .optional()
      .describe(
        'Operating system of the detonation VM. Set this when the sample only runs on one platform; otherwise omit it and let the service choose.'
      ),
  })
);

/**
 * Starts a detonation. Returns as soon as the run is accepted — detonation
 * takes minutes, so the tool deliberately does not wait; the agent polls with
 * `get_detonation`.
 *
 * This is a write tool: it spends a VM and real detonation time, so the
 * caller's Security Solution write privilege is asserted here rather than
 * relying on the HTTP route's check, which this in-process path bypasses.
 */
export const submitDetonationTool = ({
  endpointAppContextService,
  getClient,
  hasDetonatePrivilege,
  recordRun,
}: DetonateSkillDeps): BuiltinSkillBoundedTool<typeof submitDetonationSchema> => ({
  id: SUBMIT_DETONATION_TOOL_ID,
  type: ToolType.builtin,
  description:
    'Submits a file hash for detonation in an instrumented sandbox VM with Elastic Defend installed, and returns the created task immediately. Detonation takes several minutes: poll with get_detonation until it reports complete. Use when an analyst asks what a file actually does, or wants behavioural evidence for a hash that reputation sources do not resolve.',
  schema: submitDetonationSchema,
  maxResultTokens: DETONATE_TOOL_MAX_RESULT_TOKENS,
  // HITL gate enforced by the framework, not skill prose. `always` (not
  // `once`): every detonation spends a VM on a live-malware run, so each call
  // is confirmed individually rather than blanket-approved for the chat.
  confirmation: {
    askUser: 'always',
    getConfirmation: ({ toolParams }) => ({
      title: 'Submit sample for detonation?',
      message: `This will boot a sandbox VM and run sample \`${toolParams.sampleHash}\` as live malware. The run cannot be cancelled once started.`,
      confirm_text: 'Detonate',
      cancel_text: 'Cancel',
      color: 'danger',
    }),
  },
  handler: async (params, { request, logger, esClient, runContext }) => {
    // A detonation boots a VM and runs live malware. That is a write action in
    // every sense that matters, so it requires the write privilege even though
    // it mutates nothing inside Kibana.
    if (!(await hasDetonatePrivilege(request, 'write'))) {
      return insufficientPrivilegesResult('Security Solution write or Detonate');
    }

    const { sampleHash, tags, vmOsFamily } = params;
    const spaceId = endpointAppContextService.getActiveSpaceId(request);

    try {
      await assertReadableAlertTags({ esClient: esClient.asCurrentUser, spaceId, tags });
    } catch (error) {
      if (error instanceof DetonateServiceError && error.statusCode === 400) {
        return detonateServiceErrorResult(error, `submit sample ${sampleHash} for detonation`);
      }
      logger.error(`Detonate alert tag check failed: ${error}`);
      return detonateErrorResult(
        'unknown_error',
        'Could not check the alert tags against the alerts you can read, so nothing was submitted. Retry later.'
      );
    }

    try {
      const client = getClient(request);
      const task = await submitInSpace(
        (scoped) => client.submitHash(scoped),
        {
          sample_hash: sampleHash,
          ...(tags ? { tags } : {}),
          ...(vmOsFamily ? { vm_os_family: vmOsFamily } : {}),
        },
        spaceId
      );

      logger.info(`Submitted detonation ${task.id} for sample ${sampleHash}`);

      await recordRun(spaceId, () =>
        toDetonationRecord(task, {
          spaceId,
          origin: {
            source: 'agent',
            conversation_id: getAgentFromRunContext(runContext)?.conversationId,
            submitter: endpointAppContextService.getCurrentUsername(request),
          },
        })
      );

      return {
        results: [
          {
            tool_result_id: getToolResultId(),
            type: ToolResultType.other,
            data: { ...summarizeDetonationTask(task), submitted: true },
          },
        ],
      };
    } catch (error) {
      // `submitAttempted` matters: the request reached the service before the
      // throw, so the run may already be going. Re-submitting on this error
      // spends a second VM on the same sample.
      return detonateServiceErrorResult(error, `submit sample ${sampleHash} for detonation`, {
        submitAttempted: true,
      });
    }
  },
});

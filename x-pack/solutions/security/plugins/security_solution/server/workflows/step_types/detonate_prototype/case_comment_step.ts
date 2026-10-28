/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — case-comment step, server implementation.
 *
 * One write: a user comment on the case, through the Cases API the plugin
 * already exposes. The `owner` field is what the Cases API uses to scope
 * comments to the application that created them — Security alerts live in
 * Security-owned cases, so it is fixed here rather than taken as input the
 * caller could use to write into another owner's case.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { SECURITY_SOLUTION_OWNER } from '@kbn/cases-plugin/common';

import { caseCommentStepCommonDefinition } from '../../../../common/workflows/step_types/detonate_prototype/case_comment_step_common';
import { toApiExecutionError } from '../../utils/to_api_execution_error';

export const caseCommentStepDefinition = createServerStepDefinition({
  ...caseCommentStepCommonDefinition,
  handler: async (context) => {
    const { case_id: caseId, comment } = context.input;

    try {
      const { body } = await context.contextManager.callKibanaApi<{
        comments?: Array<{ id?: string }>;
      }>({
        method: 'POST',
        path: `/api/cases/${encodeURIComponent(caseId)}/comments`,
        body: { comment, type: 'user', owner: SECURITY_SOLUTION_OWNER },
      });

      // The Cases API returns the whole updated case; the new comment is the
      // last one. Best-effort only — the write already succeeded.
      const commentId = body?.comments?.[body.comments.length - 1]?.id;

      return {
        output: {
          success: true,
          ...(commentId ? { comment_id: commentId } : {}),
          message: commentId
            ? `Added comment ${commentId} to case ${caseId}`
            : `Added comment to case ${caseId}`,
        },
      };
    } catch (error) {
      throw toApiExecutionError(error, `add comment to case ${caseId}`);
    }
  },
});

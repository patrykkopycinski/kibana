/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';

import {
  DETONATE_TASKS_PATH,
  PROPOSAL_QUIET_STREAK_THRESHOLD,
  deriveDetonateVerdict,
  exceptionProposalComment,
  isDetonationComplete,
  isDetonationFailed,
  quietRunStreak,
} from '../../../../common/detonate_prototype';
import type { DetonateTaskSearchResponse } from '../../../../common/detonate_prototype';
import { detonateRunHistoryStepCommonDefinition } from '../../../../common/workflows/step_types/detonate_prototype/detonate_run_history_step_common';
import { toApiExecutionError } from '../../utils/to_api_execution_error';

/** The tasks route's own page cap. */
const MAX_RUNS = 200;

/**
 * Reads the run history through the plugin's tasks route (same privilege
 * check as the UI's run-history panel) and filters it the same way that panel
 * does: an exact hash match, completed and not failed, newest first.
 */
export const detonateRunHistoryStepDefinition = createServerStepDefinition({
  ...detonateRunHistoryStepCommonDefinition,
  handler: async ({ input, contextManager }) => {
    const { sha256 } = input;

    let page: DetonateTaskSearchResponse;
    try {
      ({ body: page } = await contextManager.callKibanaApi<DetonateTaskSearchResponse>({
        method: 'GET',
        path: `${DETONATE_TASKS_PATH}?query_string=${encodeURIComponent(sha256)}&size=${MAX_RUNS}`,
        headers: { 'elastic-api-version': '1' },
      }));
    } catch (error) {
      throw toApiExecutionError(error, `read detonation history for ${sha256}`);
    }

    // `query_string` is a free-text search, so a run of a different sample
    // can match; only an exact hash counts toward this sample's evidence.
    const completed = page.tasks
      .filter(
        (task) =>
          task.sample_hash === sha256 && isDetonationComplete(task) && !isDetonationFailed(task)
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    const quietStreak = quietRunStreak(completed);

    return {
      output: {
        sha256,
        completed_runs: completed.length,
        quiet_streak: quietStreak,
        proposal_eligible: quietStreak >= PROPOSAL_QUIET_STREAK_THRESHOLD,
        runs: completed.map((task) => ({
          task_id: task.id,
          created_at: task.created_at,
          verdict: deriveDetonateVerdict(task).verdict,
        })),
        evidence_comment: exceptionProposalComment(sha256, completed),
      },
    };
  },
});

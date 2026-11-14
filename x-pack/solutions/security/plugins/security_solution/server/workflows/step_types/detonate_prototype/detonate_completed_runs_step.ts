/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';

import {
  DETONATE_ALERT_OUTCOMES_PATH,
  DETONATE_TASKS_PATH,
  deriveDetonateVerdict,
  deriveDetonationRunStatus,
  parseAlertTag,
} from '../../../../common/detonate_prototype';
import type {
  DetonateAlertOutcomes,
  DetonateTask,
  DetonateTaskSearchResponse,
} from '../../../../common/detonate_prototype';
import { detonateCompletedRunsStepCommonDefinition } from '../../../../common/workflows/step_types/detonate_prototype/detonate_completed_runs_step_common';
import { toApiExecutionError } from '../../utils/to_api_execution_error';

/** The tasks route's own page cap; it also bounds the alert ids one outcomes call carries. */
const MAX_RUNS = 200;

/**
 * The sweep's read half. Lists this space's runs through the plugin's tasks
 * route, keeps the newest completed run per source alert, and drops every
 * alert whose verdict is already recorded. That read goes through the
 * plugin's outcomes route over the results index, so it is space-scoped and
 * privilege-checked like the other plugin routes and never touches the alert
 * documents.
 */
export const detonateCompletedRunsStepDefinition = createServerStepDefinition({
  ...detonateCompletedRunsStepCommonDefinition,
  handler: async ({ input, contextManager }) => {
    const { max_pending: maxPending } = input;

    let page: DetonateTaskSearchResponse;
    try {
      ({ body: page } = await contextManager.callKibanaApi<DetonateTaskSearchResponse>({
        method: 'GET',
        path: `${DETONATE_TASKS_PATH}?size=${MAX_RUNS}`,
        headers: { 'elastic-api-version': '1' },
      }));
    } catch (error) {
      throw toApiExecutionError(error, 'list completed detonations');
    }

    const completed = page.tasks
      .filter((task) => deriveDetonationRunStatus(task) === 'complete')
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    // A re-detonated alert has several runs; the newest one is the verdict
    // the alert should carry.
    const newestByAlert = new Map<string, DetonateTask>();
    let unlinkedRuns = 0;
    for (const task of completed) {
      const alertId = parseAlertTag(task.tags);
      if (!alertId) {
        unlinkedRuns += 1;
      } else if (!newestByAlert.has(alertId)) {
        newestByAlert.set(alertId, task);
      }
    }

    const alertIds = [...newestByAlert.keys()];
    let outcomes: DetonateAlertOutcomes['outcomes'] = {};
    if (alertIds.length > 0) {
      try {
        const { body } = await contextManager.callKibanaApi<DetonateAlertOutcomes>({
          method: 'POST',
          path: DETONATE_ALERT_OUTCOMES_PATH,
          headers: { 'elastic-api-version': '1' },
          body: { alert_ids: alertIds },
        });
        outcomes = body?.outcomes ?? {};
      } catch (error) {
        throw toApiExecutionError(error, 'read detonation verdict decisions');
      }
    }

    let alreadyApplied = 0;
    const pending: DetonateTask[] = [];
    for (const [alertId, task] of newestByAlert) {
      if (outcomes[alertId]?.state === 'verdict_applied') {
        alreadyApplied += 1;
      } else {
        pending.push(task);
      }
    }

    const selected = pending.slice(0, maxPending);

    return {
      output: {
        completed_runs: completed.length,
        unlinked_runs: unlinkedRuns,
        already_applied: alreadyApplied,
        deferred: pending.length - selected.length,
        pending_count: selected.length,
        pending: selected.flatMap((task) => {
          const conclusion = deriveDetonateVerdict(task);
          // `completed` already holds complete runs only; this narrows the type.
          if (conclusion.status !== 'complete') return [];
          return [
            {
              task_id: task.id,
              alert_id: parseAlertTag(task.tags) as string,
              ...(task.sample_hash ? { sample_hash: task.sample_hash } : {}),
              created_at: task.created_at,
              verdict: conclusion.verdict,
              evidence: conclusion.evidence,
            },
          ];
        }),
      },
    };
  },
});

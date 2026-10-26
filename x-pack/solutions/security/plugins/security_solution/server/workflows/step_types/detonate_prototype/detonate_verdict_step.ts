/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — verdict step, server implementation.
 *
 * Reads the task through the same internal route the poller uses and runs the
 * shared derivation. No writes: this step exists so a workflow can branch on
 * the verdict (or log it) before deciding to touch the alert.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';

import { DETONATE_TASKS_PATH, deriveDetonateVerdict } from '../../../../common/detonate_prototype';
import type { DetonateTask } from '../../../../common/detonate_prototype';
import { detonateVerdictStepCommonDefinition } from '../../../../common/workflows/step_types/detonate_prototype/detonate_verdict_step_common';
import { toApiExecutionError } from '../../utils/to_api_execution_error';

export const detonateVerdictStepDefinition = createServerStepDefinition({
  ...detonateVerdictStepCommonDefinition,
  handler: async ({ input, contextManager }) => {
    const { task_id: taskId, alert_id: alertId } = input;

    let task: DetonateTask;
    try {
      ({ body: task } = await contextManager.callKibanaApi<DetonateTask>({
        method: 'GET',
        path: `${DETONATE_TASKS_PATH}/${encodeURIComponent(taskId)}`,
        headers: { 'elastic-api-version': '1' },
      }));
    } catch (error) {
      throw toApiExecutionError(error, `read detonation task ${taskId}`);
    }

    const verdict = deriveDetonateVerdict(task);
    return { output: alertId ? { ...verdict, alert_id: alertId } : verdict };
  },
});

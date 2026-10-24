/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — workflow step, server implementation.
 *
 * `start` submits the detonation and hands back the task id; `poll` wakes up
 * until the run reaches its terminal worker. The step goes through this
 * plugin's own internal routes rather than holding a `DetonateClient`, so the
 * service address, privilege checks and error shaping stay in one place and
 * the workflow engine's request scoping is preserved.
 */

import { createPollServerStepDefinition } from '@kbn/workflows-extensions/server';
import { z, lazySchema } from '@kbn/zod/v4';

import {
  DETONATE_SUBMIT_HASH_PATH,
  DETONATE_TASKS_PATH,
  isDetonationComplete,
  isDetonationFailed,
  totalDetonationAlerts,
} from '../../../../common/detonate_prototype';
import type { DetonateTask } from '../../../../common/detonate_prototype';
import { detonateSampleStepCommonDefinition } from '../../../../common/workflows/step_types/detonate_prototype/detonate_sample_step_common';
import { toApiExecutionError } from '../../utils/to_api_execution_error';

/** How often the step wakes to re-read the task. */
const POLL_INTERVAL_MS = 5_000;

/**
 * Hard ceiling on poll wake-ups, independent of the author's `max_wait_secs`.
 * `max_wait_secs` is the author's budget and is enforced against wall-clock
 * time inside `poll`; this is the engine's backstop so a step cannot poll
 * forever if the clock comparison is ever wrong.
 */
const MAX_POLL_ATTEMPTS = Math.ceil((3600 * 1000) / POLL_INTERVAL_MS);

const detonateStateSchema = lazySchema(() =>
  z.object({
    taskId: z.string(),
    submittedAt: z.string(),
    deadlineAt: z.string(),
  })
);

/** Shape the task into the step's output contract. */
const toOutput = (task: DetonateTask, completed: boolean) => ({
  task_id: task.id,
  completed,
  failed: isDetonationFailed(task),
  last_worker_name: task.last_worker_name,
  last_worker_status: task.last_worker_status,
  last_worker_status_details: task.last_worker_status_details,
  sample_hash: task.sample_hash,
  sample_source: task.sample_source,
  production_endpoint_alerts_count: task.production_endpoint_alerts_count ?? 0,
  diagnostic_endpoint_alerts_count: task.diagnostic_endpoint_alerts_count ?? 0,
  production_detection_alerts_count: task.production_detection_alerts_count ?? 0,
  total_alerts_count: totalDetonationAlerts(task),
  // De-duplicated: a detonation commonly raises the same `event.code` from
  // several groups, and a workflow branching on "did Defend see X" wants the
  // set, not the multiset.
  endpoint_alert_event_codes: [
    ...new Set(
      [...task.production_endpoint_alert_groups, ...task.diagnostic_endpoint_alert_groups].map(
        (group) => group.event_code
      )
    ),
  ],
  detection_rule_names: [
    ...new Set(task.production_detection_alert_groups.map((group) => group.kibana_alert_rule_name)),
  ],
});

export const detonateSampleStepDefinition = createPollServerStepDefinition({
  ...detonateSampleStepCommonDefinition,
  stateSchema: detonateStateSchema,

  start: async ({ input, contextManager, logger }) => {
    const {
      sample_hash: sampleHash,
      tags,
      vm_os_family: vmOsFamily,
      vm_architecture: vmArchitecture,
      exec_wait_secs: execWaitSecs,
      // zod `.default()` does not run here: the engine renders `input` from the
      // `with` block and never calls `inputSchema.parse()` (same reason the
      // sibling `setAlertTags` handler defaults its arrays by destructuring).
      max_wait_secs: maxWaitSecs = 900,
    } = input;

    try {
      const { body: task } = await contextManager.callKibanaApi<DetonateTask>({
        method: 'POST',
        path: DETONATE_SUBMIT_HASH_PATH,
        body: {
          sample_hash: sampleHash,
          ...(tags ? { tags } : {}),
          ...(vmOsFamily ? { vm_os_family: vmOsFamily } : {}),
          ...(vmArchitecture ? { vm_architecture: vmArchitecture } : {}),
          ...(execWaitSecs !== undefined ? { exec_wait_secs: execWaitSecs } : {}),
        },
      });

      logger.info(`Submitted detonation ${task.id} for sample ${sampleHash}`);

      return {
        state: {
          taskId: task.id,
          submittedAt: new Date().toISOString(),
          // Computed at submit time so a slow first poll cannot extend the
          // author's budget.
          deadlineAt: new Date(Date.now() + maxWaitSecs * 1000).toISOString(),
        },
      };
    } catch (error) {
      throw toApiExecutionError(error, 'submit sample for detonation');
    }
  },

  poll: async ({ state, contextManager, logger, attempt }) => {
    if (!state) {
      throw new Error('Poll ran before start() seeded durable state — check engine wiring.');
    }

    let task: DetonateTask;
    try {
      ({ body: task } = await contextManager.callKibanaApi<DetonateTask>({
        method: 'GET',
        path: `${DETONATE_TASKS_PATH}/${encodeURIComponent(state.taskId)}`,
      }));
    } catch (error) {
      throw toApiExecutionError(error, `read detonation task ${state.taskId}`);
    }

    if (isDetonationComplete(task)) {
      logger.info(
        `Detonation ${state.taskId} finished after ${attempt + 1} poll(s): ` +
          `${task.last_worker_name}/${task.last_worker_status}, ` +
          `${totalDetonationAlerts(task)} alert(s)`
      );
      // A failed detonation is reported, not thrown: "the sample would not run"
      // is a result the workflow should be able to branch on, and throwing
      // would lose the alert counts a partial run did produce.
      return { output: toOutput(task, true) };
    }

    if (Date.now() >= Date.parse(state.deadlineAt)) {
      logger.warn(
        `Stopped waiting on detonation ${state.taskId} after ${attempt + 1} poll(s); ` +
          `last seen at ${task.last_worker_name}/${task.last_worker_status}`
      );
      // The run itself is left alone — it may still finish, and the task id in
      // the output is how the analyst finds it.
      return { output: toOutput(task, false) };
    }

    logger.debug(
      `Detonation ${state.taskId}: ${task.last_worker_name}/${task.last_worker_status} ` +
        `(poll ${attempt + 1})`
    );
    return { state };
  },

  policy: { strategy: 'fixed', intervalMs: POLL_INTERVAL_MS },
  ceilings: { maxAttempts: MAX_POLL_ATTEMPTS, maxWaitMs: POLL_INTERVAL_MS },
});

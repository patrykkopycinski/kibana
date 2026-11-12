/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';

import { DETECTION_ENGINE_QUERY_SIGNALS_URL } from '../../../../common/constants';
import {
  DETONATE_TAG_PREFIX,
  DETONATE_TASKS_PATH,
  deriveDetonateVerdict,
  deriveDetonationRunStatus,
  parseAlertTag,
} from '../../../../common/detonate_prototype';
import type {
  DetonateTask,
  DetonateTaskSearchResponse,
} from '../../../../common/detonate_prototype';
import { detonateCompletedRunsStepCommonDefinition } from '../../../../common/workflows/step_types/detonate_prototype/detonate_completed_runs_step_common';
import { toApiExecutionError } from '../../utils/to_api_execution_error';

/** The tasks route's own page cap. */
const MAX_RUNS = 200;

const WORKFLOW_TAGS_FIELD = 'kibana.alert.workflow_tags';

interface AlertTagsSearchResponse {
  hits?: { hits?: Array<{ _id?: string; fields?: Record<string, unknown> }> };
}

/**
 * The sweep's read half. Lists this space's runs through the plugin's tasks
 * route, keeps the newest completed run per source alert, and drops every
 * alert that already carries a `detonate:*` tag — read through the alerts
 * search route, so the alert read is space-scoped and privilege-checked the
 * same way the alerts table is.
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
    const tagsByAlert = new Map<string, string[]>();
    if (alertIds.length > 0) {
      let alerts: AlertTagsSearchResponse;
      try {
        ({ body: alerts } = await contextManager.callKibanaApi<AlertTagsSearchResponse>({
          method: 'POST',
          path: DETECTION_ENGINE_QUERY_SIGNALS_URL,
          headers: { 'elastic-api-version': '2023-10-31' },
          body: {
            query: { ids: { values: alertIds } },
            fields: [WORKFLOW_TAGS_FIELD],
            _source: false,
            size: alertIds.length,
          },
        }));
      } catch (error) {
        throw toApiExecutionError(error, 'read detonation verdict tags');
      }
      for (const { _id: id, fields } of alerts.hits?.hits ?? []) {
        if (id) {
          const tags = fields?.[WORKFLOW_TAGS_FIELD];
          tagsByAlert.set(
            id,
            Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : []
          );
        }
      }
    }

    let alreadyApplied = 0;
    let missingAlerts = 0;
    const pending: DetonateTask[] = [];
    for (const [alertId, task] of newestByAlert) {
      const tags = tagsByAlert.get(alertId);
      if (!tags) {
        missingAlerts += 1;
      } else if (tags.some((tag) => tag.startsWith(DETONATE_TAG_PREFIX))) {
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
        missing_alerts: missingAlerts,
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
              suggested_tag: conclusion.suggested_tag,
            },
          ];
        }),
      },
    };
  },
});

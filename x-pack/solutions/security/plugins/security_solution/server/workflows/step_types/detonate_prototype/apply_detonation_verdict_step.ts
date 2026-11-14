/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — apply-verdict step, server implementation.
 *
 * Two writes through the same internal APIs the sibling steps use: the
 * evidence as a note on the alert document (`eventId` = alert `_id`), which is
 * the surface the alert flyout renders notes from, then the verdict as a
 * decision document in the results index (the alert itself is never modified). Alert status is deliberately out of scope: "close it" is a
 * suggestion for the analyst, not an action an automated tier takes on a
 * sandbox verdict alone.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';

import {
  DETONATE_DECISIONS_PATH,
  DETONATE_NOTE_MARKER,
  DETONATE_PROTOTYPE_APP_PATH,
} from '../../../../common/detonate_prototype';
import { NOTE_URL } from '../../../../common/constants';
import { applyDetonationVerdictStepCommonDefinition } from '../../../../common/workflows/step_types/detonate_prototype/apply_detonation_verdict_step_common';
import { toApiExecutionError } from '../../utils/to_api_execution_error';

export const applyDetonationVerdictStepDefinition = createServerStepDefinition({
  ...applyDetonationVerdictStepCommonDefinition,
  handler: async (context) => {
    const { verdict, alert_id: alertId, task_id: taskId, evidence } = context.input;

    const note = `${DETONATE_NOTE_MARKER}${evidence} (run: ${DETONATE_PROTOTYPE_APP_PATH}/${taskId})`;

    try {
      // Note first: the decision is what a sweep filters on, so a failed note
      // after it would leave the alert `verdict_applied` with no evidence and
      // no retry. This way a failure of either write leaves the alert pending
      // and the step throws, at the cost of a duplicate note when the decision
      // write fails and the step is retried. A re-run that reaches a different
      // verdict overwrites the same decision document, so two never coexist.
      const { body: noteBody } = await context.contextManager.callKibanaApi<{
        note?: { noteId?: string };
      }>({
        method: 'PATCH',
        path: NOTE_URL,
        body: { note: { note, eventId: alertId, timelineId: '' } },
      });

      await context.contextManager.callKibanaApi({
        method: 'POST',
        path: DETONATE_DECISIONS_PATH,
        headers: { 'elastic-api-version': '1' },
        body: {
          decisions: [{ alert_id: alertId, state: 'verdict_applied', verdict, task_id: taskId }],
        },
      });

      return {
        output: {
          success: true,
          decision: 'verdict_applied' as const,
          ...(noteBody?.note?.noteId ? { note_id: noteBody.note.noteId } : {}),
          message: `Recorded the ${verdict} verdict for alert ${alertId} and added the detonation evidence note`,
        },
      };
    } catch (error) {
      throw toApiExecutionError(error, `apply detonation verdict to alert ${alertId}`);
    }
  },
});

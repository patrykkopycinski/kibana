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
 * `detonate:<verdict>` tag via the detection-engine tags route, and the
 * evidence as a note on the alert document (`eventId` = alert `_id`), which
 * is the surface the alert flyout renders notes from. Alert status is
 * deliberately out of scope: "close it" is a suggestion for the analyst, not
 * an action an automated tier takes on a sandbox verdict alone.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';

import {
  DETONATE_NOTE_MARKER,
  DETONATE_PROTOTYPE_APP_PATH,
  detonateVerdictTag,
} from '../../../../common/detonate_prototype';
import type { DetonateVerdictName } from '../../../../common/detonate_prototype';
import { DETECTION_ENGINE_ALERT_TAGS_URL, NOTE_URL } from '../../../../common/constants';
import { applyDetonationVerdictStepCommonDefinition } from '../../../../common/workflows/step_types/detonate_prototype/apply_detonation_verdict_step_common';
import { toApiExecutionError } from '../../utils/to_api_execution_error';

export const applyDetonationVerdictStepDefinition = createServerStepDefinition({
  ...applyDetonationVerdictStepCommonDefinition,
  handler: async (context) => {
    const { verdict, alert_id: alertId, task_id: taskId, evidence } = context.input;

    const tag = detonateVerdictTag(verdict as DetonateVerdictName);
    const note = `${DETONATE_NOTE_MARKER}${evidence} (run: ${DETONATE_PROTOTYPE_APP_PATH}/${taskId})`;

    try {
      // Tag first: if the note write fails the alert still carries the
      // outcome, which is the half a triage queue filters on.
      await context.contextManager.callKibanaApi({
        method: 'POST',
        path: DETECTION_ENGINE_ALERT_TAGS_URL,
        body: { ids: [alertId], tags: { tags_to_add: [tag] } },
      });

      const { body: noteBody } = await context.contextManager.callKibanaApi<{
        note?: { noteId?: string };
      }>({
        method: 'PATCH',
        path: NOTE_URL,
        body: { note: { note, eventId: alertId, timelineId: '' } },
      });

      return {
        output: {
          success: true,
          tag,
          ...(noteBody?.note?.noteId ? { note_id: noteBody.note.noteId } : {}),
          message: `Tagged alert ${alertId} ${tag} and added the detonation evidence note`,
        },
      };
    } catch (error) {
      throw toApiExecutionError(error, `apply detonation verdict to alert ${alertId}`);
    }
  },
});

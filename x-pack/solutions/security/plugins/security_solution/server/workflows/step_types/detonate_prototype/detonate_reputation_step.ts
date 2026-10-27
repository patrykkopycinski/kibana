/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. as a
 * contributor license agreements. Licensed under the Elastic License 2.0;
 * you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — reputation step, server implementation.
 *
 * Reads the reputation gate through this plugin's own internal route, so the
 * privilege check and service URL stay with the other detonate routes. No
 * writes and no interpretation: `unknown` is passed through untouched — the
 * workflow's switch, not this step, decides that unknown means "detonate".
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';

import { DETONATE_REPUTATION_PATH } from '../../../../common/detonate_prototype';
import type { DetonateReputationResponse } from '../../../../common/detonate_prototype';
import { detonateReputationStepCommonDefinition } from '../../../../common/workflows/step_types/detonate_prototype/detonate_reputation_step_common';
import { toApiExecutionError } from '../../utils/to_api_execution_error';

export const detonateReputationStepDefinition = createServerStepDefinition({
  ...detonateReputationStepCommonDefinition,
  handler: async ({ input, contextManager }) => {
    const { sha256 } = input;

    let reputation: DetonateReputationResponse;
    try {
      ({ body: reputation } = await contextManager.callKibanaApi<DetonateReputationResponse>({
        method: 'GET',
        path: `${DETONATE_REPUTATION_PATH}/${encodeURIComponent(sha256)}`,
        headers: { 'elastic-api-version': '1' },
      }));
    } catch (error) {
      throw toApiExecutionError(error, `look up reputation for ${sha256}`);
    }

    return { output: reputation };
  },
});

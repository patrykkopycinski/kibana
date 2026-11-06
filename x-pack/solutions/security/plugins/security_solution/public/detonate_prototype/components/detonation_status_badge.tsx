/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — run status badge.
 *
 * Reads the status from the shared completion predicate rather than from an
 * elapsed timer or a `status` field that does not exist, so every surface
 * agrees on when a run is done.
 */

import React from 'react';

import { deriveDetonationRunState, detonationStep } from '../../../common/detonate_prototype';
import type { DetonateTask } from '../../../common/detonate_prototype';
import { DetonationStateBadge } from './detonation_state_badge';

export { DETONATE_STATUS_TEST_ID } from './detonation_state_badge';

interface Props {
  task: DetonateTask;
  /** Show which worker the run is on. Useful on the detail page, noisy in a table. */
  showProgress?: boolean;
}

export const DetonationStatusBadge = React.memo<Props>(({ task, showProgress = false }) => (
  <DetonationStateBadge
    state={deriveDetonationRunState(task)}
    step={showProgress ? detonationStep(task) : undefined}
  />
));
DetonationStatusBadge.displayName = 'DetonationStatusBadge';

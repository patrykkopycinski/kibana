/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — verdict badge.
 *
 * Renders the derived verdict (malicious / quiet / inconclusive) for one run,
 * using the same pure derivation every other surface uses. Shown only once the
 * run is over: a verdict while workers are still running would read as a
 * conclusion the sandbox has not reached, and `inconclusive` mid-run is noise.
 */

import React from 'react';
import { EuiBadge, EuiToolTip } from '@elastic/eui';

import {
  deriveDetonateVerdict,
  isDetonationComplete,
  isDetonationFailed,
} from '../../../common/detonate_prototype';
import type { DetonateTask } from '../../../common/detonate_prototype';
import * as i18n from '../translations';

export const VERDICT_BADGE_TEST_ID = 'detonatePrototypeVerdictBadge';

const VERDICT_COLOR: Record<string, string> = {
  malicious: 'danger',
  quiet: 'success',
  inconclusive: 'warning',
};

interface DetonateVerdictBadgeProps {
  task: DetonateTask;
}

export const DetonateVerdictBadge = React.memo<DetonateVerdictBadgeProps>(({ task }) => {
  const complete = isDetonationComplete(task) || isDetonationFailed(task);
  if (!complete) return null;

  const { verdict, evidence } = deriveDetonateVerdict(task);
  const label =
    verdict === 'malicious'
      ? i18n.VERDICT_MALICIOUS
      : verdict === 'quiet'
      ? i18n.VERDICT_QUIET
      : i18n.VERDICT_INCONCLUSIVE;

  return (
    <EuiToolTip content={evidence}>
      <EuiBadge
        color={VERDICT_COLOR[verdict]}
        data-test-subj={`${VERDICT_BADGE_TEST_ID}-${verdict}`}
        tabIndex={0}
      >
        {label}
      </EuiBadge>
    </EuiToolTip>
  );
});
DetonateVerdictBadge.displayName = 'DetonateVerdictBadge';

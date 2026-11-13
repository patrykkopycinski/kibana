/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — the one state badge every surface shows, for a run or
 * for an alert that has none.
 */

import React from 'react';
import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiToolTip } from '@elastic/eui';
import type { EuiBadgeProps } from '@elastic/eui';

import type { DetonationState, DetonationStep } from '../../../common/detonate_prototype';
import * as i18n from '../translations';

export const DETONATE_STATUS_TEST_ID = 'detonatePrototypeStatus';
export const DETONATE_STEP_TEST_ID = 'detonatePrototypeStep';

const STATE_DISPLAY: Readonly<
  Record<DetonationState, { label: string; color: EuiBadgeProps['color']; description?: string }>
> = {
  running: { label: i18n.STATUS_RUNNING, color: 'hollow' },
  complete: { label: i18n.STATUS_COMPLETE, color: 'success' },
  failed: { label: i18n.STATUS_FAILED, color: 'danger' },
  queued: {
    label: i18n.STATUS_QUEUED,
    color: 'hollow',
    description: i18n.STATUS_QUEUED_DESCRIPTION,
  },
  not_analyzed: { label: i18n.STATUS_NOT_ANALYZED, color: 'default' },
  allowance_reached: {
    label: i18n.STATUS_ALLOWANCE_REACHED,
    color: 'warning',
    description: i18n.STATUS_ALLOWANCE_REACHED_DESCRIPTION,
  },
  unsupported_os: {
    label: i18n.STATUS_UNSUPPORTED_OS,
    color: 'default',
    description: i18n.STATUS_UNSUPPORTED_OS_DESCRIPTION,
  },
};

const IN_FLIGHT: ReadonlySet<DetonationState> = new Set(['running', 'queued']);

interface Props {
  state: DetonationState;
  /** The step chip: plain label, raw worker name on hover. Only drawn while running or after a failure. */
  step?: DetonationStep;
}

export const DetonationStateBadge = React.memo<Props>(({ state, step }) => {
  const { label, color, description } = STATE_DISPLAY[state];
  const badge = (
    <EuiBadge
      color={color}
      tabIndex={description ? 0 : undefined}
      data-test-subj={`${DETONATE_STATUS_TEST_ID}-${state}`}
    >
      {label}
    </EuiBadge>
  );
  const showStep = step !== undefined && (state === 'running' || state === 'failed');

  if (!IN_FLIGHT.has(state) && !showStep && !description) {
    return <span data-test-subj={DETONATE_STATUS_TEST_ID}>{badge}</span>;
  }

  return (
    <EuiFlexGroup
      alignItems="center"
      gutterSize="s"
      responsive={false}
      data-test-subj={DETONATE_STATUS_TEST_ID}
    >
      {IN_FLIGHT.has(state) && (
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="s" />
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>
        {description ? <EuiToolTip content={description}>{badge}</EuiToolTip> : badge}
      </EuiFlexItem>
      {showStep && (
        <EuiFlexItem grow={false}>
          <EuiToolTip content={step.worker}>
            <EuiBadge color="default" tabIndex={0} data-test-subj={DETONATE_STEP_TEST_ID}>
              {`${step.step}/${step.of} ${step.label}`}
            </EuiBadge>
          </EuiToolTip>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
});
DetonationStateBadge.displayName = 'DetonationStateBadge';

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
import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner } from '@elastic/eui';

import {
  detonationProgress,
  isDetonationComplete,
  isDetonationFailed,
} from '../../../common/detonate_prototype';
import type { DetonateTask } from '../../../common/detonate_prototype';
import { STATUS_COMPLETE, STATUS_FAILED, STATUS_RUNNING } from '../translations';

export const DETONATE_STATUS_TEST_ID = 'detonatePrototypeStatus';

interface Props {
  task: Pick<DetonateTask, 'last_worker_name' | 'last_worker_status'>;
  /** Show which worker the run is on. Useful on the detail page, noisy in a table. */
  showProgress?: boolean;
}

export const DetonationStatusBadge = React.memo<Props>(({ task, showProgress = false }) => {
  const failed = isDetonationFailed(task);
  const complete = isDetonationComplete(task);
  const { step, of: total, label } = detonationProgress(task);

  const badge = failed ? (
    <EuiBadge color="danger" data-test-subj={`${DETONATE_STATUS_TEST_ID}-failed`}>
      {STATUS_FAILED}
    </EuiBadge>
  ) : complete ? (
    <EuiBadge color="success" data-test-subj={`${DETONATE_STATUS_TEST_ID}-complete`}>
      {STATUS_COMPLETE}
    </EuiBadge>
  ) : (
    <EuiBadge color="hollow" data-test-subj={`${DETONATE_STATUS_TEST_ID}-running`}>
      {STATUS_RUNNING}
    </EuiBadge>
  );

  if (!showProgress) {
    return <span data-test-subj={DETONATE_STATUS_TEST_ID}>{badge}</span>;
  }

  return (
    <EuiFlexGroup
      alignItems="center"
      gutterSize="s"
      responsive={false}
      data-test-subj={DETONATE_STATUS_TEST_ID}
    >
      {!complete && (
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="s" />
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>{badge}</EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBadge color="default">{`${step}/${total} ${label}`}</EuiBadge>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
});
DetonationStatusBadge.displayName = 'DetonationStatusBadge';

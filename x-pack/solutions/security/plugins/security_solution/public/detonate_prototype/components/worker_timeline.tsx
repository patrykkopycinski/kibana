/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under the
 * Elastic License 2.0; you may not use this file except in compliance with the
 * Elastic License 2.0.
 */

/**
 * Detonate prototype — worker timeline.
 *
 * The service exposes progress as a sequence of cumulative task snapshots, not
 * as a per-worker status map, so each row's state is the last update that names
 * that worker. Workers with no update have not run yet — a run that has not
 * started still shows all four rows, which is what makes the timeline honest
 * about what the service will do next rather than only what it has done.
 */

import React from 'react';
import {
  EuiIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiText,
} from '@elastic/eui';
import { FormattedRelative } from '@kbn/i18n-react';

import { DETONATE_WORKERS } from '../../../common/detonate_prototype';
import type { DetonateTaskUpdate, DetonateWorkerStatus } from '../../../common/detonate_prototype';
import { useDetonationTaskUpdates } from '../hooks/use_detonate';
import * as i18n from '../translations';

export const WORKER_TIMELINE_TEST_ID = 'detonatePrototypeWorkerTimeline';

/** `detonate.workers.prepare_task_data` → `prepare task data`, display only. */
const workerLabel = (worker: string) => worker.replace('detonate.workers.', '').replace(/_/g, ' ');

const statusIcon = (status: DetonateWorkerStatus | undefined) => {
  if (!status) {
    return <EuiIcon type="dot" color="subdued" aria-hidden={true} />;
  }
  if (status === 'success') {
    return <EuiIcon type="checkInCircleFilled" color="success" aria-hidden={true} />;
  }
  if (status === 'failure') {
    return <EuiIcon type="crossInCircleFilled" color="danger" aria-hidden={true} />;
  }
  return <EuiLoadingSpinner size="s" />;
};

/** Latest status + time for every worker, folded from the update history. */
const foldUpdates = (updates: DetonateTaskUpdate[] | undefined) => {
  const byWorker = new Map<string, { status: DetonateWorkerStatus; timestamp: string }>();
  for (const { task, timestamp } of updates ?? []) {
    byWorker.set(task.last_worker_name, { status: task.last_worker_status, timestamp });
  }
  return byWorker;
};

interface Props {
  taskId: string;
  /** Stops the updates poll when the shared predicate says the run is over. */
  isComplete: boolean;
}

export const WorkerTimeline = React.memo<Props>(({ taskId, isComplete }) => {
  const { data: updates } = useDetonationTaskUpdates(taskId, isComplete);
  const byWorker = foldUpdates(updates);

  return (
    <EuiPanel hasBorder data-test-subj={WORKER_TIMELINE_TEST_ID}>
      <EuiText size="xs">
        <h3>{i18n.TIMELINE_TITLE}</h3>
      </EuiText>
      <EuiFlexGroup direction="column" gutterSize="s" responsive={false}>
        {DETONATE_WORKERS.map((worker) => {
          const entry = byWorker.get(worker);
          return (
            <EuiFlexItem key={worker} grow={false}>
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>{statusIcon(entry?.status)}</EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText
                    size="xs"
                    data-test-subj={`${WORKER_TIMELINE_TEST_ID}-${workerLabel(worker).replace(
                      / /g,
                      '_'
                    )}`}
                  >
                    {workerLabel(worker)}
                  </EuiText>
                </EuiFlexItem>
                {entry && (
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      <FormattedRelative value={new Date(entry.timestamp)} />
                    </EuiText>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiFlexItem>
          );
        })}
      </EuiFlexGroup>
    </EuiPanel>
  );
});
WorkerTimeline.displayName = 'WorkerTimeline';

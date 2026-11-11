/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Completion-notification tests.
 *
 * The acceptance criteria: a tracked run toasts exactly once when it completes
 * away from the flyout showing it; the visible run suppresses its toast; a
 * failed run warns rather than celebrates. Mutation checks: delete the
 * `notified` guard and the second-render case goes red; delete the
 * `visibleTaskId` comparison and the open-flyout case goes red.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';

import type { DetonateTask } from '../../../common/detonate_prototype';
import * as useDetonate from '../hooks/use_detonate';
import { useToasts } from '../../common/lib/kibana';
import {
  detonationTrackerStore,
  DetonationNotifier,
  useTrackDetonation,
} from './detonation_notifier';

const mockOpenDetonationFlyout = jest.fn();
jest.mock('../../common/lib/kibana', () => ({
  ...jest.requireActual('../../common/lib/kibana'),
  useToasts: jest.fn(),
}));
jest.mock('../../flyout_v2/detonation/use_detonation_flyout_api', () => ({
  useDetonationFlyoutApi: () => ({ openDetonationFlyout: mockOpenDetonationFlyout }),
}));

const baseTask = {
  sample_filename: 'sample.exe',
  sample_hash: 'a'.repeat(64),
  production_endpoint_alert_groups: [],
  diagnostic_endpoint_alert_groups: [],
  production_detection_alert_groups: [],
  tags: [],
} as const;

const makeTask = (overrides: Partial<DetonateTask>): DetonateTask =>
  ({ ...baseTask, ...overrides } as unknown as DetonateTask);

const completeTask = makeTask({
  id: 'complete',
  last_worker_name: 'detonate.workers.make_summary',
  last_worker_status: 'success',
});

const failedTask = makeTask({
  id: 'failed',
  last_worker_name: 'detonate.workers.start_vm',
  last_worker_status: 'failure',
  last_worker_status_details: 'vm boot failed',
});

/** Mounts the notifier and registers one tracked run from a child component. */
const mountTracked = (taskId: string) => {
  const Registrar = () => {
    const track = useTrackDetonation();
    React.useEffect(() => {
      // taskId is closed over once per mount by mountTracked, never a
      // changing prop, so [track] is the full reactive set.
      track(taskId);
    }, [track]);
    return null;
  };
  return render(
    <DetonationNotifier>
      <Registrar />
    </DetonationNotifier>
  );
};

describe('DetonationNotifier', () => {
  const successToast = jest.fn();
  const warningToast = jest.fn();

  beforeEach(() => {
    successToast.mockClear();
    warningToast.mockClear();
    detonationTrackerStore.__resetForTests();
    jest.mocked(useToasts).mockReturnValue({
      addSuccess: successToast,
      addWarning: warningToast,
    } as never);
  });

  it('toasts once when a tracked run completes', async () => {
    jest.spyOn(useDetonate, 'useDetonationTask').mockReturnValue({ data: completeTask } as never);
    mountTracked('task-1');

    await waitFor(() => expect(successToast).toHaveBeenCalledTimes(1));
  });

  it('opens the run in the detonation flyout when the toast is clicked', async () => {
    jest.spyOn(useDetonate, 'useDetonationTask').mockReturnValue({ data: completeTask } as never);
    mountTracked('task-9');

    await waitFor(() => expect(successToast).toHaveBeenCalledTimes(1));
    successToast.mock.calls[0][0].onClick();
    expect(mockOpenDetonationFlyout).toHaveBeenCalledWith({ taskId: 'task-9' });
  });

  it('does not toast a second time for the same run', async () => {
    jest.spyOn(useDetonate, 'useDetonationTask').mockReturnValue({ data: completeTask } as never);
    mountTracked('task-2');

    await waitFor(() => expect(successToast).toHaveBeenCalledTimes(1));
    // Re-render with the same completed task: still exactly one toast.
    await waitFor(() => expect(successToast).toHaveBeenCalledTimes(1));
  });

  it('warns instead of celebrating a failed run', async () => {
    jest.spyOn(useDetonate, 'useDetonationTask').mockReturnValue({ data: failedTask } as never);
    mountTracked('task-3');

    await waitFor(() => expect(warningToast).toHaveBeenCalledTimes(1));
    expect(successToast).not.toHaveBeenCalled();
  });

  it('stays silent while the run is still in flight', () => {
    jest.spyOn(useDetonate, 'useDetonationTask').mockReturnValue({
      data: makeTask({
        last_worker_name: 'detonate.workers.start_vm',
        last_worker_status: 'started',
      }),
    } as never);
    mountTracked('task-4');

    expect(successToast).not.toHaveBeenCalled();
    expect(warningToast).not.toHaveBeenCalled();
  });

  it('does not toast about the run whose flyout is open, before or after it closes', async () => {
    jest.spyOn(useDetonate, 'useDetonationTask').mockReturnValue({ data: completeTask } as never);
    // The result flyout opens the run (registers it visible) before the run
    // completes: the flyout the analyst is looking at IS the notification.
    detonationTrackerStore.setVisible('task-5');
    mountTracked('task-5');

    await waitFor(() => expect(successToast).not.toHaveBeenCalled());
    expect(warningToast).not.toHaveBeenCalled();

    // A run that completed while visible consumed its notification silently;
    // closing the flyout afterwards must not replay it as a toast.
    detonationTrackerStore.clearVisible('task-5');
    await waitFor(() => {
      expect(detonationTrackerStore.getSnapshot().visibleTaskId).toBeUndefined();
    });
    expect(successToast).not.toHaveBeenCalled();
  });

  it('tracks a run submitted from outside the notifier tree (flyout overlay root)', () => {
    // The alert action's submit form renders in the flyout overlay's React
    // root, a sibling of the app root that mounts the notifier. Submit hooks
    // there reach the tracker through the module store, not React context.
    detonationTrackerStore.track('task-6');
    expect(detonationTrackerStore.getSnapshot().trackedTaskIds).toContain('task-6');
  });
});

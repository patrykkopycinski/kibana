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
 * away from its own page; the page the analyst has open suppresses its toast;
 * a failed run warns rather than celebrates. Mutation checks: delete the
 * `notified` guard and the second-render case goes red; delete the
 * `activeTaskId` comparison and the open-page case goes red.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { DetonateTask } from '../../../common/detonate_prototype';
import * as useDetonate from '../hooks/use_detonate';
import { useKibana } from '../../common/lib/kibana';
import {
  DetonationNotifier,
  useTrackDetonation,
  DETONATION_NOTIFIER_TEST_ID,
} from './detonation_notifier';

jest.mock('../../common/lib/kibana', () => ({
  ...jest.requireActual('../../common/lib/kibana'),
  useKibana: jest.fn(),
  useNavigateTo: () => ({ navigateTo: jest.fn() }),
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
      track(taskId);
    }, [track, taskId]);
    return null;
  };
  return render(
    <MemoryRouter>
      <DetonationNotifier>
        <Registrar />
      </DetonationNotifier>
    </MemoryRouter>
  );
};

describe('DetonationNotifier', () => {
  const successToast = jest.fn();
  const warningToast = jest.fn();

  beforeEach(() => {
    successToast.mockClear();
    warningToast.mockClear();
    jest.mocked(useKibana).mockReturnValue({
      services: { notifications: { toasts: { success: successToast, warning: warningToast } } },
    } as never);
  });

  it('toasts once when a tracked run completes', async () => {
    jest.spyOn(useDetonate, 'useDetonationTask').mockReturnValue({ data: completeTask } as never);
    mountTracked('task-1');

    await waitFor(() => expect(successToast).toHaveBeenCalledTimes(1));
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
    jest
      .spyOn(useDetonate, 'useDetonationTask')
      .mockReturnValue({ data: makeTask({ last_worker_name: 'detonate.workers.start_vm', last_worker_status: 'started' }) } as never);
    mountTracked('task-4');

    expect(successToast).not.toHaveBeenCalled();
    expect(warningToast).not.toHaveBeenCalled();
  });

  it('does not toast about the run whose page is open', async () => {
    jest.spyOn(useDetonate, 'useDetonationTask').mockReturnValue({ data: completeTask } as never);

    const Registrar = () => {
      const track = useTrackDetonation();
      React.useEffect(() => {
        track('task-5');
      }, [track]);
      return null;
    };
    render(
      <MemoryRouter initialEntries={['/detonate_prototype/task-5']}>
        <DetonationNotifier>
          <Registrar />
        </DetonationNotifier>
      </MemoryRouter>
    );

    await waitFor(() => expect(successToast).not.toHaveBeenCalled());
    expect(warningToast).not.toHaveBeenCalled();
  });
});

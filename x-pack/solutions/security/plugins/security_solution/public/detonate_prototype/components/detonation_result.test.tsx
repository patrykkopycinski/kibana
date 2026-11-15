/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The overview lists the VM architecture only when the service reported one.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';

import type { DetonateTask } from '../../../common/detonate_prototype';
import { useCompletedDetonationHistoryByHash, useDetonationTask } from '../hooks/use_detonate';
import { DetonationResult } from './detonation_result';

jest.mock('../hooks/use_detonate');
jest.mock('./worker_timeline', () => ({ WorkerTimeline: () => null }));
jest.mock('./run_history', () => ({ RunHistory: () => null }));
jest.mock('./behavior_diff_card', () => ({ BehaviorDiffCard: () => null }));
jest.mock('./alert_groups', () => ({
  DetectionAlertGroups: () => null,
  EndpointAlertGroups: () => null,
}));

const createTask = (overrides: Partial<DetonateTask> = {}): DetonateTask => ({
  id: 'task-1',
  created_at: '2026-01-01T00:00:00.000Z',
  tags: [],
  agent_version: '8.0.0',
  telemetry_cluster_version: '8.0.0',
  last_worker_name: 'detonate.workers.stop_vm',
  last_worker_status: 'started',
  exec_wait_secs: 30,
  pre_exec_commands: [],
  exec_commands: [],
  vm_has_internet: false,
  production_endpoint_alert_groups: [],
  diagnostic_endpoint_alert_groups: [],
  production_detection_alert_groups: [],
  ...overrides,
});

const mockTask = (task: DetonateTask) => {
  jest.mocked(useDetonationTask).mockReturnValue({ data: task, isLoading: false } as never);
  jest.mocked(useCompletedDetonationHistoryByHash).mockReturnValue({ completedRuns: [] } as never);
};

describe('DetonationResult overview', () => {
  it('shows the VM architecture when the run has one', () => {
    mockTask(createTask({ vm_architecture: 'arm64' }));
    render(
      <I18nProvider>
        <DetonationResult taskId="task-1" />
      </I18nProvider>
    );

    expect(screen.getByTestId('detonatePrototypeDetails')).toHaveTextContent('VM architecture');
    expect(screen.getByTestId('detonatePrototypeDetails')).toHaveTextContent('arm64');
  });

  it('omits the VM architecture row when the run has none', () => {
    mockTask(createTask());
    render(
      <I18nProvider>
        <DetonationResult taskId="task-1" />
      </I18nProvider>
    );

    expect(screen.getByTestId('detonatePrototypeDetails')).not.toHaveTextContent('VM architecture');
  });
});

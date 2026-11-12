/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import { DETONATE_TAG_PREFIX, DETONATION_STATES } from '../../../common/detonate_prototype';
import type { DetonateTask } from '../../../common/detonate_prototype';
import {
  DETONATE_STATUS_TEST_ID,
  DETONATE_STEP_TEST_ID,
  DetonationStateBadge,
} from './detonation_state_badge';
import { DetonationStatusBadge } from './detonation_status_badge';

const createTask = (overrides: Partial<DetonateTask> = {}): DetonateTask => ({
  id: 'task-1',
  created_at: '2026-01-01T00:00:00.000Z',
  tags: [],
  agent_version: '8.0.0',
  telemetry_cluster_version: '8.0.0',
  last_worker_name: 'detonate.workers.make_summary',
  last_worker_status: 'success',
  exec_wait_secs: 30,
  pre_exec_commands: [],
  exec_commands: [],
  vm_has_internet: false,
  production_endpoint_alert_groups: [],
  diagnostic_endpoint_alert_groups: [],
  production_detection_alert_groups: [],
  ...overrides,
});

const running = createTask({
  last_worker_name: 'detonate.workers.stop_vm',
  last_worker_status: 'started',
});

describe('DetonationStateBadge', () => {
  it.each(DETONATION_STATES)('renders %s with its own test id and a label', (state) => {
    render(<DetonationStateBadge state={state} />);

    expect(screen.getByTestId(DETONATE_STATUS_TEST_ID)).toBeInTheDocument();
    expect(screen.getByTestId(`${DETONATE_STATUS_TEST_ID}-${state}`).textContent).not.toBe('');
  });

  it('draws the step chip with the plain label while running', () => {
    render(
      <DetonationStateBadge
        state="running"
        step={{ step: 3, of: 4, label: 'Stopping the sandbox', worker: 'detonate.workers.stop_vm' }}
      />
    );

    expect(screen.getByTestId(DETONATE_STEP_TEST_ID)).toHaveTextContent('3/4 Stopping the sandbox');
  });

  it('drops the step chip once the run is complete', () => {
    render(
      <DetonationStateBadge
        state="complete"
        step={{
          step: 4,
          of: 4,
          label: 'Writing the summary',
          worker: 'detonate.workers.make_summary',
        }}
      />
    );

    expect(screen.queryByTestId(DETONATE_STEP_TEST_ID)).not.toBeInTheDocument();
  });
});

describe('DetonationStatusBadge', () => {
  it('keeps the test ids the Scout journey asserts on', () => {
    const { rerender } = render(
      <DetonationStatusBadge task={createTask({ production_endpoint_alerts_count: 1 })} />
    );
    expect(screen.getByTestId(`${DETONATE_STATUS_TEST_ID}-complete`)).toBeInTheDocument();

    rerender(
      <DetonationStatusBadge
        task={createTask({
          last_worker_name: 'detonate.workers.start_vm',
          last_worker_status: 'failure',
        })}
      />
    );
    expect(screen.getByTestId(`${DETONATE_STATUS_TEST_ID}-failed`)).toBeInTheDocument();

    rerender(<DetonationStatusBadge task={running} />);
    expect(screen.getByTestId(`${DETONATE_STATUS_TEST_ID}-running`)).toBeInTheDocument();
  });

  it('shows a diagnostic-only run as complete: the verdict is a separate axis', () => {
    render(<DetonationStatusBadge task={createTask({ diagnostic_endpoint_alerts_count: 1 })} />);

    expect(screen.getByTestId(`${DETONATE_STATUS_TEST_ID}-complete`)).toBeInTheDocument();
  });

  it('ignores the retired escalated tag', () => {
    render(
      <DetonationStatusBadge task={createTask({ tags: [`${DETONATE_TAG_PREFIX}escalated`] })} />
    );

    expect(screen.getByTestId(`${DETONATE_STATUS_TEST_ID}-complete`)).toBeInTheDocument();
  });

  it('shows the step only when asked', () => {
    const { rerender } = render(<DetonationStatusBadge task={running} />);
    expect(screen.queryByTestId(DETONATE_STEP_TEST_ID)).not.toBeInTheDocument();

    rerender(<DetonationStatusBadge task={running} showProgress />);
    expect(screen.getByTestId(DETONATE_STEP_TEST_ID)).toHaveTextContent('3/4 Stopping the sandbox');
  });
});

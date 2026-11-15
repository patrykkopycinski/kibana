/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import type { DetonateTask } from '../../../../common/detonate_prototype';
import { useDetonationTaskUpdates } from '../../../detonate_prototype/hooks/use_detonate';
import { Header } from './header';
import {
  DETONATION_DETAILS_META_ALERTS_TEST_ID,
  DETONATION_DETAILS_META_DURATION_TEST_ID,
  DETONATION_DETAILS_META_STATUS_TEST_ID,
  DETONATION_DETAILS_META_VERDICT_TEST_ID,
  DETONATION_DETAILS_TITLE_TEST_ID,
} from './test_ids';

jest.mock('../../../detonate_prototype/hooks/use_detonate');
jest.mock('../../shared/components/flyout_header_actions', () => ({
  FlyoutHeaderActions: () => null,
}));

const baseTask = {
  id: 'task-1',
  created_at: '2026-10-27T10:00:00Z',
  sample_filename: 'invoice.pdf',
  sample_hash: 'a'.repeat(64),
  production_endpoint_alert_groups: [],
  diagnostic_endpoint_alert_groups: [],
  production_detection_alert_groups: [],
  last_worker_name: 'detonate.workers.make_summary',
  last_worker_status: 'success',
  tags: [],
} as const;

const makeTask = (overrides: Partial<DetonateTask> = {}): DetonateTask =>
  ({ ...baseTask, ...overrides } as unknown as DetonateTask);

const renderHeader = (task: DetonateTask | undefined) =>
  render(
    <I18nProvider>
      <Header
        taskId="task-1"
        task={task}
        selectedTabId="overview"
        setSelectedTabId={jest.fn()}
        tabs={[]}
      />
    </I18nProvider>
  );

describe('<Header />', () => {
  beforeEach(() => {
    jest
      .mocked(useDetonationTaskUpdates)
      .mockReturnValue({ data: undefined } as ReturnType<typeof useDetonationTaskUpdates>);
  });

  it('renders the file name and no meta cards until the run has loaded', () => {
    renderHeader(undefined);

    expect(screen.getByTestId(DETONATION_DETAILS_TITLE_TEST_ID)).toHaveTextContent('task-1');
    expect(screen.queryByTestId(DETONATION_DETAILS_META_STATUS_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders status, verdict with confidence, alert count and duration for a finished run', () => {
    const task = makeTask({
      production_endpoint_alerts_count: 2,
      production_endpoint_alert_groups: [
        { event_code: 'proc-1', alerts_count: 1 },
        { event_code: 'proc-2', alerts_count: 1 },
      ],
    } as Partial<DetonateTask>);
    jest.mocked(useDetonationTaskUpdates).mockReturnValue({
      data: [{ task, timestamp: '2026-10-27T10:02:05Z' }],
    } as ReturnType<typeof useDetonationTaskUpdates>);

    renderHeader(task);

    expect(screen.getByTestId(DETONATION_DETAILS_META_STATUS_TEST_ID)).toBeInTheDocument();
    expect(screen.getByTestId(DETONATION_DETAILS_META_VERDICT_TEST_ID)).toHaveTextContent(
      /malicious/i
    );
    expect(screen.getByTestId(DETONATION_DETAILS_META_ALERTS_TEST_ID)).toHaveTextContent('2');
    expect(screen.getByTestId(DETONATION_DETAILS_META_DURATION_TEST_ID)).toHaveTextContent(
      '2m 05s'
    );
  });

  it('shows dashes for verdict, alerts and duration while the run is in flight', () => {
    renderHeader(
      makeTask({
        last_worker_name: 'detonate.workers.start_vm',
        last_worker_status: 'started',
      })
    );

    expect(screen.getByTestId(DETONATION_DETAILS_META_VERDICT_TEST_ID)).toHaveTextContent('—');
    expect(screen.getByTestId(DETONATION_DETAILS_META_ALERTS_TEST_ID)).toHaveTextContent('—');
    expect(screen.getByTestId(DETONATION_DETAILS_META_DURATION_TEST_ID)).toHaveTextContent('—');
  });
});

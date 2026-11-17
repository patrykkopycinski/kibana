/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { FLYOUT_ORIGIN } from '../../../common/lib/telemetry';
import { useFlyoutApi } from '../../use_flyout_api';
import { useUserPrivileges } from '../../../common/components/user_privileges';
import { createFlyoutApiMock } from '../../use_flyout_api.mock';
import type { DetonateTask } from '../../../../common/detonate_prototype';
import { useDetonationTaskUpdates } from '../../../detonate_prototype/hooks/use_detonate';
import { Header } from './header';
import { FLYOUT_V2_DOCUMENT_PAGINATION_TEST_ID } from '../../document/main/components/test_ids';
import { PaginationStoreProvider } from '../../document/pagination/context';
import { createPaginationStore } from '../../document/pagination/store';
import {
  DETONATION_DETAILS_META_ALERTS_TEST_ID,
  DETONATION_DETAILS_META_DURATION_TEST_ID,
  DETONATION_DETAILS_META_STATUS_TEST_ID,
  DETONATION_DETAILS_META_VERDICT_TEST_ID,
  DETONATION_DETAILS_OPEN_NOTES_TEST_ID,
  DETONATION_DETAILS_OPEN_SESSION_VIEW_TEST_ID,
  DETONATION_DETAILS_TITLE_TEST_ID,
} from './test_ids';

jest.mock('../../../detonate_prototype/hooks/use_detonate');
jest.mock('../../use_flyout_api');
jest.mock('../../../common/components/user_privileges');
jest.mock('../../shared/components/flyout_header_actions', () => ({
  FlyoutHeaderActions: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
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

const renderHeaderWithStore = (store: ReturnType<typeof createPaginationStore>) =>
  render(
    <PaginationStoreProvider value={store}>
      <I18nProvider>
        <Header
          taskId="task-1"
          task={makeTask()}
          selectedTabId="overview"
          setSelectedTabId={jest.fn()}
          tabs={[]}
        />
      </I18nProvider>
    </PaginationStoreProvider>
  );

describe('<Header />', () => {
  const flyoutApi = createFlyoutApiMock();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useFlyoutApi).mockReturnValue(flyoutApi);
    jest.mocked(useUserPrivileges).mockReturnValue({
      notesPrivileges: { read: true },
    } as ReturnType<typeof useUserPrivileges>);
    jest
      .mocked(useDetonationTaskUpdates)
      .mockReturnValue({ data: undefined } as ReturnType<typeof useDetonationTaskUpdates>);
  });

  it('falls back to the task id and shows no meta cards until the run has loaded', () => {
    renderHeader(undefined);

    expect(screen.getByTestId(DETONATION_DETAILS_TITLE_TEST_ID)).toHaveTextContent('task-1');
    expect(screen.queryByTestId(DETONATION_DETAILS_META_STATUS_TEST_ID)).not.toBeInTheDocument();
  });

  it('titles the flyout with the sample file name once the run has loaded', () => {
    renderHeader(makeTask());

    expect(screen.getByTestId(DETONATION_DETAILS_TITLE_TEST_ID)).toHaveTextContent('invoice.pdf');
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

  describe('tool openers', () => {
    it('opens Session View for the run from the header', () => {
      const task = makeTask();
      renderHeader(task);

      fireEvent.click(screen.getByTestId(DETONATION_DETAILS_OPEN_SESSION_VIEW_TEST_ID));

      expect(flyoutApi.openDetonationSessionView).toHaveBeenCalledWith({
        task,
        origin: FLYOUT_ORIGIN.FLYOUT_HEADER,
      });
    });

    it('offers no Session View button until the run has loaded', () => {
      renderHeader(undefined);

      expect(
        screen.queryByTestId(DETONATION_DETAILS_OPEN_SESSION_VIEW_TEST_ID)
      ).not.toBeInTheDocument();
    });

    it('opens Notes with the loaded run', () => {
      const task = makeTask();
      renderHeader(task);

      fireEvent.click(screen.getByTestId(DETONATION_DETAILS_OPEN_NOTES_TEST_ID));

      expect(flyoutApi.openDetonationNotes).toHaveBeenCalledWith({
        task,
        origin: FLYOUT_ORIGIN.FLYOUT_HEADER,
      });
    });

    it('offers no Notes button without the notes read privilege', () => {
      jest.mocked(useUserPrivileges).mockReturnValue({
        notesPrivileges: { read: false },
      } as ReturnType<typeof useUserPrivileges>);
      renderHeader(makeTask());

      expect(screen.queryByTestId(DETONATION_DETAILS_OPEN_NOTES_TEST_ID)).not.toBeInTheDocument();
    });

    it('offers no Notes button until the run has loaded', () => {
      renderHeader(undefined);

      expect(screen.queryByTestId(DETONATION_DETAILS_OPEN_NOTES_TEST_ID)).not.toBeInTheDocument();
    });
  });

  describe('run pagination', () => {
    it('renders no pager when the flyout was not opened from the table', () => {
      renderHeader(makeTask());

      expect(screen.queryByTestId(FLYOUT_V2_DOCUMENT_PAGINATION_TEST_ID)).not.toBeInTheDocument();
    });

    it('renders no pager for a single run', () => {
      const store = createPaginationStore();
      act(() => store.setState({ flyoutDocumentIndex: 0, totalDocumentCount: 1 }));
      renderHeaderWithStore(store);

      expect(screen.queryByTestId(FLYOUT_V2_DOCUMENT_PAGINATION_TEST_ID)).not.toBeInTheDocument();
    });

    it('shows the position in the table and opens the neighbouring runs', () => {
      const store = createPaginationStore();
      const openDocumentFlyoutImpl = jest.fn();
      act(() =>
        store.setState({ flyoutDocumentIndex: 1, totalDocumentCount: 3, openDocumentFlyoutImpl })
      );
      renderHeaderWithStore(store);

      const pager = screen.getByTestId(FLYOUT_V2_DOCUMENT_PAGINATION_TEST_ID);
      expect(pager).toHaveTextContent('2 of 3');

      fireEvent.click(pager.querySelector('[data-test-subj="pagination-button-next"]') as Element);
      expect(openDocumentFlyoutImpl).toHaveBeenLastCalledWith(2);
      fireEvent.click(
        pager.querySelector('[data-test-subj="pagination-button-previous"]') as Element
      );
      expect(openDocumentFlyoutImpl).toHaveBeenLastCalledWith(0);
    });
  });
});

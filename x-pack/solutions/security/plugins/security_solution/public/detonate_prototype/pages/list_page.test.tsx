/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * List page tests: the runs table (columns, quick filters, search, row click), the
 * "Submit sample" button owning the submit modal, an alert hand-off URL opening it
 * prefilled, and a successful submit closing it and toasting a link to the result.
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { MemoryRouter, Route } from '@kbn/shared-ux-router';
import { useHistory } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';

import type {
  DetonateTask,
  DetonationRecord,
  DetonationRunGroup,
} from '../../../common/detonate_prototype';
import { useKibana } from '../../common/lib/kibana';
import { useFlyoutApi } from '../../flyout_v2/use_flyout_api';
import { useQueryAlerts } from '../../detections/containers/detection_engine/alerts/use_query';
import { useSignalIndexName } from '../../data_view_manager/hooks/use_signal_index_name';
import {
  useDetonateHealthcheck,
  useDetonationOriginAlertIds,
  useDetonationRunGroups,
  useDetonationRuns,
  useDetonationRunStats,
  useDetonationTask,
} from '../hooks/use_detonate';
import type { SubmitModal as SubmitModalType } from '../components/submit_modal';
import {
  DetonateListPage,
  FILTER_ERROR_TEST_ID,
  GROUPING_ID,
  RUNS_TABLE_TEST_ID,
  SUBMIT_SAMPLE_BUTTON_TEST_ID,
} from './list_page';

type SubmitModalProps = React.ComponentProps<typeof SubmitModalType>;

const mockModalProps = jest.fn<void, [SubmitModalProps]>();

jest.mock('../components/submit_modal', () => ({
  SubmitModal: (props: SubmitModalProps) => {
    mockModalProps(props);
    return (
      <div data-test-subj="mockSubmitModal">
        <input data-test-subj="mockHashInput" defaultValue={props.initialHash ?? ''} />
        <button type="button" data-test-subj="mockCancel" onClick={props.onClose} />
      </div>
    );
  },
}));
jest.mock('../../common/lib/kibana');
jest.mock('../../flyout_v2/use_flyout_api');
jest.mock('../hooks/use_detonate');
jest.mock('../../detections/containers/detection_engine/alerts/use_query');
jest.mock('../../data_view_manager/hooks/use_signal_index_name');
jest.mock('@kbn/cell-actions', () => ({
  CellActionsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@kbn/discover-utils', () => ({
  ...jest.requireActual('@kbn/discover-utils'),
  // Discover's real doc id is `index::id::routing`, not the bare `_id`; the table must not rely on it.
  buildDataTableRecord: (raw: unknown) => ({
    id: `${(raw as { _index: string })._index}::${(raw as { _id: string })._id}::`,
    raw,
    flattened: {},
  }),
}));
jest.mock('../../common/lib/cell_actions/helpers', () => ({ EmptyComponent: () => null }));

interface MockTableProps {
  columns: string[];
  rows: Array<{ raw: { _id: string } }>;
  totalHits: number;
  sort: string[][];
  setExpandedDoc: (record: unknown) => void;
  onSort: (sort: string[][]) => void;
  onFetchMoreRecords: () => void;
  sampleSizeState: number;
  ariaLabelledBy: string;
  rowsPerPageState: number;
  externalCustomRenderers: Record<string, (props: { rowIndex: number }) => React.ReactNode>;
}
const mockTable = jest.fn<void, [MockTableProps]>();
const mockUseColumns = jest.fn();

// The real grid needs a browser layout; the mock renders each default column's cell renderer.
jest.mock('@kbn/unified-data-table', () => ({
  DataLoadingState: { loading: 'loading', loadingMore: 'loadingMore', loaded: 'loaded' },
  useColumns: (args: unknown) => mockUseColumns(args),
  UnifiedDataTable: (rawProps: Record<string, unknown>) => {
    const props = rawProps as unknown as MockTableProps;
    mockTable(props);
    // The footer is the real one, wired as data_table.tsx wires it, so Load more reachability is
    // decided by the props the page passes. The package does not export the footer.
    const { UnifiedDataTableFooter } = jest.requireActual(
      '@kbn/unified-data-table/src/components/data_table_footer'
    );
    const rowCount = props.rows.length;
    const timefilter = {
      getRefreshInterval: () => ({ pause: true, value: 0 }),
      getRefreshIntervalUpdate$: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
    };
    return (
      <div data-test-subj="mockTable">
        {/* Capped: the load-more window test passes ~10k rows, and rendering them all exhausts the heap. */}
        {props.rows.slice(0, 100).map((row, rowIndex) => (
          <div key={row.raw._id} data-test-subj={`mockRow-${rowIndex}`}>
            {props.columns.map((column) => (
              <div key={column} data-test-subj={`mockCell-${rowIndex}-${column}`}>
                {props.externalCustomRenderers[column]?.({ rowIndex })}
              </div>
            ))}
          </div>
        ))}
        <UnifiedDataTableFooter
          isLoadingMore={false}
          rowCount={rowCount}
          sampleSize={props.sampleSizeState}
          pageCount={Math.ceil(rowCount / props.rowsPerPageState)}
          pageIndex={Math.ceil(rowCount / props.rowsPerPageState) - 1}
          totalHits={props.totalHits}
          onFetchMoreRecords={props.onFetchMoreRecords}
          data={{ query: { timefilter: { timefilter } } }}
          fieldFormats={{ getDefaultInstance: () => ({ convertToText: String }) }}
          paginationMode="multiPage"
          hasScrolledToBottom
        />
      </div>
    );
  },
}));
jest.mock('@kbn/react-kibana-mount', () => ({
  toMountPoint: jest.fn((node: React.ReactNode) => node),
}));

interface MockSearchBarProps {
  query: { query: string; language: string };
  disableQueryLanguageSwitcher?: boolean;
  indexPatterns: Array<{ id?: string }>;
  dateRangeFrom: string;
  dateRangeTo: string;
  onQuerySubmit: (
    payload: { dateRange: { from: string; to: string }; query?: { query: string } },
    isUpdated?: boolean
  ) => void;
}
const mockSearchBar = jest.fn<void, [MockSearchBarProps]>();
const MockSearchBar = (props: object) => {
  mockSearchBar(props as MockSearchBarProps);
  return <div data-test-subj="mockSearchBar" />;
};
const lastSearchBarProps = () => mockSearchBar.mock.calls[mockSearchBar.mock.calls.length - 1][0];

const addSuccess = jest.fn();
const createDataView = jest.fn();
const getActiveSpace = jest.fn();
const addError = jest.fn();
const openDetonationFlyout = jest.fn();
const fetchNextPage = jest.fn();
const refetch = jest.fn();
const statsRefetch = jest.fn();

const DEFAULT_COLUMN_IDS = [
  '@timestamp',
  'file.name',
  'detonate.verdict',
  'detonate.alerts.total',
  'detonate.vm.os_family',
  'detonate.state',
  'detonate.source',
  'tags',
];

const makeRun = (overrides: Partial<DetonationRecord> = {}): DetonationRecord =>
  ({
    '@timestamp': '2026-10-27T10:00:00Z',
    'detonate.doc_kind': 'run',
    'detonate.task_id': 'run-1',
    'detonate.state': 'complete',
    'detonate.verdict': 'malicious',
    'detonate.alerts.total': 3,
    'file.name': 'evil.exe',
    'file.hash.sha256': 'c'.repeat(64),
    'detonate.vm.os_family': 'windows',
    'detonate.source': 'manual',
    tags: ['alert:1'],
    ...overrides,
  } as DetonationRecord);

const mockRuns = (hits: DetonationRecord[], overrides: Record<string, unknown> = {}) =>
  jest.mocked(useDetonationRuns).mockReturnValue({
    data: { pages: [{ hits, total: hits.length }] },
    isLoading: false,
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage,
    ...overrides,
  } as never);

const lastTableProps = () => mockTable.mock.calls[mockTable.mock.calls.length - 1][0];

const mockStats = (overrides: Record<string, unknown> = {}) =>
  jest.mocked(useDetonationRunStats).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: statsRefetch,
    ...overrides,
  } as never);

const lastStatsQuery = () => {
  const { calls } = jest.mocked(useDetonationRunStats).mock;
  return calls[calls.length - 1][0];
};

const lastRunsQuery = () => {
  const { calls } = jest.mocked(useDetonationRuns).mock;
  return calls[calls.length - 1][0];
};

const renderPage = (url = '/detonate_prototype') =>
  render(
    <I18nProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[url]}>
          <Route path="/detonate_prototype">
            <HistoryProbe />
            <DetonateListPage />
          </Route>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>
  );

/** The saved grouping selection @kbn/grouping keeps in the `groups` localStorage key. */
const saveGrouping = (activeGroups: string[]) =>
  window.localStorage.setItem(
    'groups',
    JSON.stringify({ [GROUPING_ID]: { activeGroups, options: [] } })
  );

const makeGroup = (overrides: Partial<DetonationRunGroup> = {}): DetonationRunGroup => ({
  key: 'run-1',
  runCount: 1,
  verdicts: { malicious: 1, benign: 0, inconclusive: 0, unknown: 0 },
  states: { running: 0, complete: 1, failed: 0 },
  fileName: 'evil.exe',
  sha256: 'c'.repeat(64),
  alertsTotal: 3,
  ...overrides,
});

const mockGroups = (groups: DetonationRunGroup[]) =>
  jest.mocked(useDetonationRunGroups).mockReturnValue({
    data: { groups, groupsCount: groups.length, runsCount: groups.length },
    isError: false,
    isPreviousData: false,
  } as never);

const lastGroupsQuery = () => {
  const { calls } = jest.mocked(useDetonationRunGroups).mock;
  return calls[calls.length - 1][0];
};

let pushUrl: (url: string) => void = () => {};

const HistoryProbe = () => {
  const history = useHistory();
  pushUrl = (url) => history.push(url);
  return null;
};

const lastModalProps = (): SubmitModalProps => {
  const { calls } = mockModalProps.mock;
  return calls[calls.length - 1][0];
};

describe('DetonateListPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    createDataView.mockResolvedValue({ id: 'runs-data-view', fields: [] });
    getActiveSpace.mockResolvedValue({ id: 'sandbox' });
    jest.mocked(useKibana).mockReturnValue({
      services: {
        notifications: { toasts: { addSuccess, addError } },
        dataViews: { create: createDataView },
        spaces: { getActiveSpace },
        uiSettings: { get: jest.fn() },
        uiActions: { getTriggerCompatibleActions: jest.fn() },
        application: { capabilities: {} },
        theme: {},
        fieldFormats: {},
        storage: {},
        data: {},
        unifiedSearch: { ui: { SearchBar: MockSearchBar } },
      },
    } as never);
    mockUseColumns.mockReturnValue({
      columns: DEFAULT_COLUMN_IDS,
      onSetColumns: jest.fn(),
    });
    jest.mocked(useFlyoutApi).mockReturnValue({ openDetonationFlyout } as never);
    jest.mocked(useDetonateHealthcheck).mockReturnValue({ isError: false } as never);
    mockRuns([]);
    mockStats();
    mockGroups([]);
    jest.mocked(useDetonationTask).mockReturnValue({ data: undefined, isLoading: true } as never);
    jest.mocked(useDetonationOriginAlertIds).mockReturnValue({ data: undefined } as never);
    jest.mocked(useSignalIndexName).mockReturnValue('.alerts-security.alerts-default');
    jest
      .mocked(useQueryAlerts)
      .mockReturnValue({ loading: false, data: null, refetch: null } as never);
    // The runs table tests below are about the flat table; grouping has its own describe.
    saveGrouping(['none']);
  });

  describe('group by', () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    it('groups by Detonation by default and shows no flat table', async () => {
      mockGroups([makeGroup()]);
      mockRuns([makeRun()]);
      renderPage();

      expect(await screen.findByTestId('level-0-group-0')).toBeInTheDocument();
      expect(lastGroupsQuery()).toMatchObject({ group_by: 'detonate.task_id' });
      expect(screen.queryByTestId('mockTable')).not.toBeInTheDocument();
      expect(
        jest.mocked(useDetonationRuns).mock.calls.every(([, options]) => !options?.enabled)
      ).toBe(true);
    });

    it('shows the verdict, the sample and the alert count in a Detonation header', async () => {
      mockGroups([makeGroup()]);
      renderPage();

      const header = await screen.findByTestId('level-0-group-0');

      expect(header).toHaveTextContent(/malicious/i);
      expect(screen.getByTestId('detonatePrototypeGroupOpenDetonation')).toHaveTextContent(
        'evil.exe'
      );
      expect(header).toHaveTextContent('3');
    });

    it('opens the result flyout from the header link without opening the group', async () => {
      mockGroups([makeGroup()]);
      renderPage();

      fireEvent.click(await screen.findByTestId('detonatePrototypeGroupOpenDetonation'));

      expect(openDetonationFlyout).toHaveBeenCalledWith({ taskId: 'run-1' });
      expect(screen.queryByTestId('detonatePrototypeGroupBodyLoading')).not.toBeInTheDocument();
    });

    describe('originating alerts', () => {
      const openGroup = async (originAlertIds: string[] = ['alert-1', 'alert-2']) => {
        mockGroups([makeGroup()]);
        jest.mocked(useDetonationTask).mockReturnValue({
          data: {
            production_endpoint_alert_groups: [],
            production_detection_alert_groups: [],
            diagnostic_endpoint_alert_groups: [],
          },
          isLoading: false,
        } as never);
        jest.mocked(useDetonationOriginAlertIds).mockReturnValue({ data: originAlertIds } as never);
        renderPage();
        return screen.findByTestId('group-panel-toggle');
      };
      const fetchesAlerts = () =>
        jest.mocked(useQueryAlerts).mock.calls.some(([params]) => !params.skip);

      it('reads nothing while the group is collapsed', async () => {
        await openGroup();

        expect(useDetonationOriginAlertIds).not.toHaveBeenCalled();
        expect(useQueryAlerts).not.toHaveBeenCalled();
        expect(screen.queryByTestId('detonatePrototypeOriginatingAlerts')).not.toBeInTheDocument();
      });

      it('reads the origin alerts of that Detonation once the group is expanded', async () => {
        fireEvent.click(await openGroup());

        expect(await screen.findByTestId('detonatePrototypeOriginatingAlerts')).toBeInTheDocument();
        expect(useDetonationOriginAlertIds).toHaveBeenCalledWith('run-1');
        expect(fetchesAlerts()).toBe(true);
        expect(jest.mocked(useQueryAlerts).mock.lastCall?.[0].query).toMatchObject({
          query: { ids: { values: ['alert-1', 'alert-2'] } },
        });
      });

      it('says the originating alert is not available when its ids could not be read', async () => {
        await openGroup();
        jest
          .mocked(useDetonationOriginAlertIds)
          .mockReturnValue({ data: undefined, isError: true } as never);
        fireEvent.click(await screen.findByTestId('group-panel-toggle'));

        expect(
          await screen.findByTestId('detonatePrototypeOriginatingAlertsUnavailable')
        ).toHaveTextContent('Originating alert not available');
        expect(screen.queryByTestId('detonatePrototypeOriginatingAlerts')).not.toBeInTheDocument();
        expect(await screen.findByTestId('detonatePrototypeGroupBody')).toBeInTheDocument();
      });

      it('shows no section for a Detonation that did not come from an alert', async () => {
        fireEvent.click(await openGroup([]));

        expect(await screen.findByTestId('detonatePrototypeGroupBody')).toBeInTheDocument();
        expect(screen.queryByTestId('detonatePrototypeOriginatingAlerts')).not.toBeInTheDocument();
      });
    });

    it('shows the flat table when grouping is None', async () => {
      saveGrouping(['none']);
      mockRuns([makeRun()]);
      renderPage();

      expect(await screen.findByTestId('mockTable')).toBeInTheDocument();
      expect(screen.queryByTestId('level-0-group-0')).not.toBeInTheDocument();
    });

    it('expands a non-Detonation group to the runs table narrowed to that group', async () => {
      saveGrouping(['detonate.verdict']);
      mockGroups([makeGroup({ key: 'malicious', runCount: 2 })]);
      mockRuns([makeRun()]);
      renderPage();

      fireEvent.click(await screen.findByTestId('group-panel-toggle'));

      expect(await screen.findByTestId('detonatePrototypeGroupRuns')).toBeInTheDocument();
      expect(await screen.findByTestId('mockTable')).toBeInTheDocument();
      expect(lastRunsQuery().kql).toBe('detonate.verdict:"malicious"');
    });

    it("keeps the page's KQL inside the group's filter, so an `or` cannot escape the group", async () => {
      saveGrouping(['detonate.verdict']);
      mockGroups([makeGroup({ key: 'malicious', runCount: 2 })]);
      mockRuns([makeRun()]);
      renderPage();
      await screen.findByTestId('group-panel-toggle');
      act(() =>
        lastSearchBarProps().onQuerySubmit(
          {
            dateRange: { from: 'now-7d', to: 'now-1h' },
            query: { query: 'file.name:a or file.name:b' },
          },
          true
        )
      );

      fireEvent.click(await screen.findByTestId('group-panel-toggle'));
      await screen.findByTestId('mockTable');

      expect(lastRunsQuery().kql).toBe(
        '(file.name:a or file.name:b) and (detonate.verdict:"malicious")'
      );
    });

    it('narrows a runs group that has no value to the runs without one', async () => {
      saveGrouping(['host.name']);
      mockGroups([makeGroup({ key: null })]);
      mockRuns([makeRun()]);
      renderPage();

      fireEvent.click(await screen.findByTestId('group-panel-toggle'));
      await screen.findByTestId('mockTable');

      expect(lastRunsQuery().kql).toBe('not host.name:*');
    });

    it('nests a second level under the first and applies the parent as a filter', async () => {
      saveGrouping(['detonate.source', 'host.name']);
      mockGroups([makeGroup({ key: 'manual' })]);
      renderPage();

      fireEvent.click(await screen.findByTestId('group-panel-toggle'));

      await waitFor(() =>
        expect(lastGroupsQuery()).toMatchObject({
          group_by: 'host.name',
          parents: JSON.stringify([{ field: 'detonate.source', value: 'manual' }]),
        })
      );
    });

    it('sends the table filters with the group query', async () => {
      mockGroups([makeGroup()]);
      renderPage();
      await screen.findByTestId('level-0-group-0');

      expect(lastGroupsQuery()).toMatchObject({ start: 'now-30d', end: 'now' });
    });
  });

  describe('search bar', () => {
    it("builds the data view on the active space's results index, not the all-spaces pattern", async () => {
      renderPage();
      await screen.findByTestId('mockSearchBar');
      await waitFor(() => expect(lastSearchBarProps().indexPatterns).toHaveLength(1));

      expect(createDataView).toHaveBeenCalledTimes(1);
      expect(createDataView.mock.calls[0][0]).toMatchObject({
        title: '.kibana-detonate-results-sandbox',
      });
    });

    it('shows the table skeleton, not a blank table, while the data view resolves', async () => {
      createDataView.mockReturnValue(new Promise(() => {}));
      mockRuns([makeRun({ 'detonate.task_id': 'r1' })]);
      renderPage();

      expect(await screen.findByTestId('detonatePrototypeRunsTable-loading')).toBeInTheDocument();
      expect(screen.queryByTestId('mockTable')).not.toBeInTheDocument();
      expect(screen.queryByTestId('detonatePrototypeRunsTable-data-view-error')).toBeNull();
    });

    it('shows an error, and no skeleton, when the space lookup fails', async () => {
      const failure = new Error('spaces down');
      getActiveSpace.mockRejectedValue(failure);
      mockRuns([makeRun({ 'detonate.task_id': 'r1' })]);
      renderPage();

      expect(
        await screen.findByTestId('detonatePrototypeRunsTable-data-view-error')
      ).toBeInTheDocument();
      expect(screen.queryByTestId('detonatePrototypeRunsTable-loading')).toBeNull();
      expect(addError).toHaveBeenCalledWith(failure, {
        title: 'Could not set up the Detonations table',
      });
      expect(createDataView).not.toHaveBeenCalled();
    });

    it('shows the same error when the data view cannot be created', async () => {
      createDataView.mockRejectedValue(new Error('no data view'));
      mockRuns([makeRun({ 'detonate.task_id': 'r1' })]);
      renderPage();

      expect(
        await screen.findByTestId('detonatePrototypeRunsTable-data-view-error')
      ).toBeInTheDocument();
    });

    it('keeps the query language fixed to KQL', async () => {
      renderPage();
      await screen.findByTestId('mockSearchBar');

      expect(lastSearchBarProps().disableQueryLanguageSwitcher).toBe(true);
    });
  });

  describe('load more', () => {
    const mockPages = (count: number) =>
      jest.mocked(useDetonationRuns).mockReturnValue({
        data: {
          pages: [
            {
              hits: Array.from({ length: count }, (_, i) =>
                makeRun({ 'detonate.task_id': `r${i}` })
              ),
              total: count + 30,
            },
          ],
        },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        fetchNextPage,
        refetch,
      } as never);

    it('asks for the offset after the loaded rows, not the one getNextPageParam derives', async () => {
      mockPages(80);
      renderPage();
      await screen.findByTestId('mockTable');

      act(() => lastTableProps().onFetchMoreRecords());

      expect(fetchNextPage).toHaveBeenCalledWith({ pageParam: 80 });
    });

    it('shows the footer Load more link for 50 of 80 rows and fetches through it', async () => {
      mockPages(50);
      renderPage();

      fireEvent.click(await screen.findByTestId('dscGridSampleSizeFetchMoreLink'));

      expect(fetchNextPage).toHaveBeenCalledWith({ pageParam: 50 });
    });

    it('refetches instead of appending another page when the last page is empty', async () => {
      const run = (i: number) => makeRun({ 'detonate.task_id': `r${i}` });
      jest.mocked(useDetonationRuns).mockReturnValue({
        data: {
          pages: [
            { hits: Array.from({ length: 50 }, (_, i) => run(i)), total: 120 },
            { hits: Array.from({ length: 50 }, (_, i) => run(50 + i)), total: 120 },
            { hits: [], total: 120 },
          ],
        },
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        fetchNextPage,
        refetch,
      } as never);
      renderPage();

      fireEvent.click(await screen.findByTestId('dscGridSampleSizeFetchMoreLink'));

      expect(refetch).toHaveBeenCalledTimes(1);
      expect(fetchNextPage).not.toHaveBeenCalled();
      const { refetchPage } = refetch.mock.calls[0][0];
      const allPages = [{}, {}, {}];
      expect(refetchPage({}, 0, allPages)).toBe(true);
      expect(refetchPage({}, 1, allPages)).toBe(false);
      expect(refetchPage({}, 2, allPages)).toBe(true);
    });

    it('does not fetch when the next page would pass the result window', async () => {
      mockPages(9980);
      renderPage();
      await screen.findByTestId('mockTable');

      act(() => lastTableProps().onFetchMoreRecords());

      expect(fetchNextPage).not.toHaveBeenCalled();
    });
  });

  describe('runs table', () => {
    it('shows the empty prompt when there are no runs', () => {
      renderPage();

      expect(screen.getByTestId(RUNS_TABLE_TEST_ID)).toHaveTextContent(/no/i);
      expect(screen.queryByTestId('mockTable')).not.toBeInTheDocument();
    });

    it('names the grid after the page title element', async () => {
      mockRuns([makeRun()]);
      renderPage();
      await screen.findByTestId('mockTable');

      const { ariaLabelledBy } = lastTableProps();

      expect(ariaLabelledBy).toBeTruthy();
      expect(document.getElementById(ariaLabelledBy)).toHaveTextContent('Detonations');
    });

    it('asks for the default columns and renders sample, verdict, alerts and status per run', async () => {
      mockRuns([makeRun()]);
      renderPage();

      expect(await screen.findByTestId('mockTable')).toBeInTheDocument();
      expect(mockTable.mock.calls[0][0].columns).toEqual(DEFAULT_COLUMN_IDS);
      expect(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-link`)).toHaveTextContent('evil.exe');
      expect(screen.getByTestId(`mockCell-0-detonate.verdict`)).toHaveTextContent(/malicious/i);
      expect(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-alerts`)).toHaveTextContent('3');
      expect(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-copyHash`)).toBeInTheDocument();
      expect(screen.getByTestId('mockCell-0-tags')).toHaveTextContent('alert:1');
    });

    it('falls back to the hash when the sample has no name', async () => {
      mockRuns([makeRun({ 'file.name': undefined })]);
      renderPage();

      expect(await screen.findByTestId(`${RUNS_TABLE_TEST_ID}-link`)).toHaveTextContent(
        'c'.repeat(64)
      );
    });

    it('opens the run flyout paged over the loaded rows when a sample is clicked', async () => {
      mockRuns([
        makeRun({ 'detonate.task_id': 'run-1' }),
        makeRun({ 'detonate.task_id': 'run-2', 'file.name': 'second.exe' }),
      ]);
      renderPage();

      const links = await screen.findAllByTestId(`${RUNS_TABLE_TEST_ID}-link`);
      fireEvent.click(links[1]);

      expect(openDetonationFlyout).toHaveBeenCalledWith({
        taskId: 'run-2',
        pagination: { taskIds: ['run-1', 'run-2'] },
      });
    });

    it('shows the service error, not the empty prompt, when the runs cannot be loaded', () => {
      mockRuns([], {
        data: undefined,
        isError: true,
        error: new Error('runs search exploded'),
      });
      renderPage();

      expect(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-error`)).toHaveTextContent(
        'runs search exploded'
      );
      expect(screen.getByTestId(RUNS_TABLE_TEST_ID)).not.toHaveTextContent(/no detonations yet/i);
    });

    it('keeps the loaded table when a later poll fails', async () => {
      mockRuns([makeRun()], { isError: true, error: new Error('poll failed') });
      renderPage();

      expect(await screen.findByTestId('mockTable')).toBeInTheDocument();
      expect(screen.queryByTestId(`${RUNS_TABLE_TEST_ID}-error`)).not.toBeInTheDocument();
    });

    it('opens the flyout for the row the grid expands', async () => {
      mockRuns([makeRun({ 'detonate.task_id': 'run-1' })]);
      renderPage();
      await screen.findByTestId('mockTable');

      act(() => {
        const { rows, setExpandedDoc } = lastTableProps();
        setExpandedDoc(rows[0]);
      });

      expect(openDetonationFlyout).toHaveBeenCalledWith({
        taskId: 'run-1',
        pagination: { taskIds: ['run-1'] },
      });
    });

    it.each([
      ['in_progress', 'detonate.state:running'],
      ['malicious', 'detonate.verdict:malicious'],
      ['needs_attention', 'detonate.state:failed or detonate.verdict:inconclusive'],
    ])('the %s preset queries with KQL', (preset, kql) => {
      renderPage();
      expect(lastRunsQuery().kql).toBeUndefined();

      fireEvent.click(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-preset-${preset}`));
      expect(lastRunsQuery().kql).toBe(kql);

      fireEvent.click(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-preset-all`));
      expect(lastRunsQuery().kql).toBeUndefined();
    });

    it('keeps the unfiltered empty message when no filter is active', () => {
      renderPage();

      expect(screen.getByTestId(RUNS_TABLE_TEST_ID)).toHaveTextContent(/No detonations yet/);
      expect(screen.queryByTestId(`${RUNS_TABLE_TEST_ID}-no-match`)).not.toBeInTheDocument();
    });

    it('says no detonations match when a preset is active and nothing is found', () => {
      renderPage();

      fireEvent.click(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-preset-malicious`));

      expect(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-no-match`)).toHaveTextContent(
        'No detonations match these filters'
      );
      expect(screen.getByTestId(RUNS_TABLE_TEST_ID)).not.toHaveTextContent(/No detonations yet/);
    });

    it('says no detonations match when a free text search finds nothing, and clears it', () => {
      renderPage();
      const input = screen.getByTestId('detonatePrototypeRunsSearch');
      fireEvent.change(input, { target: { value: 'evil' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
      expect(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-no-match`)).toBeInTheDocument();

      fireEvent.click(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-clear-filters`));

      expect(lastRunsQuery().search).toBeUndefined();
      expect(lastRunsQuery().kql).toBeUndefined();
      expect(screen.queryByTestId(`${RUNS_TABLE_TEST_ID}-no-match`)).not.toBeInTheDocument();
      expect(screen.getByTestId('detonatePrototypeRunsSearch')).toHaveValue('');
    });

    it('passes the free text search to the runs query, trimmed', () => {
      renderPage();

      const input = screen.getByTestId('detonatePrototypeRunsSearch');
      fireEvent.change(input, { target: { value: '  evil  ' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });

      expect(lastRunsQuery().search).toBe('evil');
    });

    describe('time range and KQL bar', () => {
      const submit = (kql: string, isUpdated = true) =>
        act(() =>
          lastSearchBarProps().onQuerySubmit(
            { dateRange: { from: 'now-7d', to: 'now-1h' }, query: { query: kql } },
            isUpdated
          )
        );

      it('starts at the last 30 days with no KQL, on the table and the panels alike', () => {
        renderPage();

        expect(lastRunsQuery()).toEqual(expect.objectContaining({ start: 'now-30d', end: 'now' }));
        expect(lastStatsQuery()).toEqual({ start: 'now-30d', end: 'now' });
      });

      it('sends a submitted time range and KQL to the runs and the stats alike', () => {
        renderPage();

        submit('detonate.verdict:benign');

        expect(lastRunsQuery()).toEqual(
          expect.objectContaining({
            start: 'now-7d',
            end: 'now-1h',
            kql: 'detonate.verdict:benign',
          })
        );
        expect(lastStatsQuery()).toEqual({
          start: 'now-7d',
          end: 'now-1h',
          kql: 'detonate.verdict:benign',
        });
        expect(lastSearchBarProps()).toEqual(
          expect.objectContaining({
            dateRangeFrom: 'now-7d',
            dateRangeTo: 'now-1h',
            query: { query: 'detonate.verdict:benign', language: 'kuery' },
          })
        );
      });

      it('ANDs the quick filter with the KQL, each part in parentheses', () => {
        renderPage();

        fireEvent.click(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-preset-needs_attention`));
        submit('host.name:a or host.name:b');

        const expected =
          '(detonate.state:failed or detonate.verdict:inconclusive) and (host.name:a or host.name:b)';
        expect(lastRunsQuery().kql).toBe(expected);
        expect(lastStatsQuery().kql).toBe(expected);
      });

      it('refetches the runs and the stats when the bar is submitted unchanged', () => {
        mockRuns([], { refetch });
        renderPage();
        refetch.mockClear();

        submit('', false);

        expect(refetch).toHaveBeenCalledTimes(1);
        expect(statsRefetch).toHaveBeenCalledTimes(1);
        expect(lastRunsQuery()).toEqual(expect.objectContaining({ start: 'now-30d' }));
      });

      it('sends KQL that does not parse alone by itself, so it cannot widen the preset', () => {
        renderPage();
        fireEvent.click(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-preset-malicious`));
        expect(lastRunsQuery().kql).toBe('detonate.verdict:malicious');

        submit('file.name:a) or (file.name:b');

        // Combined it would parse as `(detonate.verdict:malicious) and (file.name:a) or (file.name:b)`.
        expect(lastRunsQuery().kql).toBe('file.name:a) or (file.name:b');
        expect(lastStatsQuery().kql).toBe('file.name:a) or (file.name:b');
      });

      it('still combines balanced KQL with the preset, each in parentheses', () => {
        renderPage();
        fireEvent.click(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-preset-malicious`));

        submit('file.name:a or file.name:b');

        expect(lastRunsQuery().kql).toBe(
          '(detonate.verdict:malicious) and (file.name:a or file.name:b)'
        );
      });

      it('clears the KQL, with the other filters', () => {
        renderPage();
        submit('detonate.verdict:benign');
        expect(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-no-match`)).toBeInTheDocument();

        fireEvent.click(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-clear-filters`));

        expect(lastRunsQuery().kql).toBeUndefined();
        expect(lastStatsQuery().kql).toBeUndefined();
        expect(lastSearchBarProps().query.query).toBe('');
      });

      it('shows a rejected KQL once, above the panels, and not as a table error', () => {
        const rejected = {
          response: { status: 400 },
          body: { message: 'Invalid KQL: Expected "(" at column 3' },
        };
        mockRuns([], { data: undefined, isError: true, error: rejected });
        mockStats({ data: undefined, isError: true, error: rejected });
        renderPage();

        const callouts = screen.getAllByTestId(FILTER_ERROR_TEST_ID);
        expect(callouts).toHaveLength(1);
        expect(callouts[0]).toHaveTextContent('Invalid KQL: Expected "(" at column 3');
        expect(screen.queryByTestId(`${RUNS_TABLE_TEST_ID}-error`)).not.toBeInTheDocument();
      });

      it.each([401, 403, 404, 429])(
        'shows a %i as an ordinary error: no filter callout, the table and panel errors stay',
        (status) => {
          const failure = { response: { status }, body: { message: `denied ${status}` } };
          mockRuns([], { data: undefined, isError: true, error: failure });
          mockStats({ data: undefined, isError: true, error: failure });
          renderPage();

          expect(screen.queryByTestId(FILTER_ERROR_TEST_ID)).not.toBeInTheDocument();
          expect(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-error`)).toHaveTextContent(
            `denied ${status}`
          );
        }
      );

      it('shows no filter callout for a server failure, which stays a table error', () => {
        mockRuns([], { data: undefined, isError: true, error: new Error('runs search exploded') });
        renderPage();

        expect(screen.queryByTestId(FILTER_ERROR_TEST_ID)).not.toBeInTheDocument();
        expect(screen.getByTestId(`${RUNS_TABLE_TEST_ID}-error`)).toHaveTextContent(
          'runs search exploded'
        );
      });
    });

    it('sorts newest first by default and applies a header sort on an allowlisted field', async () => {
      mockRuns([makeRun()]);
      renderPage();
      await screen.findByTestId('mockTable');
      expect(lastRunsQuery()).toEqual(
        expect.objectContaining({ sort_field: '@timestamp', sort_direction: 'desc' })
      );

      act(() => lastTableProps().onSort([['detonate.alerts.total', 'asc']]));
      expect(lastRunsQuery()).toEqual(
        expect.objectContaining({ sort_field: 'detonate.alerts.total', sort_direction: 'asc' })
      );

      act(() => lastTableProps().onSort([['tags', 'asc']]));
      expect(lastRunsQuery()).toEqual(
        expect.objectContaining({ sort_field: 'detonate.alerts.total', sort_direction: 'asc' })
      );
    });

    // The shapes EUI's column action passes: it appends a new column to the current sort.
    describe('header sort as EUI reports it', () => {
      const sortedBy = (field: string, direction: string) =>
        expect.objectContaining({ sort_field: field, sort_direction: direction });

      beforeEach(async () => {
        mockRuns([makeRun()]);
        renderPage();
        await screen.findByTestId('mockTable');
      });

      it('sorts on the column added to the default sort', () => {
        act(() =>
          lastTableProps().onSort([
            ['@timestamp', 'desc'],
            ['detonate.alerts.total', 'desc'],
          ])
        );

        expect(lastRunsQuery()).toEqual(sortedBy('detonate.alerts.total', 'desc'));
      });

      it('flips the direction of the sorted column in place', () => {
        act(() => lastTableProps().onSort([['@timestamp', 'asc']]));

        expect(lastRunsQuery()).toEqual(sortedBy('@timestamp', 'asc'));
      });

      it('falls back to the default sort when the sort is cleared', () => {
        act(() => lastTableProps().onSort([['detonate.alerts.total', 'asc']]));
        act(() => lastTableProps().onSort([]));

        expect(lastRunsQuery()).toEqual(sortedBy('@timestamp', 'desc'));
      });

      it('ignores a newly added column the server cannot sort on', () => {
        act(() =>
          lastTableProps().onSort([
            ['@timestamp', 'desc'],
            ['tags', 'asc'],
          ])
        );

        expect(lastRunsQuery()).toEqual(sortedBy('@timestamp', 'desc'));
      });
    });
  });

  it('keeps the modal closed until "Submit sample" is clicked', () => {
    renderPage();
    expect(screen.queryByTestId('mockSubmitModal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId(SUBMIT_SAMPLE_BUTTON_TEST_ID));

    expect(screen.getByTestId('mockSubmitModal')).toBeInTheDocument();
    expect(lastModalProps()).toEqual(expect.objectContaining({ source: 'detonate_page' }));
  });

  it('opens the modal prefilled when the URL carries a hash and tags', () => {
    renderPage(`/detonate_prototype?sample_hash=${'a'.repeat(64)}&tags=alert:1`);

    expect(screen.getByTestId('mockSubmitModal')).toBeInTheDocument();
    expect(lastModalProps()).toEqual(
      expect.objectContaining({ initialHash: 'a'.repeat(64), initialTags: ['alert:1'] })
    );
  });

  it('opens the modal prefilled when the query string changes while the page is mounted', () => {
    renderPage();
    expect(screen.queryByTestId('mockSubmitModal')).not.toBeInTheDocument();

    act(() => {
      pushUrl(`/detonate_prototype?sample_hash=${'b'.repeat(64)}&tags=alert:2`);
    });

    expect(screen.getByTestId('mockSubmitModal')).toBeInTheDocument();
    expect(lastModalProps()).toEqual(
      expect.objectContaining({ initialHash: 'b'.repeat(64), initialTags: ['alert:2'] })
    );
  });

  it('opens a blank modal from "Submit sample" after the prefilled one was cancelled', () => {
    renderPage(`/detonate_prototype?sample_hash=${'a'.repeat(64)}&tags=alert:1`);
    expect(screen.getByTestId('mockHashInput')).toHaveValue('a'.repeat(64));

    fireEvent.click(screen.getByTestId('mockCancel'));
    expect(screen.queryByTestId('mockSubmitModal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId(SUBMIT_SAMPLE_BUTTON_TEST_ID));

    expect(screen.getByTestId('mockHashInput')).toHaveValue('');
    expect(lastModalProps().initialTags).toBeUndefined();
  });

  it('closes the modal and toasts a result link on a successful submit', () => {
    renderPage();
    fireEvent.click(screen.getByTestId(SUBMIT_SAMPLE_BUTTON_TEST_ID));

    act(() => {
      lastModalProps().onSubmitted({ id: 'task-5' } as DetonateTask);
    });

    expect(screen.queryByTestId('mockSubmitModal')).not.toBeInTheDocument();
    expect(addSuccess).toHaveBeenCalledTimes(1);
  });

  it('closes the modal and opens the run flyout from the prior-run link', () => {
    renderPage();
    fireEvent.click(screen.getByTestId(SUBMIT_SAMPLE_BUTTON_TEST_ID));

    act(() => {
      lastModalProps().onViewTask('run-2');
    });

    expect(screen.queryByTestId('mockSubmitModal')).not.toBeInTheDocument();
    expect(openDetonationFlyout).toHaveBeenCalledWith({ taskId: 'run-2' });
  });
});

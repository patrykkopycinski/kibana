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
import { render, screen, fireEvent, act } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { MemoryRouter, Route } from '@kbn/shared-ux-router';
import { useHistory } from 'react-router-dom';

import type { DetonateTask, DetonationRecord } from '../../../common/detonate_prototype';
import { useKibana } from '../../common/lib/kibana';
import { useFlyoutApi } from '../../flyout_v2/use_flyout_api';
import { useDetonateHealthcheck, useDetonationRuns } from '../hooks/use_detonate';
import type { SubmitModal as SubmitModalType } from '../components/submit_modal';
import { DetonateListPage, RUNS_TABLE_TEST_ID, SUBMIT_SAMPLE_BUTTON_TEST_ID } from './list_page';

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
jest.mock('@kbn/cell-actions', () => ({
  CellActionsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@kbn/discover-utils', () => ({
  ...jest.requireActual('@kbn/discover-utils'),
  buildDataTableRecord: (raw: unknown) => ({
    id: (raw as { _id: string })._id,
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
    return (
      <div data-test-subj="mockTable">
        {props.rows.map((row, rowIndex) => (
          <div key={row.raw._id} data-test-subj={`mockRow-${rowIndex}`}>
            {props.columns.map((column) => (
              <div key={column} data-test-subj={`mockCell-${rowIndex}-${column}`}>
                {props.externalCustomRenderers[column]?.({ rowIndex })}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  },
}));
jest.mock('@kbn/react-kibana-mount', () => ({
  toMountPoint: jest.fn((node: React.ReactNode) => node),
}));

const addSuccess = jest.fn();
const addError = jest.fn();
const openDetonationFlyout = jest.fn();
const fetchNextPage = jest.fn();

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

const lastRunsQuery = () => {
  const { calls } = jest.mocked(useDetonationRuns).mock;
  return calls[calls.length - 1][0];
};

const renderPage = (url = '/detonate_prototype') =>
  render(
    <I18nProvider>
      <MemoryRouter initialEntries={[url]}>
        <Route path="/detonate_prototype">
          <HistoryProbe />
          <DetonateListPage />
        </Route>
      </MemoryRouter>
    </I18nProvider>
  );

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
    jest.mocked(useKibana).mockReturnValue({
      services: {
        notifications: { toasts: { addSuccess, addError } },
        dataViews: { create: jest.fn().mockResolvedValue({ id: 'runs-data-view', fields: [] }) },
        uiSettings: { get: jest.fn() },
        uiActions: { getTriggerCompatibleActions: jest.fn() },
        application: { capabilities: {} },
        theme: {},
        fieldFormats: {},
        storage: {},
        data: {},
      },
    } as never);
    mockUseColumns.mockReturnValue({
      columns: DEFAULT_COLUMN_IDS,
      onSetColumns: jest.fn(),
    });
    jest.mocked(useFlyoutApi).mockReturnValue({ openDetonationFlyout } as never);
    jest.mocked(useDetonateHealthcheck).mockReturnValue({ isError: false } as never);
    mockRuns([]);
  });

  describe('runs table', () => {
    it('shows the empty prompt when there are no runs', () => {
      renderPage();

      expect(screen.getByTestId(RUNS_TABLE_TEST_ID)).toHaveTextContent(/no/i);
      expect(screen.queryByTestId('mockTable')).not.toBeInTheDocument();
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

    it('passes the free text search to the runs query, trimmed', () => {
      renderPage();

      const input = screen.getByTestId('detonatePrototypeRunsSearch');
      fireEvent.change(input, { target: { value: '  evil  ' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });

      expect(lastRunsQuery().search).toBe('evil');
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

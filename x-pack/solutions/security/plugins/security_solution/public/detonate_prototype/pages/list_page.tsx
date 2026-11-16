/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — list page.
 *
 * The submission modal opens from the page header and the list of past runs
 * sits right below: the analyst's next action after submitting is to watch the
 * run, and splitting them would make them navigate to find out what they just
 * started.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  EuiBadge,
  EuiButton,
  EuiButtonGroup,
  EuiButtonIcon,
  EuiCopy,
  EuiEmptyPrompt,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPageHeader,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import type { EuiDataGridCellValueElementProps, EuiDataGridStyle } from '@elastic/eui';
import { KbnWarningCallout } from '@kbn/ui-callout';
import { FormattedRelative } from '@kbn/i18n-react';
import { toMountPoint } from '@kbn/react-kibana-mount';
import {
  DataLoadingState,
  UnifiedDataTable,
  useColumns,
  type CustomCellRenderer,
  type SortOrder,
  type UnifiedDataTableSettings,
} from '@kbn/unified-data-table';
import { CellActionsProvider } from '@kbn/cell-actions';
import {
  SHOW_MULTIFIELDS,
  SORT_DEFAULT_ORDER_SETTING,
  buildDataTableRecord,
} from '@kbn/discover-utils';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { DataView, FieldSpec } from '@kbn/data-views-plugin/public';
import useLocalStorage from 'react-use/lib/useLocalStorage';

import {
  DETONATION_RUNS_DEFAULT_PAGE_SIZE,
  DETONATION_RUNS_MAX_RESULT_WINDOW,
  DETONATION_RUNS_SORT_FIELDS,
  DETONATION_RUN_FIELDS,
} from '../../../common/detonate_prototype';
import type {
  DetonationRecord,
  DetonationRecordFieldType,
  DetonationRunsQuery,
  DetonationRunsSortField,
  DetonateTask,
} from '../../../common/detonate_prototype';
import { useDetonateHealthcheck, useDetonationRuns } from '../hooks/use_detonate';
import { DetonationStateBadge } from '../components/detonation_state_badge';
import { DetonateVerdictNameBadge } from '../components/verdict_badge';
import { SubmitModal } from '../components/submit_modal';
import { useFlyoutApi } from '../../flyout_v2/use_flyout_api';
import { useKibana } from '../../common/lib/kibana';
import { EmptyComponent } from '../../common/lib/cell_actions/helpers';
import * as i18n from '../translations';

export const LIST_PAGE_TEST_ID = 'detonatePrototypeListPage';
export const RUNS_TABLE_TEST_ID = 'detonatePrototypeRunsTable';
export const SERVICE_UNAVAILABLE_TEST_ID = 'detonatePrototypeServiceUnavailable';
export const SUBMIT_SAMPLE_BUTTON_TEST_ID = 'detonatePrototypeSubmitSample';
export const SUBMIT_TOAST_TEST_ID = 'detonatePrototypeSubmitToast';
export const SUBMIT_TOAST_VIEW_RESULT_TEST_ID = 'detonatePrototypeSubmitToastViewResult';

const LOCAL_STORAGE_COLUMNS_KEY = 'securitySolution.detonatePrototype.runsTable.columns';
const LOCAL_STORAGE_SETTINGS_KEY = 'securitySolution.detonatePrototype.runsTable.settings';
const RUNS_RESULTS_INDEX_PATTERN = '.kibana-detonate-results-*';
const RUNS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const SAMPLE_COLUMN = 'file.name';
const SUBMITTED_COLUMN = '@timestamp';
const VERDICT_COLUMN = 'detonate.verdict';
const ALERTS_COLUMN = 'detonate.alerts.total';
const OS_COLUMN = 'detonate.vm.os_family';
const STATUS_COLUMN = 'detonate.state';
const SOURCE_COLUMN = 'detonate.source';
const TAGS_COLUMN = 'tags';

const DEFAULT_COLUMNS: ReadonlyArray<{ id: string; width?: number }> = [
  { id: SUBMITTED_COLUMN, width: 150 },
  { id: SAMPLE_COLUMN, width: 360 },
  { id: VERDICT_COLUMN, width: 130 },
  { id: ALERTS_COLUMN, width: 90 },
  { id: OS_COLUMN, width: 110 },
  { id: STATUS_COLUMN, width: 260 },
  { id: SOURCE_COLUMN, width: 130 },
  { id: TAGS_COLUMN },
];

const COLUMN_HEADERS: Readonly<Record<string, string>> = {
  [SUBMITTED_COLUMN]: i18n.COLUMN_SUBMITTED,
  [SAMPLE_COLUMN]: i18n.COLUMN_SAMPLE,
  [VERDICT_COLUMN]: i18n.COLUMN_VERDICT,
  [ALERTS_COLUMN]: i18n.COLUMN_ALERTS,
  [OS_COLUMN]: i18n.COLUMN_OS,
  [STATUS_COLUMN]: i18n.COLUMN_STATUS,
  [SOURCE_COLUMN]: i18n.COLUMN_SOURCE,
  [TAGS_COLUMN]: i18n.COLUMN_TAGS,
};

const GRID_STYLE: EuiDataGridStyle = {
  border: 'horizontal',
  cellPadding: 'l',
  stripes: false,
  header: 'underline',
};

const DEFAULT_SORT: SortOrder = [SUBMITTED_COLUMN, 'desc'];

type PresetId = 'all' | 'in_progress' | 'malicious' | 'needs_attention';

/** Quick filters are KQL over the run fields, so the route needs no preset of its own. */
const PRESETS: ReadonlyArray<{ id: PresetId; label: string; kql?: string }> = [
  { id: 'all', label: i18n.RUNS_PRESET_ALL },
  { id: 'in_progress', label: i18n.RUNS_PRESET_IN_PROGRESS, kql: 'detonate.state:running' },
  { id: 'malicious', label: i18n.RUNS_PRESET_MALICIOUS, kql: 'detonate.verdict:malicious' },
  {
    id: 'needs_attention',
    label: i18n.RUNS_PRESET_NEEDS_ATTENTION,
    kql: 'detonate.state:failed or detonate.verdict:inconclusive',
  },
];

const FIELD_SPEC_TYPE: Readonly<
  Record<DetonationRecordFieldType, { type: string; esTypes: string[] }>
> = {
  keyword: { type: 'string', esTypes: ['keyword'] },
  date: { type: 'date', esTypes: ['date'] },
  long: { type: 'number', esTypes: ['long'] },
  boolean: { type: 'boolean', esTypes: ['boolean'] },
};

const isSortField = (field: string): field is DetonationRunsSortField =>
  (DETONATION_RUNS_SORT_FIELDS as readonly string[]).includes(field);

/**
 * An unpersisted data view over the results index, built from the run field list. It stays ad hoc
 * until the A4 split settles the results index naming (Q-I, `logs-*`), when a real data view can
 * replace it; the index itself is hidden, so the table reads it through the runs route instead.
 */
const buildRunFields = (): Record<string, FieldSpec> =>
  Object.fromEntries(
    Object.entries(DETONATION_RUN_FIELDS).map(([name, fieldType]) => [
      name,
      {
        name,
        ...FIELD_SPEC_TYPE[fieldType],
        searchable: true,
        // Deviation from the epic: UnifiedDataTable offers a header sort only on aggregatable fields, and
        // the route sorts on the allowlist alone, so every other column is marked non-aggregatable.
        aggregatable: isSortField(name),
        readFromDocValues: true,
      },
    ])
  );

const sourceOf = (rows: DataTableRecord[], rowIndex: number): DetonationRecord | undefined =>
  rows[rowIndex]?.raw._source as DetonationRecord | undefined;

const serviceErrorMessage = (error: unknown): string => {
  const body = (error as { body?: { message?: string } } | undefined)?.body;
  return body?.message ?? (error instanceof Error ? error.message : String(error));
};

interface RunsTableProps {
  dataView: DataView;
  hits: DetonationRecord[];
  totalHits: number;
  sort: SortOrder;
  onSortChange: (sort: SortOrder) => void;
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
  loadingState: DataLoadingState;
  onFetchMore: () => void;
}

const RunsTable = ({
  dataView,
  hits,
  totalHits,
  sort,
  onSortChange,
  pageSize,
  onPageSizeChange,
  loadingState,
  onFetchMore,
}: RunsTableProps) => {
  const { openDetonationFlyout } = useFlyoutApi();
  const { services } = useKibana();
  const toasts = services.notifications.toasts;
  const dataViews = services.dataViews;

  const rows = useMemo(
    () =>
      dataView
        ? hits.map((hit) =>
            buildDataTableRecord(
              {
                _id: hit['detonate.task_id'],
                _index: RUNS_RESULTS_INDEX_PATTERN,
                _source: { ...hit },
              },
              dataView
            )
          )
        : [],
    [hits, dataView]
  );

  // `record.id` is Discover's `index::id::routing` doc id, so the run id is read from the raw `_id`.
  // Deviation from the epic: the flyout's pager covers the loaded rows only; the table's load-more extends it.
  const openRow = useCallback(
    (record?: DataTableRecord) => {
      const taskId = record?.raw._id;
      if (!taskId) return;
      openDetonationFlyout({
        taskId,
        pagination: {
          taskIds: rows.flatMap(({ raw }) => (raw._id ? [raw._id] : [])),
        },
      });
    },
    [openDetonationFlyout, rows]
  );

  const [localStorageColumns, setLocalStorageColumns] = useLocalStorage(
    LOCAL_STORAGE_COLUMNS_KEY,
    DEFAULT_COLUMNS.map(({ id }) => id)
  );
  const [persistedSettings, setPersistedSettings] = useLocalStorage<UnifiedDataTableSettings>(
    LOCAL_STORAGE_SETTINGS_KEY,
    {
      columns: Object.fromEntries(
        DEFAULT_COLUMNS.map(({ id, width }) => [id, width ? { width } : {}])
      ),
    }
  );
  const settings = useMemo<UnifiedDataTableSettings>(
    () => ({
      columns: Object.fromEntries(
        Object.entries(persistedSettings?.columns ?? {}).map(([id, column]) => [
          id,
          { ...(column?.width ? { width: column.width } : {}), display: COLUMN_HEADERS[id] },
        ])
      ),
    }),
    [persistedSettings]
  );
  const onResize = useCallback(
    ({ columnId, width }: { columnId: string; width: number | undefined }) => {
      setPersistedSettings({
        ...persistedSettings,
        columns: {
          ...persistedSettings?.columns,
          [columnId]: width ? { width: Math.round(width) } : {},
        },
      });
    },
    [persistedSettings, setPersistedSettings]
  );

  const { columns: currentColumns, onSetColumns } = useColumns({
    capabilities: services.application.capabilities,
    defaultOrder: services.uiSettings.get(SORT_DEFAULT_ORDER_SETTING),
    dataView,
    dataViews,
    setAppState: ({ columns }) => setLocalStorageColumns(columns),
    columns: localStorageColumns,
    sort: [sort],
  });

  const onSort = useCallback(
    (next: string[][]) => {
      // Only single-valued fields sort server-side; any other column header sort is dropped.
      const [field, direction] = next[0] ?? DEFAULT_SORT;
      if (isSortField(field)) onSortChange([field, direction]);
    },
    [onSortChange]
  );

  const customCellRenderers = useMemo<CustomCellRenderer>(
    () => ({
      [SUBMITTED_COLUMN]: ({ rowIndex }: EuiDataGridCellValueElementProps) => {
        const run = sourceOf(rows, rowIndex);
        return run ? <FormattedRelative value={new Date(run['@timestamp'])} /> : null;
      },
      [SAMPLE_COLUMN]: ({ rowIndex }: EuiDataGridCellValueElementProps) => {
        const run = sourceOf(rows, rowIndex);
        if (!run) return null;
        const hash = run['file.hash.sha256'];
        return (
          <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
            <EuiFlexItem css={{ minWidth: 0 }}>
              <EuiLink
                onClick={() => openRow(rows[rowIndex])}
                data-test-subj={`${RUNS_TABLE_TEST_ID}-link`}
                // The full hash stays in the DOM and is clipped by the cell.
                css={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {run['file.name'] ?? hash ?? run['detonate.task_id']}
              </EuiLink>
            </EuiFlexItem>
            {hash && (
              <EuiFlexItem grow={false}>
                <EuiCopy textToCopy={hash}>
                  {(copy) => (
                    <EuiToolTip content={i18n.RUNS_COPY_HASH} disableScreenReaderOutput>
                      <EuiButtonIcon
                        iconType="copy"
                        size="xs"
                        color="text"
                        aria-label={i18n.RUNS_COPY_HASH}
                        onClick={copy}
                        data-test-subj={`${RUNS_TABLE_TEST_ID}-copyHash`}
                      />
                    </EuiToolTip>
                  )}
                </EuiCopy>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        );
      },
      [VERDICT_COLUMN]: ({ rowIndex }: EuiDataGridCellValueElementProps) => {
        const run = sourceOf(rows, rowIndex);
        const verdict = run?.['detonate.verdict'];
        return verdict ? (
          <DetonateVerdictNameBadge verdict={verdict} evidence={run['detonate.evidence']} />
        ) : null;
      },
      [ALERTS_COLUMN]: ({ rowIndex }: EuiDataGridCellValueElementProps) => (
        <span data-test-subj={`${RUNS_TABLE_TEST_ID}-alerts`}>
          {sourceOf(rows, rowIndex)?.['detonate.alerts.total'] ?? 0}
        </span>
      ),
      [STATUS_COLUMN]: ({ rowIndex }: EuiDataGridCellValueElementProps) => {
        const run = sourceOf(rows, rowIndex);
        if (!run) return null;
        const stepNumber = run['detonate.step.number'];
        return (
          <DetonationStateBadge
            state={run['detonate.state']}
            step={
              stepNumber === undefined
                ? undefined
                : {
                    step: stepNumber,
                    of: run['detonate.step.of'] ?? stepNumber,
                    label: run['detonate.step.label'] ?? '',
                    worker: run['detonate.step.worker'] ?? '',
                  }
            }
          />
        );
      },
      [TAGS_COLUMN]: ({ rowIndex }: EuiDataGridCellValueElementProps) => (
        <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
          {(sourceOf(rows, rowIndex)?.tags ?? []).map((tag) => (
            <EuiFlexItem grow={false} key={tag}>
              <EuiBadge color="hollow">{tag}</EuiBadge>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      ),
    }),
    [rows, openRow]
  );

  const tableServices = useMemo(
    () => ({
      theme: services.theme,
      fieldFormats: services.fieldFormats,
      uiSettings: services.uiSettings,
      toastNotifications: toasts,
      storage: services.storage,
      data: services.data,
    }),
    [services, toasts]
  );

  return (
    <CellActionsProvider
      getTriggerCompatibleActions={services.uiActions.getTriggerCompatibleActions}
    >
      <UnifiedDataTable
        ariaLabelledBy={i18n.RUNS_TITLE}
        columns={currentColumns}
        dataView={dataView}
        loadingState={loadingState}
        onResize={onResize}
        onSetColumns={onSetColumns}
        onSort={onSort}
        // The route sorts; sorting the loaded pages again would disagree with it.
        isInMemorySortEnabled={false}
        rows={rows}
        // The footer shows Load more only while rowCount <= 10,000 - sampleSize, so a 10,000 sample hid it.
        sampleSizeState={pageSize}
        setExpandedDoc={openRow}
        renderDocumentView={EmptyComponent}
        sort={[sort]}
        rowsPerPageState={pageSize}
        rowsPerPageOptions={RUNS_PAGE_SIZE_OPTIONS}
        onUpdateRowsPerPage={onPageSizeChange}
        totalHits={totalHits}
        onFetchMoreRecords={onFetchMore}
        services={tableServices}
        rowHeightState={0}
        showMultiFields={services.uiSettings.get(SHOW_MULTIFIELDS)}
        showTimeCol={false}
        settings={settings}
        externalCustomRenderers={customCellRenderers}
        gridStyleOverride={GRID_STYLE}
        rowLineHeightOverride="24px"
      />
    </CellActionsProvider>
  );
};

export const DetonateListPage = React.memo(() => {
  const { openDetonationFlyout } = useFlyoutApi();
  const { services } = useKibana();
  const toasts = services.notifications.toasts;
  const { taskId: deepLinkedTaskId } = useParams<{ taskId?: string }>();
  const { search: locationSearch } = useLocation();
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<PresetId>('all');
  const [sort, setSort] = useState<SortOrder>(DEFAULT_SORT);
  const [pageSize, setPageSize] = useState(DETONATION_RUNS_DEFAULT_PAGE_SIZE);

  /**
   * The alert action arrives here with the hash it extracted. Reading it from
   * the URL rather than from navigation state means the pre-filled form
   * survives a reload and can be shared with another analyst.
   */
  const prefill = useMemo(() => {
    const params = new URLSearchParams(locationSearch);
    return {
      hash: params.get('sample_hash') ?? undefined,
      tags: params.getAll('tags'),
    };
  }, [locationSearch]);
  const hasPrefill = Boolean(prefill.hash) || prefill.tags.length > 0;
  const prefillKey = hasPrefill ? JSON.stringify([prefill.hash, prefill.tags]) : '';

  const healthcheck = useDetonateHealthcheck();
  const kql = PRESETS.find(({ id }) => id === preset)?.kql;
  const runsQuery = useMemo<Omit<DetonationRunsQuery, 'from'>>(
    () => ({
      ...(kql ? { kql } : {}),
      ...(search ? { search } : {}),
      sort_field: sort[0] as DetonationRunsSortField,
      sort_direction: sort[1] === 'asc' ? 'asc' : 'desc',
      size: pageSize,
    }),
    [kql, search, sort, pageSize]
  );
  const { data, isLoading, isError, error, isFetching, isFetchingNextPage, fetchNextPage } =
    useDetonationRuns(runsQuery);

  const hits = useMemo(() => data?.pages.flatMap((page) => page.hits) ?? [], [data]);
  const totalHits = data?.pages[0]?.total ?? 0;

  const loadMore = useCallback(() => {
    // Explicit offset: after an empty page getNextPageParam returns undefined, which would leave
    // Load more (shown once polling raises the total) a no-op. Polling still uses getNextPageParam.
    if (hits.length + pageSize > DETONATION_RUNS_MAX_RESULT_WINDOW) return;
    fetchNextPage({ pageParam: hits.length });
  }, [fetchNextPage, hits.length, pageSize]);

  // Deviation from the epic: the toast, the prior-run link and the deep link open one run, without the pager.
  const goToTask = useCallback(
    (taskId: string) => openDetonationFlyout({ taskId }),
    [openDetonationFlyout]
  );

  const dataViews = services.dataViews;
  const [dataView, setDataView] = useState<DataView>();
  useEffect(() => {
    let cancelled = false;
    dataViews
      .create(
        {
          title: RUNS_RESULTS_INDEX_PATTERN,
          timeFieldName: '@timestamp',
          fields: buildRunFields(),
        },
        true
      )
      .then((created) => {
        if (!cancelled) setDataView(created);
      })
      .catch((createError: Error) =>
        toasts.addError(createError, { title: i18n.RUNS_DATA_VIEW_ERROR })
      );
    return () => {
      cancelled = true;
    };
  }, [dataViews, toasts]);

  const onPresetChange = useCallback((id: string) => setPreset(id as PresetId), []);

  /**
   * `prefill` is set only for a modal opened by a URL hand-off. Each opening gets a new
   * `id` so the modal remounts and its form state resets.
   */
  const [modal, setModal] = useState<{ id: number; prefill?: typeof prefill } | undefined>(() =>
    hasPrefill ? { id: 0, prefill } : undefined
  );
  const modalCount = useRef(0);

  // An alert hand-off arrives with a hash or tags in the URL: open the modal pre-filled.
  // Keyed on the prefill itself, so a later query-string change (back/forward or a new
  // hand-off link) opens it again, while closing it does not bring it back.
  const handledPrefillKey = useRef(prefillKey);
  useEffect(() => {
    if (prefillKey === handledPrefillKey.current) return;
    handledPrefillKey.current = prefillKey;
    if (hasPrefill) {
      modalCount.current += 1;
      setModal({ id: modalCount.current, prefill });
    }
  }, [prefillKey, hasPrefill, prefill]);

  // The URL prefill stays in the address bar after the modal closes, so the button
  // must open a blank form rather than the old hash and tags.
  const openSubmitModal = useCallback(() => {
    modalCount.current += 1;
    setModal({ id: modalCount.current });
  }, []);
  const closeSubmitModal = useCallback(() => setModal(undefined), []);

  const onSubmitted = useCallback(
    (task: DetonateTask) => {
      setModal(undefined);
      toasts.addSuccess({
        title: i18n.SUBMIT_MODAL_SUCCESS,
        text: toMountPoint(
          <EuiLink
            onClick={() => goToTask(task.id)}
            data-test-subj={SUBMIT_TOAST_VIEW_RESULT_TEST_ID}
          >
            {i18n.SUBMIT_MODAL_VIEW_RESULT}
          </EuiLink>,
          services
        ),
        'data-test-subj': SUBMIT_TOAST_TEST_ID,
      });
    },
    [goToTask, services, toasts]
  );

  const onViewPriorRun = useCallback(
    (taskId: string) => {
      setModal(undefined);
      goToTask(taskId);
    },
    [goToTask]
  );

  /** `/detonate_prototype/:taskId` stays a shareable link: it opens the run's flyout over the list. */
  const openedDeepLink = useRef<string>();
  useEffect(() => {
    if (!deepLinkedTaskId || openedDeepLink.current === deepLinkedTaskId) return;
    openedDeepLink.current = deepLinkedTaskId;
    openDetonationFlyout({ taskId: deepLinkedTaskId });
  }, [deepLinkedTaskId, openDetonationFlyout]);

  const onSearch = useCallback((value: string) => setSearch(value.trim()), []);

  return (
    <div data-test-subj={LIST_PAGE_TEST_ID}>
      <EuiPageHeader
        pageTitle={i18n.DETONATE_PROTOTYPE}
        description={i18n.DETONATE_PROTOTYPE_DESCRIPTION}
        rightSideItems={[
          <EuiButton
            fill
            iconType="plusInCircle"
            onClick={openSubmitModal}
            data-test-subj={SUBMIT_SAMPLE_BUTTON_TEST_ID}
          >
            {i18n.SUBMIT_SAMPLE_BUTTON}
          </EuiButton>,
        ]}
      />
      <EuiSpacer size="l" />

      {healthcheck.isError && (
        <>
          <KbnWarningCallout
            announceOnMount
            title={i18n.SERVICE_UNAVAILABLE_TITLE}
            text={serviceErrorMessage(healthcheck.error)}
            data-test-subj={SERVICE_UNAVAILABLE_TEST_ID}
          />
          <EuiSpacer size="l" />
        </>
      )}

      {modal && (
        <SubmitModal
          key={modal.id}
          initialHash={modal.prefill?.hash}
          initialTags={modal.prefill?.tags}
          source="detonate_page"
          onClose={closeSubmitModal}
          onSubmitted={onSubmitted}
          onViewTask={onViewPriorRun}
        />
      )}

      <EuiPanel hasBorder>
        <EuiFlexGroup alignItems="center" gutterSize="m">
          <EuiFlexItem>
            <EuiText>
              <h2>{i18n.RUNS_TITLE}</h2>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFieldSearch
              placeholder={i18n.RUNS_SEARCH_PLACEHOLDER}
              incremental={false}
              onSearch={onSearch}
              data-test-subj="detonatePrototypeRunsSearch"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />

        <EuiButtonGroup
          legend={i18n.RUNS_PRESETS_LABEL}
          buttonSize="compressed"
          options={PRESETS.map(({ id, label }) => ({
            id,
            label,
            'data-test-subj': `${RUNS_TABLE_TEST_ID}-preset-${id}`,
          }))}
          idSelected={preset}
          onChange={onPresetChange}
        />
        <EuiSpacer size="m" />

        <div data-test-subj={RUNS_TABLE_TEST_ID}>
          <EuiProgress size="xs" color="accent" css={{ opacity: isFetching ? 1 : 0 }} />
          {isError && !data ? (
            <KbnWarningCallout
              announceOnMount
              title={i18n.RUNS_ERROR_TITLE}
              text={serviceErrorMessage(error)}
              data-test-subj={`${RUNS_TABLE_TEST_ID}-error`}
            />
          ) : !isLoading && totalHits === 0 ? (
            <EuiEmptyPrompt body={<p>{i18n.RUNS_EMPTY}</p>} titleSize="xs" />
          ) : dataView ? (
            <RunsTable
              dataView={dataView}
              hits={hits}
              totalHits={totalHits}
              sort={sort}
              onSortChange={setSort}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              loadingState={
                isLoading
                  ? DataLoadingState.loading
                  : isFetchingNextPage
                  ? DataLoadingState.loadingMore
                  : DataLoadingState.loaded
              }
              onFetchMore={loadMore}
            />
          ) : null}
        </div>
      </EuiPanel>
    </div>
  );
});
DetonateListPage.displayName = 'DetonateListPage';

// eslint-disable-next-line import/no-default-export
export default DetonateListPage;

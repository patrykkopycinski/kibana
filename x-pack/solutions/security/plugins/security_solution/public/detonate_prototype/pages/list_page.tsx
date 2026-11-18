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
  EuiSkeletonText,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { EuiDataGridCellValueElementProps, EuiDataGridStyle } from '@elastic/eui';
import { KbnDangerCallout, KbnWarningCallout } from '@kbn/ui-callout';
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
import { fromKueryExpression } from '@kbn/es-query';
import type { Query, TimeRange } from '@kbn/es-query';
import useLocalStorage from 'react-use/lib/useLocalStorage';
import { useIsFetching, useQueryClient } from '@kbn/react-query';
import { isNoneGroup, useGrouping } from '@kbn/grouping';
import type {
  DynamicGroupingProps,
  GroupOption,
  GroupSettings,
  GroupStatsItem,
} from '@kbn/grouping';
import type {
  GetGroupStats,
  GroupChildComponentRenderer,
  GroupMap,
  GroupPanelRenderer,
  GroupsById,
  GroupingBucket,
  RawBucket,
  ParsedGroupingAggregation,
} from '@kbn/grouping/src';

import {
  DETONATION_RUNS_DEFAULT_PAGE_SIZE,
  DETONATION_RUNS_MAX_RESULT_WINDOW,
  DETONATION_RUNS_SORT_FIELDS,
  DETONATION_RUN_FIELDS,
  detonateResultsIndexName,
  DETONATION_GROUPS_DEFAULT_PAGE_SIZE,
  DETONATION_GROUPS_MAX_LEVELS,
  DETONATION_RUNS_DEFAULT_GROUP_FIELD,
  DETONATION_RUNS_GROUP_FIELDS,
  DETONATION_RUNS_MULTI_VALUE_GROUP_FIELDS,
  quoteQueryValue,
} from '../../../common/detonate_prototype';
import type {
  DetonationRecord,
  DetonationRecordFieldType,
  DetonationRunsQuery,
  DetonationRunStatsQuery,
  DetonationRunsSortField,
  DetonateTask,
  DetonateVerdictName,
  DetonationRunGroup,
  DetonationRunGroupsQuery,
  DetonationRunGroupsResponse,
  DetonationRunsGroupField,
  DetonationRunsGroupParent,
} from '../../../common/detonate_prototype';
import {
  DETONATE_QUERY_KEY,
  useDetonateHealthcheck,
  useDetonationRunGroups,
  useDetonationRuns,
  useDetonationRunStats,
  useDetonationOriginAlertIds,
  useDetonationTask,
} from '../hooks/use_detonate';
import { isRejectedFilter } from '../hooks/is_client_error';
import { DetonationsDashboard } from '../components/detonations_dashboard';
import { DetonationStateBadge } from '../components/detonation_state_badge';
import { DetonateVerdictNameBadge } from '../components/verdict_badge';
import { DetectionAlertGroups, EndpointAlertGroups } from '../components/alert_groups';
import { OriginatingAlerts } from '../components/originating_alerts';
import { SubmitModal } from '../components/submit_modal';
import { useFlyoutApi } from '../../flyout_v2/use_flyout_api';
import { useKibana } from '../../common/lib/kibana';
import { EmptyComponent } from '../../common/lib/cell_actions/helpers';
import * as i18n from '../translations';

export const LIST_PAGE_TEST_ID = 'detonatePrototypeListPage';
export const RUNS_TABLE_TEST_ID = 'detonatePrototypeRunsTable';
export const FILTER_ERROR_TEST_ID = 'detonatePrototypeFilterError';
export const SERVICE_UNAVAILABLE_TEST_ID = 'detonatePrototypeServiceUnavailable';
export const SUBMIT_SAMPLE_BUTTON_TEST_ID = 'detonatePrototypeSubmitSample';
export const SUBMIT_TOAST_TEST_ID = 'detonatePrototypeSubmitToast';
export const SUBMIT_TOAST_VIEW_RESULT_TEST_ID = 'detonatePrototypeSubmitToastViewResult';

const LOCAL_STORAGE_COLUMNS_KEY = 'securitySolution.detonatePrototype.runsTable.columns';
const LOCAL_STORAGE_SETTINGS_KEY = 'securitySolution.detonatePrototype.runsTable.settings';
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

const DEFAULT_TIME_RANGE: TimeRange = { from: 'now-30d', to: 'now' };

const parses = (kql: string): boolean => {
  try {
    fromKueryExpression(kql);
    return true;
  } catch {
    return false;
  }
};

/**
 * The quick filter and the analyst's KQL both apply, each in parentheses so an `or` in one cannot
 * widen the other. Parentheses only hold if the user's text is balanced on its own: `a) or (b`
 * would close the preset's group and reopen another. So KQL that does not parse alone is sent
 * alone, never combined; the route rejects it with a 400 and the page shows that parse error.
 */
const andKql = (presetKql: string | undefined, userKql: string): string | undefined => {
  const user = userKql.trim() ? userKql : undefined;
  if (!presetKql) return user;
  if (!user) return presetKql;
  return parses(user) ? `(${presetKql}) and (${user})` : user;
};

/**
 * The group's filter narrows the page's query: `(page) and (group)`, so an `or` in the page's KQL
 * cannot widen the group. The group's KQL is built here from quoted values, so it always parses;
 * a plain join therefore never drops the page's filter. The page's own KQL was already accepted
 * by the groups request that produced this group.
 */
const andGroupKql = (pageKql: string | undefined, groupKql: string): string | undefined => {
  const page = pageKql?.trim() ? pageKql : undefined;
  if (!groupKql) return page;
  return page ? `(${page}) and (${groupKql})` : groupKql;
};

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
  titleId: string;
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
  titleId,
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
                _index: dataView.title,
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
      // EUI appends a newly sorted column to the current sort and the server sorts on one field, so take the added entry.
      const [field, direction] =
        next.find(([nextField]) => nextField !== sort[0]) ?? next[0] ?? DEFAULT_SORT;
      // Only single-valued fields sort server-side; any other column header sort is dropped.
      if (isSortField(field)) onSortChange([field, direction]);
    },
    [onSortChange, sort]
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
      // Epic #20877 §State inventory: a run waiting for a VM (worker prepare_task_data) is shown as
      // running here, not queued. Pending product answer (P-18).
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
        ariaLabelledBy={titleId}
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

export const GROUPING_ID = 'securitySolution.detonatePrototype.runsGrouping';

const GROUP_OPTIONS: GroupOption[] = [
  { key: 'detonate.task_id', label: i18n.GROUP_BY_DETONATION },
  { key: 'detonate.verdict', label: i18n.GROUP_BY_VERDICT },
  { key: 'file.hash.sha256', label: i18n.GROUP_BY_SAMPLE_HASH },
  { key: 'detonate.source', label: i18n.GROUP_BY_SOURCE },
  { key: 'host.name', label: i18n.GROUP_BY_HOST },
  { key: 'user.name', label: i18n.GROUP_BY_USER },
  // Epic #20877 §1: Rule groups should come from the sandbox SIEM alerts store; detonate.detection_rule_names stands in; pending product answer (Q-B/Q2).
  { key: 'detonate.detection_rule_names', label: i18n.GROUP_BY_RULE },
];

// The route accepts only the seven fields above, so a custom field would only ever be rejected.
const GROUPING_SETTINGS: GroupSettings = { hideCustomFieldOption: true };

const NO_PARENTS: DetonationRunsGroupParent[] = [];

const DETONATION_TASK_ID_FIELD: DetonationRunsGroupField = 'detonate.task_id';
const DETONATION_VERDICT_FIELD: DetonationRunsGroupField = 'detonate.verdict';
const SHORT_HASH_LENGTH = 8;
const VERDICT_ORDER: readonly DetonateVerdictName[] = ['malicious', 'benign', 'inconclusive'];

/**
 * @kbn/grouping persists every grouping in the `groups` localStorage key, keyed by grouping id, and
 * merges storage only when the selection changes: the first render uses `initialGroupings` as
 * given. So the saved selection is read here, once, and the Detonation grouping is the fallback.
 */
const readInitialGroupings = (): GroupMap => {
  const fallback: GroupMap = {
    groupById: {
      [GROUPING_ID]: {
        activeGroups: [DETONATION_RUNS_DEFAULT_GROUP_FIELD],
        options: GROUP_OPTIONS,
      },
    },
  };
  try {
    const saved = (JSON.parse(window.localStorage.getItem('groups') ?? '{}') as GroupsById)[
      GROUPING_ID
    ];
    if (!saved || !Array.isArray(saved.activeGroups) || saved.activeGroups.length === 0) {
      return fallback;
    }
    const known = new Set<string>([...DETONATION_RUNS_GROUP_FIELDS, 'none']);
    const activeGroups = saved.activeGroups.filter(
      (field): field is string => typeof field === 'string' && known.has(field)
    );
    if (activeGroups.length === 0 || activeGroups.length > DETONATION_GROUPS_MAX_LEVELS) {
      return fallback;
    }
    return { groupById: { [GROUPING_ID]: { activeGroups, options: GROUP_OPTIONS } } };
  } catch {
    return fallback;
  }
};

/** What the run groups share: the table's filters, without the grouping. */
interface GroupsBaseQuery {
  kql?: string;
  search?: string;
  start: string;
  end: string;
}

/** The group fields apart from the key, which kbn-grouping wants as an array. */
type RunGroupStats = Omit<DetonationRunGroup, 'key'>;
type GetGrouping = (props: DynamicGroupingProps<RunGroupStats>) => React.ReactElement;

const parentsKql = (parents: DetonationRunsGroupParent[]): string =>
  parents
    .map(({ field, value }) =>
      value === null ? `not ${field}:*` : `${field}:${quoteQueryValue(value)}`
    )
    .join(' and ');

const toParsedGroups = (
  response: DetonationRunGroupsResponse,
  selectedGroup: string
): ParsedGroupingAggregation<RunGroupStats> => ({
  groupByFields: {
    buckets: response.groups.map(
      ({ key, ...group }): GroupingBucket<RunGroupStats> => ({
        ...group,
        key: [key ?? ''],
        // An empty `key_as_string` hides the group panel, so a missing value gets a label.
        key_as_string: key === null || key === '' ? i18n.NO_VALUE_GROUP : key,
        doc_count: group.runCount,
        selectedGroup,
        isNullGroup: key === null,
      })
    ),
  },
  groupsCount: { value: response.groupsCount },
  unitsCount: { value: response.runsCount },
});

/** Why a group of runs has no verdict: they failed, they are still running, or they never got one. */
const noVerdictLabel = ({ states }: Pick<RunGroupStats, 'states'>): string =>
  states.failed > 0
    ? i18n.STATUS_FAILED
    : states.running > 0
    ? i18n.STATUS_RUNNING
    : i18n.NO_VERDICT;

const isVerdictName = (value: string | null): value is DetonateVerdictName =>
  VERDICT_ORDER.some((verdict) => verdict === value);

/** The grouping component marks a bucket with no value, but its renderers are typed with the raw bucket. */
const isNullBucket = (bucket: RawBucket<RunGroupStats>): boolean =>
  'isNullGroup' in bucket && bucket.isNullGroup === true;

/** The group's value, or null for the bucket of runs that have none. */
const bucketValue = (bucket: RawBucket<RunGroupStats>): string | null => {
  if (isNullBucket(bucket)) return null;
  return Array.isArray(bucket.key) ? bucket.key[0] ?? null : bucket.key;
};

const useGroupPanelRenderer = (): GroupPanelRenderer<RunGroupStats> => {
  const { openDetonationFlyout } = useFlyoutApi();

  return useCallback<GroupPanelRenderer<RunGroupStats>>(
    (selectedGroup, bucket) => {
      const value = bucketValue(bucket);

      if (selectedGroup === DETONATION_TASK_ID_FIELD && value !== null) {
        const verdict = VERDICT_ORDER.find((name) => bucket.verdicts[name] > 0);
        const sample = bucket.fileName ?? (bucket.sha256 ?? value).slice(0, SHORT_HASH_LENGTH);
        return (
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              {verdict ? (
                <DetonateVerdictNameBadge verdict={verdict} />
              ) : (
                <EuiBadge color="hollow">{noVerdictLabel(bucket)}</EuiBadge>
              )}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiLink
                aria-label={i18n.GROUP_OPEN_DETONATION(sample)}
                onClick={(event: React.MouseEvent) => {
                  // The header is the accordion's toggle: opening the result must not also open the group.
                  event.stopPropagation();
                  openDetonationFlyout({ taskId: value });
                }}
                data-test-subj="detonatePrototypeGroupOpenDetonation"
              >
                {sample}
              </EuiLink>
            </EuiFlexItem>
          </EuiFlexGroup>
        );
      }

      // Epic #20877 §1: verdict groups should follow the epic's verdict set; pending product answer (Q-D).
      if (selectedGroup === DETONATION_VERDICT_FIELD) {
        return isVerdictName(value) ? (
          <DetonateVerdictNameBadge verdict={value} />
        ) : (
          <EuiBadge color="hollow">{noVerdictLabel(bucket)}</EuiBadge>
        );
      }

      return <EuiText size="s">{value ?? i18n.NO_VALUE_GROUP}</EuiText>;
    },
    [openDetonationFlyout]
  );
};

const getGroupStats: GetGroupStats<RunGroupStats> = (selectedGroup, bucket) => {
  if (selectedGroup === DETONATION_TASK_ID_FIELD) {
    return [{ title: i18n.GROUP_STAT_ALERTS, badge: { value: bucket.alertsTotal } }];
  }
  const withVerdict = VERDICT_ORDER.reduce((sum, name) => sum + bucket.verdicts[name], 0);
  // A missing or `unknown` verdict is no verdict.
  const withoutVerdict = Math.max(bucket.runCount - withVerdict, 0);
  const stats: GroupStatsItem[] = [
    { title: i18n.GROUP_STAT_RUNS, badge: { value: bucket.runCount } },
    {
      title: i18n.GROUP_STAT_VERDICTS,
      component: (
        <EuiFlexGroup gutterSize="xs" responsive={false} wrap alignItems="center">
          {VERDICT_ORDER.filter((name) => bucket.verdicts[name] > 0).map((name) => (
            <EuiFlexItem grow={false} key={name}>
              <EuiFlexGroup gutterSize="xs" responsive={false} alignItems="center">
                <EuiFlexItem grow={false}>
                  <DetonateVerdictNameBadge verdict={name} />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs">{bucket.verdicts[name]}</EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          ))}
          {withoutVerdict > 0 && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{`${i18n.NO_VERDICT} ${withoutVerdict}`}</EuiBadge>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      ),
    },
  ];
  return stats;
};

/**
 * The body of a Detonation group: the run's own alerts, as the result flyout shows them.
 * Epic #20877 §1: the group should open the standard alerts table over sandbox SIEM alerts; pending product answer (Q-B).
 */
const DetonationGroupBody = ({ taskId }: { taskId: string }) => {
  const { data: task, isLoading, isError, error } = useDetonationTask(taskId);
  // This body only mounts while its group is open, so the origin alerts are read on expand only.
  const { data: originAlertIds, isError: originAlertIdsFailed } =
    useDetonationOriginAlertIds(taskId);

  if (isError && !task) {
    const body = (error as { body?: { message?: string } } | null)?.body;
    return (
      <KbnDangerCallout
        announceOnMount
        title={body?.message ?? i18n.GROUP_BODY_ERROR}
        data-test-subj="detonatePrototypeGroupBodyError"
      />
    );
  }

  if (isLoading || !task) {
    return (
      <EuiSkeletonText
        lines={3}
        isLoading
        contentAriaLabel={i18n.RUNS_TABLE_LOADING}
        data-test-subj="detonatePrototypeGroupBodyLoading"
      />
    );
  }

  return (
    <EuiFlexGroup direction="column" gutterSize="l" data-test-subj="detonatePrototypeGroupBody">
      {originAlertIdsFailed && (
        <EuiFlexItem>
          <OriginatingAlertsUnavailable />
        </EuiFlexItem>
      )}
      {originAlertIds && originAlertIds.length > 0 && (
        <EuiFlexItem>
          <OriginatingAlerts key={originAlertIds.join(',')} ids={originAlertIds} />
        </EuiFlexItem>
      )}
      <EuiFlexItem>
        <EndpointAlertGroups
          title={i18n.PRODUCTION_ENDPOINT_ALERTS}
          total={task.production_endpoint_alerts_count}
          groups={task.production_endpoint_alert_groups}
          testSubj="detonatePrototypeProductionEndpointAlerts"
        />
      </EuiFlexItem>
      <EuiFlexItem>
        <DetectionAlertGroups
          title={i18n.PRODUCTION_DETECTION_ALERTS}
          total={task.production_detection_alerts_count}
          groups={task.production_detection_alert_groups}
          testSubj="detonatePrototypeProductionDetectionAlerts"
        />
      </EuiFlexItem>
      <EuiFlexItem>
        <EndpointAlertGroups
          title={i18n.DIAGNOSTIC_ENDPOINT_ALERTS}
          total={task.diagnostic_endpoint_alerts_count}
          groups={task.diagnostic_endpoint_alert_groups}
          testSubj="detonatePrototypeDiagnosticEndpointAlerts"
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

/** The origin-alert ids could not be read, so the section says so rather than vanishing. */
const OriginatingAlertsUnavailable = () => (
  <EuiPanel hasBorder data-test-subj="detonatePrototypeOriginatingAlertsUnavailable">
    <EuiTitle size="xs">
      <h3>{i18n.ORIGINATING_ALERTS_TITLE(1)}</h3>
    </EuiTitle>
    <EuiSpacer size="s" />
    <EuiText size="s" color="subdued">
      {i18n.ORIGINATING_ALERT_NOT_AVAILABLE}
    </EuiText>
  </EuiPanel>
);

interface FilteredRunsTableProps {
  dataView: DataView;
  baseQuery: GroupsBaseQuery;
  parents: DetonationRunsGroupParent[];
  titleId: string;
}

/** The runs of one group: the runs table narrowed to the group's values, with its own sort and paging. */
const FilteredRunsTable = ({ dataView, baseQuery, parents, titleId }: FilteredRunsTableProps) => {
  const [sort, setSort] = useState<SortOrder>(DEFAULT_SORT);
  const [pageSize, setPageSize] = useState(DETONATION_RUNS_DEFAULT_PAGE_SIZE);
  const kql = andGroupKql(baseQuery.kql, parentsKql(parents));
  const query = useMemo<Omit<DetonationRunsQuery, 'from'>>(
    () => ({
      ...(kql ? { kql } : {}),
      ...(baseQuery.search ? { search: baseQuery.search } : {}),
      start: baseQuery.start,
      end: baseQuery.end,
      sort_field: sort[0] as DetonationRunsSortField,
      sort_direction: sort[1] === 'asc' ? 'asc' : 'desc',
      size: pageSize,
    }),
    [kql, baseQuery.search, baseQuery.start, baseQuery.end, sort, pageSize]
  );
  const { data, isLoading, isError, error, isFetchingNextPage, fetchNextPage, refetch } =
    useDetonationRuns(query);
  const hits = useMemo(() => data?.pages.flatMap((page) => page.hits) ?? [], [data]);
  const totalHits = data?.pages[0]?.total ?? 0;
  const lastPageIsEmpty = data?.pages[data.pages.length - 1]?.hits.length === 0;

  const loadMore = useCallback(() => {
    if (hits.length + pageSize > DETONATION_RUNS_MAX_RESULT_WINDOW) return;
    if (lastPageIsEmpty) {
      refetch({
        refetchPage: (_page, index, allPages) => index === 0 || index === allPages.length - 1,
      });
      return;
    }
    fetchNextPage({ pageParam: hits.length });
  }, [fetchNextPage, hits.length, pageSize, refetch, lastPageIsEmpty]);

  if (isError && !data) {
    return (
      <KbnWarningCallout
        announceOnMount
        title={i18n.RUNS_ERROR_TITLE}
        text={serviceErrorMessage(error)}
        data-test-subj="detonatePrototypeGroupRunsError"
      />
    );
  }

  return (
    <div data-test-subj="detonatePrototypeGroupRuns">
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
        titleId={titleId}
      />
    </div>
  );
};

interface GroupLevelProps {
  /** Zero-based depth; the groups at this level are `selectedGroups[level]`. */
  level: number;
  selectedGroups: string[];
  /** The values chosen at the levels above, outermost first. */
  parents: DetonationRunsGroupParent[];
  baseQuery: GroupsBaseQuery;
  getGrouping: GetGrouping;
  dataView: DataView;
  titleId: string;
}

/**
 * One level of the nested grouping. Each level asks the route for its own page of groups, narrowed
 * by the parents above it; the last level shows the group's content instead of another level.
 * A bad KQL fails every level alike and the page says so once, so this shows nothing for it.
 */
const GroupLevel = ({
  level,
  selectedGroups,
  parents,
  baseQuery,
  getGrouping,
  dataView,
  titleId,
}: GroupLevelProps) => {
  const selectedGroup = selectedGroups[level] as DetonationRunsGroupField;
  const parentsJson = parents.length > 0 ? JSON.stringify(parents) : undefined;
  // A page index means nothing once the groups under it change, so paging belongs to one key.
  const pagingKey = JSON.stringify([selectedGroup, parentsJson, baseQuery]);
  const [paging, setPaging] = useState({
    key: pagingKey,
    index: 0,
    size: DETONATION_GROUPS_DEFAULT_PAGE_SIZE,
  });
  const pageIndex = paging.key === pagingKey ? paging.index : 0;

  const query = useMemo<DetonationRunGroupsQuery>(
    () => ({
      group_by: selectedGroup,
      ...(parentsJson ? { parents: parentsJson } : {}),
      ...(baseQuery.kql ? { kql: baseQuery.kql } : {}),
      ...(baseQuery.search ? { search: baseQuery.search } : {}),
      start: baseQuery.start,
      end: baseQuery.end,
      page: pageIndex,
      size: paging.size,
    }),
    [selectedGroup, parentsJson, baseQuery, pageIndex, paging.size]
  );
  const { data, isError, error, isPreviousData } = useDetonationRunGroups(query);

  const parsed = useMemo(
    () => (data && !isPreviousData ? toParsedGroups(data, selectedGroup) : undefined),
    [data, isPreviousData, selectedGroup]
  );

  const onChangePage = useCallback(
    (index: number) => setPaging((current) => ({ ...current, key: pagingKey, index })),
    [pagingKey]
  );
  const onChangeItemsPerPage = useCallback(
    (size: number) => setPaging({ key: pagingKey, index: 0, size }),
    [pagingKey]
  );

  const renderChildComponent = useCallback<GroupChildComponentRenderer<RunGroupStats>>(
    (_filters, group, bucket) => {
      const value = bucket ? bucketValue(bucket) : null;
      const childParents = [...parents, { field: selectedGroup, value }];
      if (level + 1 < selectedGroups.length) {
        return (
          <GroupLevel
            level={level + 1}
            selectedGroups={selectedGroups}
            parents={childParents}
            baseQuery={baseQuery}
            getGrouping={getGrouping}
            dataView={dataView}
            titleId={titleId}
          />
        );
      }
      if (group === DETONATION_TASK_ID_FIELD && value !== null) {
        return <DetonationGroupBody taskId={value} />;
      }
      return (
        <FilteredRunsTable
          dataView={dataView}
          baseQuery={baseQuery}
          parents={childParents}
          titleId={titleId}
        />
      );
    },
    [parents, selectedGroup, level, selectedGroups, baseQuery, getGrouping, dataView, titleId]
  );

  if (isError && !data) {
    return isRejectedFilter(error) ? null : (
      <KbnWarningCallout
        announceOnMount
        title={i18n.GROUPS_ERROR_TITLE}
        text={serviceErrorMessage(error)}
        data-test-subj={`detonatePrototypeGroupsError-${level}`}
      />
    );
  }

  // Until the first page arrives the grouping gets a one-group stand-in, so the page does not
  // jump from nothing to a full list.
  if (!parsed) {
    return getGrouping({
      activePage: 0,
      data: { groupsCount: { value: 1 }, unitsCount: { value: 1 } },
      groupingLevel: level,
      isLoading: true,
      itemsPerPage: paging.size,
      renderChildComponent: () => <></>,
      onGroupClose: () => {},
      selectedGroup: '',
    });
  }

  return getGrouping({
    activePage: pageIndex,
    data: parsed,
    groupingLevel: level,
    isLoading: false,
    itemsPerPage: paging.size,
    onChangeGroupsItemsPerPage: onChangeItemsPerPage,
    onChangeGroupsPage: onChangePage,
    renderChildComponent,
    onGroupClose: () => {},
    selectedGroup,
  });
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
  const titleId = useGeneratedHtmlId({ prefix: 'detonateRunsTitle' });
  // EuiFieldSearch is uncontrolled: a new key empties its text when the filters are cleared.
  const [searchKey, setSearchKey] = useState(0);
  // Deviation from the epic: a local time range, not Security's global time. This page is not wired
  // into the Security URL state or the global KQL header, so the global picker would not drive it.
  const [timeRange, setTimeRange] = useState<TimeRange>(DEFAULT_TIME_RANGE);
  const [userKql, setUserKql] = useState('');
  const [initialGroupings] = useState(readInitialGroupings);
  const queryClient = useQueryClient();
  const groupPanelRenderer = useGroupPanelRenderer();

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
  const presetKql = PRESETS.find(({ id }) => id === preset)?.kql;
  const kql = useMemo(() => andKql(presetKql, userKql), [presetKql, userKql]);
  const runsQuery = useMemo<Omit<DetonationRunsQuery, 'from'>>(
    () => ({
      ...(kql ? { kql } : {}),
      ...(search ? { search } : {}),
      start: timeRange.from,
      end: timeRange.to,
      sort_field: sort[0] as DetonationRunsSortField,
      sort_direction: sort[1] === 'asc' ? 'asc' : 'desc',
      size: pageSize,
    }),
    [kql, search, timeRange, sort, pageSize]
  );
  const statsQuery = useMemo<DetonationRunStatsQuery>(
    () => ({
      start: timeRange.from,
      end: timeRange.to,
      ...(kql ? { kql } : {}),
      ...(search ? { search } : {}),
    }),
    [kql, search, timeRange]
  );
  const componentProps = useMemo(
    () => ({
      groupPanelRenderer,
      getGroupStats,
      unit: i18n.GROUP_RUNS_UNIT,
      groupsUnit: i18n.GROUPS_UNIT,
      multiValueFields: [...DETONATION_RUNS_MULTI_VALUE_GROUP_FIELDS],
      emptyGroupingComponent: <EuiEmptyPrompt body={<p>{i18n.GROUPS_EMPTY}</p>} titleSize="xs" />,
    }),
    [groupPanelRenderer]
  );
  const grouping = useGrouping<RunGroupStats>({
    groupingId: GROUPING_ID,
    maxGroupingLevels: DETONATION_GROUPS_MAX_LEVELS,
    initialGroupings,
    defaultGroupingOptions: GROUP_OPTIONS,
    fields: [],
    settings: GROUPING_SETTINGS,
    componentProps,
    title: i18n.GROUP_BY_TITLE,
  });
  const isFlat = isNoneGroup(grouping.selectedGroups);
  const groupsBaseQuery = useMemo<GroupsBaseQuery>(
    () => ({
      ...(kql ? { kql } : {}),
      ...(search ? { search } : {}),
      start: timeRange.from,
      end: timeRange.to,
    }),
    [kql, search, timeRange]
  );
  const groupsFetching = useIsFetching({ queryKey: [DETONATE_QUERY_KEY, 'tasks', 'groups'] });
  const stats = useDetonationRunStats(statsQuery);
  const { refetch: refetchStats } = stats;
  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useDetonationRuns(runsQuery, { enabled: isFlat });

  // A rejected filter (400) fails the table and every panel alike: say so once, above them all.
  const rejectedFilterError = [error, stats.error].find(
    (failure) => failure !== null && failure !== undefined && isRejectedFilter(failure)
  );

  const hits = useMemo(() => data?.pages.flatMap((page) => page.hits) ?? [], [data]);
  const totalHits = data?.pages[0]?.total ?? 0;
  const lastPageIsEmpty = data?.pages[data.pages.length - 1]?.hits.length === 0;

  const loadMore = useCallback(() => {
    // Explicit offset: after an empty page getNextPageParam returns undefined, which would leave
    // Load more (shown once polling raises the total) a no-op. Polling still uses getNextPageParam.
    if (hits.length + pageSize > DETONATION_RUNS_MAX_RESULT_WINDOW) return;
    // An empty last page means `total` is stale: refetch only page 0 (fresh `total`) and the last page, not all pages.
    // Default cancelRefetch: this is the user's click, so it wins over a poll already in flight.
    if (lastPageIsEmpty) {
      refetch({
        refetchPage: (_page, index, allPages) => index === 0 || index === allPages.length - 1,
      });
      return;
    }
    fetchNextPage({ pageParam: hits.length });
  }, [fetchNextPage, hits.length, pageSize, refetch, lastPageIsEmpty]);

  // Deviation from the epic: the toast, the prior-run link and the deep link open one run, without the pager.
  const goToTask = useCallback(
    (taskId: string) => openDetonationFlyout({ taskId }),
    [openDetonationFlyout]
  );

  const dataViews = services.dataViews;
  const { spaces } = services;
  const [dataView, setDataView] = useState<DataView>();
  // Set when the space lookup or the data view creation fails, so a failure does not look like the
  // table still loading. Kept out of the shared `useSpaceId`, which has no failure path.
  const [dataViewFailed, setDataViewFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const fail = (cause: Error) => {
      if (cancelled) return;
      setDataViewFailed(true);
      toasts.addError(cause, { title: i18n.RUNS_DATA_VIEW_ERROR });
    };
    // The current space's index, not the `-*` pattern: the SearchBar's value suggestions query this title,
    // and the pattern would suggest values from other spaces' runs.
    spaces
      .getActiveSpace()
      .then(({ id }) =>
        dataViews.create(
          {
            title: detonateResultsIndexName(id),
            timeFieldName: '@timestamp',
            fields: buildRunFields(),
          },
          true
        )
      )
      .then((created) => {
        if (!cancelled) setDataView(created);
      })
      .catch(fail);
    return () => {
      cancelled = true;
    };
  }, [dataViews, spaces, toasts]);

  const onPresetChange = useCallback((id: string) => setPreset(id as PresetId), []);
  const isFiltered = Boolean(kql) || Boolean(search);
  const clearFilters = useCallback(() => {
    setPreset('all');
    setSearch('');
    setUserKql('');
    setSearchKey((key) => key + 1);
  }, []);
  const onQuerySubmit = useCallback(
    ({ dateRange, query }: { dateRange: TimeRange; query?: Query }, isUpdated?: boolean) => {
      if (!isUpdated) {
        // Submitting an unchanged bar is a refresh. The flat runs query is disabled in
        // grouped mode, and a manual refetch would ignore that.
        refetchStats();
        if (isFlat) {
          refetch();
          return;
        }
        // Grouped: every open group's run table and body reads sit under these two prefixes.
        // The body's task query is keyed `task`, apart from the `tasks` lists.
        queryClient.invalidateQueries([DETONATE_QUERY_KEY, 'tasks']);
        queryClient.invalidateQueries([DETONATE_QUERY_KEY, 'task']);
        return;
      }
      setTimeRange(dateRange);
      setUserKql(typeof query?.query === 'string' ? query.query : '');
    },
    [isFlat, refetch, refetchStats, queryClient]
  );
  const {
    unifiedSearch: {
      ui: { SearchBar },
    },
  } = services;

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

      <SearchBar
        appName="Detonate"
        displayStyle="inPage"
        showFilterBar={false}
        showQueryInput
        showDatePicker
        showSubmitButton
        // KQL is the only language the route accepts.
        disableQueryLanguageSwitcher
        indexPatterns={dataView ? [dataView] : []}
        dateRangeFrom={timeRange.from}
        dateRangeTo={timeRange.to}
        query={{ query: userKql, language: 'kuery' }}
        placeholder={i18n.DASHBOARD_KQL_PLACEHOLDER}
        onQuerySubmit={onQuerySubmit}
        isLoading={isFetching || stats.isFetching || groupsFetching > 0}
      />
      <EuiSpacer size="m" />

      {rejectedFilterError !== undefined && (
        <>
          <KbnWarningCallout
            announceOnMount
            title={i18n.DASHBOARD_FILTER_ERROR_TITLE}
            text={serviceErrorMessage(rejectedFilterError)}
            data-test-subj={FILTER_ERROR_TEST_ID}
          />
          <EuiSpacer size="m" />
        </>
      )}

      <DetonationsDashboard
        stats={stats.data}
        isLoading={stats.isLoading}
        isError={stats.isError}
        errorMessage={
          stats.isError && !isRejectedFilter(stats.error)
            ? serviceErrorMessage(stats.error)
            : undefined
        }
      />
      <EuiSpacer size="l" />

      <EuiPanel hasBorder>
        <EuiFlexGroup alignItems="center" gutterSize="m">
          <EuiFlexItem>
            <EuiText>
              <h2 id={titleId}>{i18n.RUNS_TITLE}</h2>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFieldSearch
              key={searchKey}
              placeholder={i18n.RUNS_SEARCH_PLACEHOLDER}
              incremental={false}
              onSearch={onSearch}
              data-test-subj="detonatePrototypeRunsSearch"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>{grouping.groupSelector}</EuiFlexItem>
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
          {!isFlat ? (
            dataView ? (
              <GroupLevel
                level={0}
                selectedGroups={grouping.selectedGroups}
                parents={NO_PARENTS}
                baseQuery={groupsBaseQuery}
                getGrouping={grouping.getGrouping}
                dataView={dataView}
                titleId={titleId}
              />
            ) : dataViewFailed ? (
              <KbnWarningCallout
                announceOnMount
                title={i18n.RUNS_DATA_VIEW_ERROR}
                data-test-subj={`${RUNS_TABLE_TEST_ID}-data-view-error`}
              />
            ) : (
              <EuiSkeletonText
                lines={6}
                isLoading
                contentAriaLabel={i18n.RUNS_TABLE_LOADING}
                data-test-subj={`${RUNS_TABLE_TEST_ID}-loading`}
              />
            )
          ) : isError && !data && isRejectedFilter(error) ? null : isError && !data ? (
            <KbnWarningCallout
              announceOnMount
              title={i18n.RUNS_ERROR_TITLE}
              text={serviceErrorMessage(error)}
              data-test-subj={`${RUNS_TABLE_TEST_ID}-error`}
            />
          ) : !isLoading && totalHits === 0 ? (
            isFiltered ? (
              <EuiEmptyPrompt
                body={<p>{i18n.RUNS_NO_MATCH}</p>}
                titleSize="xs"
                actions={
                  <EuiButton
                    size="s"
                    onClick={clearFilters}
                    data-test-subj={`${RUNS_TABLE_TEST_ID}-clear-filters`}
                  >
                    {i18n.RUNS_CLEAR_FILTERS}
                  </EuiButton>
                }
                data-test-subj={`${RUNS_TABLE_TEST_ID}-no-match`}
              />
            ) : (
              <EuiEmptyPrompt body={<p>{i18n.RUNS_EMPTY}</p>} titleSize="xs" />
            )
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
              titleId={titleId}
            />
          ) : dataViewFailed ? (
            <KbnWarningCallout
              announceOnMount
              title={i18n.RUNS_DATA_VIEW_ERROR}
              data-test-subj={`${RUNS_TABLE_TEST_ID}-data-view-error`}
            />
          ) : (
            <EuiSkeletonText
              lines={6}
              isLoading
              contentAriaLabel={i18n.RUNS_TABLE_LOADING}
              data-test-subj={`${RUNS_TABLE_TEST_ID}-loading`}
            />
          )}
        </div>
      </EuiPanel>
    </div>
  );
});
DetonateListPage.displayName = 'DetonateListPage';

// eslint-disable-next-line import/no-default-export
export default DetonateListPage;

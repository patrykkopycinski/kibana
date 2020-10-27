/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { isEmpty } from 'lodash/fp';
import { EuiAccordion, EuiText, EuiFlyoutFooter, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useDispatch } from 'react-redux';
import memoizeOne from 'memoize-one';

import { Note } from '../../../../common/lib/note';
import { useSourcererScope } from '../../../../common/containers/sourcerer';
import {
  OnPinEvent,
  OnRowSelected,
  OnSelectAll,
  OnUnPinEvent,
  OnUpdateColumns,
  OnChangeItemsPerPage,
} from '../events';
import { appSelectors, inputsSelectors } from '../../../../common/store';
import { appActions } from '../../../../common/store/actions';
import { RowRendererId, TimelineId } from '../../../../../common/types/timeline';
import { useDeepEqualSelector } from '../../../../common/hooks/use_selector';
import { Footer, footerHeight } from '../footer';
import { DataProviders } from '../data_providers';
import { StatefulSearchOrFilter } from '../search_or_filter';
import { PickEventType } from '../search_or_filter/pick_events';
import { eventIsPinned, getEventIdToDataMapping } from '../body/helpers';
import { StatefulEvent } from '../body/events/stateful_event';
import { EventsTable, EventsTbody, TimelineBody, TimelineBodyGlobalStyle } from '../styles';
import { SuperDatePicker } from '../../../../common/components/super_date_picker';
import { StatefulEventDetails } from '../../../../common/components/event_details/stateful_event_details';
import { timelineActions, timelineSelectors } from '../../../store/timeline';
import { ColumnHeaders } from '../body/column_headers';
import { getActionsColumnWidth, getColumnHeaders } from '../body/column_headers/helpers';
import { ColumnHeaderOptions } from '../../../store/timeline/model';
import { DEFAULT_ICON_BUTTON_WIDTH, combineQueries } from '../helpers';
import { AddNoteToEvent, UpdateNote } from '../../notes/helpers';
import { rowRenderers } from '../body/renderers';
import { plainRowRenderer } from '../body/renderers/plain_row_renderer';
import { useManageTimeline } from '../../manage_timeline';
import { useTimelineEvents } from '../../../containers';
import { useKibana } from '../../../../common/lib/kibana';
import { defaultHeaders } from '../body/column_headers/default_headers';
import { esQuery } from '../../../../../../../../src/plugins/data/public';
import { requiredFieldsForActions } from '../../../../detections/components/alerts_table/default_config';

const StyledEuiFlyoutFooter = styled(EuiFlyoutFooter)`
  background: none;
  padding: 0 10px 5px 12px;
`;

export const LockIconContainer = styled(EuiFlexItem)`
  margin-right: 2px;
`;

LockIconContainer.displayName = 'LockIconContainer';

export const DatePicker = styled(EuiFlexItem)`
  .euiSuperDatePicker__flexWrapper {
    max-width: none;
    width: auto;
  }
`;

DatePicker.displayName = 'DatePicker';

export const hasAdditionalActions = (id: TimelineId): boolean =>
  [TimelineId.detectionsPage, TimelineId.detectionsRulesDetailsPage, TimelineId.active].includes(
    id
  );

const EXTRA_WIDTH = 4; // px

const memoizedColumnHeaders: (
  headers: ColumnHeaderOptions[],
  browserFields: BrowserFields
) => ColumnHeaderOptions[] = memoizeOne(getColumnHeaders);

const QueryTabContentComponent = ({ filterManager, isEventViewer, scopeId, timelineId }) => {
  const {
    services: { uiSettings },
  } = useKibana();
  const getTimeline = timelineSelectors.getTimelineByIdSelector();
  const getEvents = timelineSelectors.getEventsByIdSelector();
  const getInputsTimeline = inputsSelectors.getTimelineSelector();
  const getKqlQueryTimeline = timelineSelectors.getKqlFilterQuerySelector();
  const {
    timerange: { from: start, to: end },
    policy: { kind },
  } = useDeepEqualSelector(getInputsTimeline);
  const dispatch = useDispatch();
  const getNotesByIds = appSelectors.notesByIdsSelector();
  const notesById = useDeepEqualSelector(getNotesByIds);
  const {
    excludedRowRendererIds,
    eventIdToNoteIds,
    eventType,
    filters,
    graphEventId,
    isSelectAllChecked,
    kqlMode,
    loadingEventIds,
    selectedEventIds,
    show,
    sort,
    pinnedEventIds,
    showCheckboxes,
    timelineType,
  } = useDeepEqualSelector((state) => getTimeline(state, timelineId));
  const {
    columns,
    dataProviders,
    deletedEventIds,
    itemsPerPage,
    itemsPerPageOptions,
  } = useDeepEqualSelector((state) => getEvents(state, timelineId));
  const {
    browserFields,
    docValueFields,
    indexPattern,
    selectedPatterns,
    loading: isLoadingIndexPattern,
  } = useSourcererScope(scopeId);
  const columnHeaders = memoizedColumnHeaders(columns, browserFields);
  const { getManageTimelineById } = useManageTimeline();
  const { queryFields, selectAll } = useMemo(() => getManageTimelineById(timelineId), [
    getManageTimelineById,
    timelineId,
  ]);

  const isLive = useMemo(() => kind === 'interval', [kind]);

  const columnsHeader = isEmpty(columns) ? defaultHeaders : columns;
  const timelineQueryFields = useMemo(() => {
    const columnFields = columnsHeader.map((c) => c.id);
    return [...columnFields, ...requiredFieldsForActions];
  }, [columnsHeader]);

  const kqlQueryTimeline = useDeepEqualSelector((state) => getKqlQueryTimeline(state, timelineId)!);
  const timelineFilter = kqlMode === 'filter' ? filters || [] : [];
  const kqlQueryExpression =
    isEmpty(dataProviders) && isEmpty(kqlQueryTimeline) && timelineType === 'template'
      ? ' '
      : kqlQueryTimeline;
  const kqlQuery = useMemo(() => ({ query: kqlQueryExpression, language: 'kuery' }), [
    kqlQueryExpression,
  ]);
  const combinedQueries = combineQueries({
    config: esQuery.getEsQueryConfig(uiSettings),
    dataProviders,
    indexPattern,
    browserFields,
    filters: timelineFilter,
    kqlQuery,
    kqlMode,
    start,
    end,
    isEventViewer: false,
  });

  const timelineQuerySortField = useMemo(
    () => ({
      field: sort.columnId,
      direction: sort.sortDirection as Direction,
    }),
    [sort.columnId, sort.sortDirection]
  );

  const canQueryTimeline = useMemo(
    () =>
      combinedQueries != null &&
      isLoadingIndexPattern != null &&
      !isLoadingIndexPattern &&
      !isEmpty(start) &&
      !isEmpty(end),
    [isLoadingIndexPattern, combinedQueries, start, end]
  );

  const [
    loading,
    { events, updatedAt, inspect, loadPage, pageInfo, refetch, totalCount = 0 },
  ] = useTimelineEvents({
    docValueFields,
    fields: timelineQueryFields,
    filterQuery: combinedQueries!.filterQuery,
    id: timelineId,
    indexNames: selectedPatterns,
    limit: itemsPerPage,
    sort: timelineQuerySortField,
    startDate: start,
    endDate: end,
    skip: !canQueryTimeline,
  });

  const [selectedEvent, setSelectedEvent] = useState<{
    eventId: 'string';
    index: 'string';
  } | null>(
    // null
    { index: 'auditbeat-7.8.0-2020.10.22-000002', eventId: '-gAQXHUBGDghaSkLezaB' }
  );

  const handleEventSelect = useCallback(
    (event) =>
      setSelectedEvent((currentSelectedEvent) => {
        if (currentSelectedEvent?.eventId === event._id) {
          return null;
        }

        return {
          index: event._index!,
          eventId: event._id,
        };
      }),
    []
  );

  const actionsColumnWidth = useMemo(
    () =>
      getActionsColumnWidth(
        isEventViewer,
        showCheckboxes,
        hasAdditionalActions(timelineId as TimelineId) ? DEFAULT_ICON_BUTTON_WIDTH + EXTRA_WIDTH : 0
      ),
    [isEventViewer, showCheckboxes, timelineId]
  );

  const columnWidths = useMemo(
    () =>
      columnHeaders.reduce((totalWidth, header) => totalWidth + header.width, actionsColumnWidth),
    [actionsColumnWidth, columnHeaders]
  );

  const toggleColumn = useCallback(
    (column: ColumnHeaderOptions) => {
      const exists = columns.findIndex((c) => c.id === column.id) !== -1;

      if (!exists) {
        dispatch(
          timelineActions.upsertColumn({
            column,
            id: timelineId,
            index: 1,
          })
        );
      }

      if (exists) {
        dispatch(
          timelineActions.removeColumn({
            columnId: column.id,
            id: timelineId,
          })
        );
      }
    },
    [columns, dispatch, timelineId]
  );

  const onSelectAll: OnSelectAll = useCallback(
    ({ isSelected }: { isSelected: boolean }) =>
      isSelected
        ? dispatch(
            timelineActions.setSelected!({
              id: timelineId,
              eventIds: getEventIdToDataMapping(
                events,
                events.map((event) => event._id),
                queryFields
              ),
              isSelected,
              isSelectAllChecked: isSelected,
            })
          )
        : dispatch(timelineActions.clearSelected!({ id: timelineId })),
    [dispatch, timelineId, events, queryFields]
  );

  const onAddNoteToEvent: AddNoteToEvent = useCallback(
    ({ eventId, noteId }: { eventId: string; noteId: string }) =>
      dispatch(timelineActions.addNoteToEvent!({ id: timelineId, eventId, noteId })),
    [dispatch, timelineId]
  );

  const onUpdateNote: UpdateNote = useCallback(
    (note: Note) => dispatch(appActions.updateNote!({ note })),
    [dispatch]
  );

  const onUpdateColumns: OnUpdateColumns = useCallback(
    (updatedColumns) =>
      dispatch(timelineActions.updateColumns!({ id: timelineId, columns: updatedColumns })),
    [dispatch, timelineId]
  );

  const onPinEvent: OnPinEvent = useCallback(
    (eventId) => dispatch(timelineActions.pinEvent!({ id: timelineId, eventId })),
    [dispatch, timelineId]
  );

  const onUnPinEvent: OnUnPinEvent = useCallback(
    (eventId) => dispatch(timelineActions.unPinEvent!({ id: timelineId, eventId })),
    [dispatch, timelineId]
  );

  const onRowSelected: OnRowSelected = useCallback(
    ({ eventIds, isSelected }: { eventIds: string[]; isSelected: boolean }) => {
      dispatch(
        timelineActions.setSelected!({
          id: timelineId,
          eventIds: getEventIdToDataMapping(events, eventIds, queryFields),
          isSelected,
          isSelectAllChecked:
            isSelected && Object.keys(selectedEventIds).length + 1 === events.length,
        })
      );
    },
    [dispatch, timelineId, events, selectedEventIds, queryFields]
  );

  const onChangeItemsPerPage: OnChangeItemsPerPage = useCallback(
    (itemsChangedPerPage) =>
      dispatch(
        timelineActions.updateItemsPerPage({ id: timelineId, itemsPerPage: itemsChangedPerPage })
      ),
    [dispatch, timelineId]
  );

  const enabledRowRenderers = useMemo(() => {
    if (
      excludedRowRendererIds &&
      excludedRowRendererIds.length === Object.keys(RowRendererId).length
    )
      return [plainRowRenderer];

    if (!excludedRowRendererIds) return rowRenderers;

    return rowRenderers.filter((rowRenderer) => !excludedRowRendererIds.includes(rowRenderer.id));
  }, [excludedRowRendererIds]);

  const totalCountMinusDeleted = useMemo(
    () => (totalCount > 0 ? totalCount - deletedEventIds.length : 0),
    [deletedEventIds.length, totalCount]
  );

  const nonDeletedEvents = useMemo(() => events.filter((e) => !deletedEventIds.includes(e._id)), [
    deletedEventIds,
    events,
  ]);

  const findNotesByIds = useCallback(
    (noteIdsVar: string[]): Note[] => appSelectors.getNotes(notesById, noteIdsVar),
    [notesById]
  );

  // Sync to selectAll so parent components can select all events
  useEffect(() => {
    if (selectAll && !isSelectAllChecked) {
      onSelectAll({ isSelected: true });
    }
  }, [isSelectAllChecked, onSelectAll, selectAll]);

  return (
    <>
      <EuiFlexGroup>
        <EuiFlexItem grow={2} style={{ width: '60%' }}>
          <div>
            <EuiFlexGroup
              alignItems="center"
              gutterSize="none"
              data-test-subj="timeline-date-picker-container"
            >
              <DatePicker grow={1}>
                <SuperDatePicker id="timeline" timelineId={timelineId} />
              </DatePicker>
              <EuiFlexItem grow={false}>
                <PickEventType eventType={eventType!} timelineId={timelineId} />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiFlexGroup>
              <EuiFlexItem>
                {/* <LockIconContainer grow={false}>
                  <EuiToolTip
                    data-test-subj="timeline-date-picker-lock-tooltip"
                    position="top"
                    content={
                      isDatepickerLocked
                        ? i18n.LOCK_SYNC_MAIN_DATE_PICKER_TOOL_TIP
                        : i18n.UNLOCK_SYNC_MAIN_DATE_PICKER_TOOL_TIP
                    }
                  >
                    <EuiButtonIcon
                      data-test-subj={`timeline-date-picker-${
                        isDatepickerLocked ? 'lock' : 'unlock'
                      }-button`}
                      color="primary"
                      onClick={toggleLock}
                      iconType={isDatepickerLocked ? 'lock' : 'lockOpen'}
                      aria-label={
                        isDatepickerLocked
                          ? i18n.UNLOCK_SYNC_MAIN_DATE_PICKER_ARIA
                          : i18n.LOCK_SYNC_MAIN_DATE_PICKER_ARIA
                      }
                    />
                  </EuiToolTip>
                </LockIconContainer> */}
              </EuiFlexItem>
            </EuiFlexGroup>
          </div>
          <DataProviders
            browserFields={browserFields}
            timelineId={timelineId}
            dataProviders={dataProviders}
          />
          <StatefulSearchOrFilter
            browserFields={browserFields}
            filterManager={filterManager}
            indexPattern={indexPattern}
            timelineId={timelineId}
          />
          <TimelineBody
            data-test-subj="timeline-body"
            data-timeline-id={timelineId}
            visible={show && !graphEventId}
          >
            <EventsTable data-test-subj="events-table" columnWidths={columnWidths}>
              <ColumnHeaders
                actionsColumnWidth={actionsColumnWidth}
                browserFields={browserFields}
                columnHeaders={columnHeaders}
                isEventViewer={isEventViewer}
                isSelectAllChecked={isSelectAllChecked}
                onSelectAll={onSelectAll}
                showEventsSelect={false}
                showSelectAllCheckbox={showCheckboxes}
                sort={sort}
                timelineId={timelineId}
                toggleColumn={toggleColumn}
              />

              <EventsTbody data-test-subj="events">
                {events.map((event) => (
                  <StatefulEvent
                    actionsColumnWidth={actionsColumnWidth}
                    addNoteToEvent={onAddNoteToEvent}
                    browserFields={browserFields}
                    columnHeaders={columnHeaders}
                    event={event}
                    eventIdToNoteIds={eventIdToNoteIds}
                    getNotesByIds={findNotesByIds}
                    isEventPinned={eventIsPinned({ eventId: event._id, pinnedEventIds })}
                    isEventViewer={isEventViewer}
                    key={`${event._id}_${event._index}`}
                    loadingEventIds={loadingEventIds}
                    onPinEvent={onPinEvent}
                    onRowSelected={onRowSelected}
                    onUnPinEvent={onUnPinEvent}
                    refetch={refetch}
                    rowRenderers={enabledRowRenderers}
                    selectedEventIds={selectedEventIds}
                    showCheckboxes={showCheckboxes}
                    timelineId={timelineId}
                    updateNote={onUpdateNote}
                    onEventSelect={handleEventSelect}
                  />
                ))}
              </EventsTbody>
            </EventsTable>
          </TimelineBody>
          {
            /** Hide the footer if Resolver is showing. */
            !graphEventId && (
              <StyledEuiFlyoutFooter
                data-test-subj="eui-flyout-footer"
                className="timeline-flyout-footer"
              >
                <Footer
                  activePage={pageInfo.activePage}
                  updatedAt={updatedAt}
                  height={footerHeight}
                  timelineId={timelineId}
                  isLive={isLive}
                  isLoading={loading}
                  itemsCount={nonDeletedEvents.length}
                  itemsPerPage={itemsPerPage}
                  itemsPerPageOptions={itemsPerPageOptions}
                  onChangeItemsPerPage={onChangeItemsPerPage}
                  onChangePage={loadPage}
                  totalCount={totalCount}
                  data-test-subj="timeline-footer"
                />
              </StyledEuiFlyoutFooter>
            )
          }
        </EuiFlexItem>
        <EuiFlexItem grow={1}>
          <EuiAccordion id="accordion9" buttonContent="Arrows default to the left" paddingSize="s">
            <EuiText>
              <p>
                {`Any content inside of `}
                <strong>{`EuiAccordion`}</strong>
                {` will appear here.`}
              </p>
            </EuiText>
          </EuiAccordion>
          <EuiAccordion id="accordion9" buttonContent="Arrows default to the left" paddingSize="s">
            {selectedEvent && (
              <StatefulEventDetails
                browserFields={browserFields}
                columnHeaders={columnHeaders}
                docValueFields={docValueFields}
                event={selectedEvent}
                onUpdateColumns={onUpdateColumns}
                timelineId={timelineId}
                toggleColumn={toggleColumn}
              />
            )}
          </EuiAccordion>
        </EuiFlexItem>
      </EuiFlexGroup>
      <TimelineBodyGlobalStyle />
    </>
  );
};

export const QueryTabContent = React.memo(QueryTabContentComponent);

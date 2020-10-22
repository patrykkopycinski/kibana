/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { EuiAccordion, EuiText, EuiFlyoutFooter, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import React, { useMemo, useRef } from 'react';
import styled from 'styled-components';

import { inputsModel } from '../../../../common/store';
import { BrowserFields, DocValueFields } from '../../../../common/containers/source';
import { TimelineItem, TimelineNonEcsData } from '../../../../../common/search_strategy';
import { Note } from '../../../../common/lib/note';
import { ColumnHeaderOptions } from '../../../../timelines/store/timeline/model';
import { AddNoteToEvent, UpdateNote } from '../../notes/helpers';
import {
  OnColumnRemoved,
  OnColumnResized,
  OnColumnSorted,
  OnPinEvent,
  OnRowSelected,
  OnSelectAll,
  OnUnPinEvent,
  OnUpdateColumns,
} from '../events';
import { EventsTable, TimelineBody, TimelineBodyGlobalStyle } from '../styles';
import { ColumnHeaders } from './column_headers';
import { getActionsColumnWidth } from './column_headers/helpers';
import { Events } from './events';
import { ColumnRenderer } from './renderers/column_renderer';
import { RowRenderer } from './renderers/row_renderer';
import { Sort } from './sort';
import { GraphOverlay } from '../../graph_overlay';
import { DEFAULT_ICON_BUTTON_WIDTH } from '../helpers';
import { TimelineEventsType, TimelineId, TimelineType } from '../../../../../common/types/timeline';
import { Footer, footerHeight } from '../footer';

const StyledEuiFlyoutFooter = styled(EuiFlyoutFooter)`
  background: none;
  padding: 0 10px 5px 12px;
`;

export interface BodyProps {
  addNoteToEvent: AddNoteToEvent;
  browserFields: BrowserFields;
  columnHeaders: ColumnHeaderOptions[];
  columnRenderers: ColumnRenderer[];
  data: TimelineItem[];
  docValueFields: DocValueFields[];
  getNotesByIds: (noteIds: string[]) => Note[];
  graphEventId?: string;
  isEventViewer?: boolean;
  isSelectAllChecked: boolean;
  eventIdToNoteIds: Readonly<Record<string, string[]>>;
  eventType?: TimelineEventsType;
  loadingEventIds: Readonly<string[]>;
  onColumnRemoved: OnColumnRemoved;
  onColumnResized: OnColumnResized;
  onColumnSorted: OnColumnSorted;
  onRowSelected: OnRowSelected;
  onSelectAll: OnSelectAll;
  onPinEvent: OnPinEvent;
  onUpdateColumns: OnUpdateColumns;
  onUnPinEvent: OnUnPinEvent;
  pinnedEventIds: Readonly<Record<string, boolean>>;
  refetch: inputsModel.Refetch;
  onRuleChange?: () => void;
  rowRenderers: RowRenderer[];
  selectedEventIds: Readonly<Record<string, TimelineNonEcsData[]>>;
  show: boolean;
  showCheckboxes: boolean;
  sort: Sort;
  timelineId: string;
  timelineType: TimelineType;
  toggleColumn: (column: ColumnHeaderOptions) => void;
  updateNote: UpdateNote;
  // footer
  updatedAt: number;
  activePage: number;
  height: number;
  isLive: boolean;
  isLoading: boolean;
  itemsCount: number;
  itemsPerPage: number;
  itemsPerPageOptions: number[];
  onChangeItemsPerPage: OnChangeItemsPerPage;
  onChangePage: OnChangePage;
  totalCount: number;
}

export const hasAdditionalActions = (id: TimelineId): boolean =>
  [TimelineId.detectionsPage, TimelineId.detectionsRulesDetailsPage, TimelineId.active].includes(
    id
  );

const EXTRA_WIDTH = 4; // px

/** Renders the timeline body */
export const Body = React.memo<BodyProps>(
  ({
    addNoteToEvent,
    browserFields,
    columnHeaders,
    columnRenderers,
    data,
    docValueFields,
    eventIdToNoteIds,
    getNotesByIds,
    graphEventId,
    isEventViewer = false,
    isSelectAllChecked,
    loadingEventIds,
    onColumnRemoved,
    onColumnResized,
    onColumnSorted,
    onRowSelected,
    onSelectAll,
    onPinEvent,
    onUpdateColumns,
    onUnPinEvent,
    pinnedEventIds,
    rowRenderers,
    refetch,
    onRuleChange,
    selectedEventIds,
    show,
    showCheckboxes,
    sort,
    toggleColumn,
    timelineId,
    timelineType,
    updateNote,
    // footer
    activePage,
    updatedAt,
    height,
    isLive,
    isLoading,
    itemsCount,
    itemsPerPage,
    itemsPerPageOptions,
    onChangeItemsPerPage,
    onChangePage,
    totalCount,
  }) => {
    const containerElementRef = useRef<HTMLDivElement>(null);
    const actionsColumnWidth = useMemo(
      () =>
        getActionsColumnWidth(
          isEventViewer,
          showCheckboxes,
          hasAdditionalActions(timelineId as TimelineId)
            ? DEFAULT_ICON_BUTTON_WIDTH + EXTRA_WIDTH
            : 0
        ),
      [isEventViewer, showCheckboxes, timelineId]
    );

    const columnWidths = useMemo(
      () =>
        columnHeaders.reduce((totalWidth, header) => totalWidth + header.width, actionsColumnWidth),
      [actionsColumnWidth, columnHeaders]
    );

    return (
      <>
        {graphEventId && (
          <GraphOverlay
            graphEventId={graphEventId}
            isEventViewer={isEventViewer}
            timelineId={timelineId}
            timelineType={timelineType}
          />
        )}
        <EuiFlexGroup>
          <EuiFlexItem grow={2}>
            <TimelineBody
              data-test-subj="timeline-body"
              data-timeline-id={timelineId}
              ref={containerElementRef}
              visible={show && !graphEventId}
            >
              <EventsTable data-test-subj="events-table" columnWidths={columnWidths}>
                <ColumnHeaders
                  actionsColumnWidth={actionsColumnWidth}
                  browserFields={browserFields}
                  columnHeaders={columnHeaders}
                  isEventViewer={isEventViewer}
                  isSelectAllChecked={isSelectAllChecked}
                  onColumnRemoved={onColumnRemoved}
                  onColumnResized={onColumnResized}
                  onColumnSorted={onColumnSorted}
                  onSelectAll={onSelectAll}
                  onUpdateColumns={onUpdateColumns}
                  showEventsSelect={false}
                  showSelectAllCheckbox={showCheckboxes}
                  sort={sort}
                  timelineId={timelineId}
                  toggleColumn={toggleColumn}
                />

                <Events
                  containerElementRef={containerElementRef.current!}
                  actionsColumnWidth={actionsColumnWidth}
                  addNoteToEvent={addNoteToEvent}
                  browserFields={browserFields}
                  columnHeaders={columnHeaders}
                  columnRenderers={columnRenderers}
                  data={data}
                  docValueFields={docValueFields}
                  eventIdToNoteIds={eventIdToNoteIds}
                  getNotesByIds={getNotesByIds}
                  id={timelineId}
                  isEventViewer={isEventViewer}
                  loadingEventIds={loadingEventIds}
                  onPinEvent={onPinEvent}
                  onRowSelected={onRowSelected}
                  onUpdateColumns={onUpdateColumns}
                  onUnPinEvent={onUnPinEvent}
                  pinnedEventIds={pinnedEventIds}
                  refetch={refetch}
                  rowRenderers={rowRenderers}
                  onRuleChange={onRuleChange}
                  selectedEventIds={selectedEventIds}
                  showCheckboxes={showCheckboxes}
                  toggleColumn={toggleColumn}
                  updateNote={updateNote}
                />
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
                    activePage={activePage}
                    updatedAt={updatedAt}
                    height={height}
                    isLive={isLive}
                    isLoading={isLoading}
                    itemsCount={itemsCount}
                    itemsPerPage={itemsPerPage}
                    itemsPerPageOptions={itemsPerPageOptions}
                    onChangeItemsPerPage={onChangeItemsPerPage}
                    onChangePage={onChangePage}
                    totalCount={totalCount}
                    data-test-subj="timeline-footer"
                  />
                </StyledEuiFlyoutFooter>
              )
            }
          </EuiFlexItem>
          <EuiFlexItem grow={1}>
            <EuiAccordion
              id="accordion9"
              buttonContent="Arrows default to the left"
              paddingSize="s"
            >
              <EuiText>
                <p>
                  {`Any content inside of `}
                  <strong>{`EuiAccordion`}</strong>
                  {` will appear here.`}
                </p>
              </EuiText>
            </EuiAccordion>
            <EuiAccordion
              id="accordion9"
              buttonContent="Arrows default to the left"
              paddingSize="s"
            >
              <EuiText>
                <p>
                  {`Any content inside of `}
                  <strong>{`EuiAccordion`}</strong>
                  {` will appear here.`}
                </p>
              </EuiText>
            </EuiAccordion>
          </EuiFlexItem>
        </EuiFlexGroup>
        <TimelineBodyGlobalStyle />
      </>
    );
  }
);
Body.displayName = 'Body';

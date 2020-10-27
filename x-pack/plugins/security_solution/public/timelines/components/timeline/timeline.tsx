/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { EuiFlyoutHeader, EuiFlyoutBody, EuiProgress, EuiTabbedContent } from '@elastic/eui';
import { isEmpty } from 'lodash/fp';
import React, { useState, useMemo, useEffect } from 'react';
import styled from 'styled-components';

import { FlyoutHeaderWithCloseButton } from '../flyout/header_with_close_button';
import { BrowserFields, DocValueFields } from '../../../common/containers/source';
import { Direction } from '../../../../common/search_strategy';
import { useTimelineEvents } from '../../containers/index';
import { useKibana } from '../../../common/lib/kibana';
import { ColumnHeaderOptions, KqlMode } from '../../../timelines/store/timeline/model';
import { defaultHeaders } from './body/column_headers/default_headers';
import { Sort } from './body/sort';
import { DataProvider } from './data_providers/data_provider';
import { OnChangeItemsPerPage } from './events';
import { TimelineKqlFetch } from './fetch_kql_timeline';
import { TimelineHeader } from './header';
import { combineQueries } from './helpers';
import { TimelineRefetch } from './refetch_timeline';
import { TIMELINE_TEMPLATE } from './translations';
import {
  esQuery,
  Filter,
  FilterManager,
  IIndexPattern,
} from '../../../../../../../src/plugins/data/public';
import { useManageTimeline } from '../manage_timeline';
import { TimelineType, TimelineStatusLiteral } from '../../../../common/types/timeline';
import { requiredFieldsForActions } from '../../../detections/components/alerts_table/default_config';
import { QueryTabContent } from './query_tab';
import { NotesTabContent } from './notes_tab';
import { GraphOverlay } from '../graph_overlay';
import { SourcererScopeName } from '../../../common/store/sourcerer/model';

const TimelineContainer = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
`;

const TimelineHeaderContainer = styled.div`
  margin-top: 6px;
  width: 100%;
`;

TimelineHeaderContainer.displayName = 'TimelineHeaderContainer';

const StyledEuiFlyoutHeader = styled(EuiFlyoutHeader)`
  align-items: center;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  padding: 14px 10px 0 12px;
`;

const StyledEuiFlyoutBody = styled(EuiFlyoutBody)`
  // overflow-y: hidden;
  // flex: 1;

  // .euiFlyoutBody__overflow {
  //   overflow: hidden;
  //   mask-image: none;
  // }

  // .euiFlyoutBody__overflowContent {
  //   padding: 0 10px 0 12px;
  //   height: 100%;
  //   display: flex;
  // }
`;

const TimelineTemplateBadge = styled.div`
  background: ${({ theme }) => theme.eui.euiColorVis3_behindText};
  color: #fff;
  padding: 10px 15px;
  font-size: 0.8em;
`;

export interface Props {
  browserFields: BrowserFields;
  columns: ColumnHeaderOptions[];
  dataProviders: DataProvider[];
  docValueFields: DocValueFields[];
  end: string;
  filters: Filter[];
  graphEventId?: string;
  id: string;
  indexNames: string[];
  indexPattern: IIndexPattern;
  isLive: boolean;
  isSaving: boolean;
  itemsPerPage: number;
  itemsPerPageOptions: number[];
  kqlMode: KqlMode;
  kqlQueryExpression: string;
  loadingSourcerer: boolean;
  onChangeItemsPerPage: OnChangeItemsPerPage;
  onClose: () => void;
  show: boolean;
  showCallOutUnauthorizedMsg: boolean;
  sort: Sort;
  start: string;
  status: TimelineStatusLiteral;
  timelineType: TimelineType;
  usersViewing: string[];
}

/** The parent Timeline component */
export const TimelineComponent: React.FC<Props> = ({
  browserFields,
  columns,
  dataProviders,
  docValueFields,
  end,
  filters,
  graphEventId,
  id,
  indexPattern,
  indexNames,
  isLive,
  loadingSourcerer,
  isSaving,
  itemsPerPage,
  itemsPerPageOptions,
  kqlMode,
  kqlQueryExpression,
  onChangeItemsPerPage,
  onClose,
  show,
  showCallOutUnauthorizedMsg,
  start,
  status,
  sort,
  timelineType,
  usersViewing,
}) => {
  const kibana = useKibana();
  const [filterManager] = useState<FilterManager>(new FilterManager(kibana.services.uiSettings));
  const esQueryConfig = useMemo(() => esQuery.getEsQueryConfig(kibana.services.uiSettings), [
    kibana.services.uiSettings,
  ]);
  const kqlQuery = useMemo(() => ({ query: kqlQueryExpression, language: 'kuery' }), [
    kqlQueryExpression,
  ]);
  const combinedQueries = useMemo(
    () =>
      combineQueries({
        config: esQueryConfig,
        dataProviders,
        indexPattern,
        browserFields,
        filters,
        kqlQuery,
        kqlMode,
        start,
        end,
      }),
    [
      browserFields,
      dataProviders,
      esQueryConfig,
      start,
      end,
      filters,
      indexPattern,
      kqlMode,
      kqlQuery,
    ]
  );

  const canQueryTimeline = useMemo(
    () =>
      combinedQueries != null &&
      loadingSourcerer != null &&
      !loadingSourcerer &&
      !isEmpty(start) &&
      !isEmpty(end),
    [loadingSourcerer, combinedQueries, start, end]
  );
  const columnsHeader = isEmpty(columns) ? defaultHeaders : columns;
  const timelineQueryFields = useMemo(() => {
    const columnFields = columnsHeader.map((c) => c.id);
    return [...columnFields, ...requiredFieldsForActions];
  }, [columnsHeader]);
  const timelineQuerySortField = useMemo(
    () => ({
      field: sort.columnId,
      direction: sort.sortDirection as Direction,
    }),
    [sort.columnId, sort.sortDirection]
  );
  const [isQueryLoading, setIsQueryLoading] = useState(false);
  const { initializeTimeline, setIsTimelineLoading } = useManageTimeline();
  useEffect(() => {
    initializeTimeline({
      filterManager,
      id,
    });
  }, [initializeTimeline, filterManager, id]);

  const [
    loading,
    { events, inspect, totalCount, pageInfo, loadPage, updatedAt, refetch },
  ] = useTimelineEvents({
    docValueFields,
    endDate: end,
    id,
    indexNames,
    fields: timelineQueryFields,
    limit: itemsPerPage,
    filterQuery: combinedQueries?.filterQuery ?? '',
    startDate: start,
    skip: !canQueryTimeline,
    sort: timelineQuerySortField,
  });

  useEffect(() => {
    setIsTimelineLoading({ id, isLoading: isQueryLoading || loadingSourcerer });
  }, [loadingSourcerer, id, isQueryLoading, setIsTimelineLoading]);

  useEffect(() => {
    setIsQueryLoading(loading);
  }, [loading]);

  const tabs = [
    {
      id: 'query',
      name: 'Query',
      content: (
        <QueryTabContent
          isEventViewer={false}
          scopeId={SourcererScopeName.default}
          timelineId={id}
          filterManager={filterManager}
        />
      ),
    },
    {
      id: 'notes',
      name: 'Notes',
      content: <NotesTabContent />,
    },
  ];

  return (
    <TimelineContainer data-test-subj="timeline">
      {isSaving && <EuiProgress size="s" color="primary" position="absolute" />}
      {timelineType === TimelineType.template && (
        <TimelineTemplateBadge>{TIMELINE_TEMPLATE}</TimelineTemplateBadge>
      )}
      <StyledEuiFlyoutHeader data-test-subj="eui-flyout-header" hasBorder={false}>
        <FlyoutHeaderWithCloseButton
          onClose={onClose}
          timelineId={id}
          usersViewing={usersViewing}
        />
        <TimelineHeaderContainer data-test-subj="timelineHeader">
          <TimelineHeader
            browserFields={browserFields}
            indexPattern={indexPattern}
            dataProviders={dataProviders}
            filterManager={filterManager}
            graphEventId={graphEventId}
            show={show}
            showCallOutUnauthorizedMsg={showCallOutUnauthorizedMsg}
            timelineId={id}
            status={status}
          />
        </TimelineHeaderContainer>
      </StyledEuiFlyoutHeader>
      <TimelineKqlFetch id={id} indexPattern={indexPattern} inputId="timeline" />
      {/* {canQueryTimeline ? (
        <>
          <TimelineRefetch
            id={id}
            inputId="timeline"
            inspect={inspect}
            loading={loading}
            refetch={refetch}
          /> */}
      <StyledEuiFlyoutBody data-test-subj="eui-flyout-body" className="timeline-flyout-body">
        <>
          {graphEventId && (
            <GraphOverlay
              graphEventId={graphEventId}
              isEventViewer={false}
              timelineId={id}
              timelineType={timelineType}
            />
          )}
          <EuiTabbedContent
            tabs={tabs}
            initialSelectedTab={tabs[0]}
            autoFocus="selected"
            onTabClick={(tab) => {
              console.error('clicked tab', tab);
            }}
          />
        </>
      </StyledEuiFlyoutBody>
      {/* </>
      ) : null} */}
    </TimelineContainer>
  );
};

export const Timeline = React.memo(TimelineComponent);

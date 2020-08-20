/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import deepEqual from 'fast-deep-equal';
import { getOr, uniqBy, noop } from 'lodash/fp';
import memoizeOne from 'memoize-one';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Query } from 'react-apollo';
import { compose, Dispatch } from 'redux';
import { connect, ConnectedProps, useDispatch, useSelector, shallowEqual } from 'react-redux';

import { FilterManager, IIndexPattern } from '../../../../../../src/plugins/data/public';
import { getInvestigateInResolverAction } from '../components/timeline/body/helpers';

import { useManageTimeline } from '../components/manage_timeline';
import { generateTablePaginationOptions } from '../../common/components/paginated_table/helpers';
import { DEFAULT_INDEX_KEY } from '../../../common/constants';
import {
  GetTimelineQuery,
  PageInfo,
  SortField,
  TimelineEdges,
  TimelineItem,
} from '../../graphql/types';
import { inputsModel, inputsSelectors, State } from '../../common/store';
import { withKibana, WithKibanaProps, useKibana } from '../../common/lib/kibana';
import { createFilter } from '../../common/containers/helpers';
import { QueryTemplate, QueryTemplateProps } from '../../common/containers/query_template';
import { EventType } from '../../timelines/store/timeline/model';
import { timelineQuery } from './index.gql_query';
import { timelineActions } from '../../timelines/store/timeline';
import { detectionsTimelineIds, skipQueryForDetectionsPage } from './helpers';

export interface TimelineArgs {
  events: TimelineItem[];
  id: string;
  inspect: inputsModel.InspectQuery;
  loading: boolean;
  loadMore: LoadPage;
  pageInfo: PageInfo;
  refetch: inputsModel.Refetch;
  totalCount: number;
  getUpdatedAt: () => number;
}

export interface CustomReduxProps {
  clearSignalsState: ({ id }: { id?: string }) => void;
}

type LoadPage = (newActivePage: number) => void;

interface UseTimelineProps extends QueryTemplateProps {
  endDate: string;
  eventType?: EventType;
  filterManager: FilterManager;
  id: string;
  indexPattern?: IIndexPattern;
  indexToAdd?: string[];
  limit: number;
  loadingIndexName: boolean;
  sortField: SortField;
  fields: string[];
  startDate: string;
  queryDeduplication: string;
}

const getTimelineEvents = (variables: string, timelineEdges: TimelineEdges[]): TimelineItem[] =>
  timelineEdges.map((e: TimelineEdges) => e.node);

const ID = 'timelineQuery';

export const useTimeline = ({
  docValueFields,
  endDate,
  eventType = 'raw',
  filterManager,
  id,
  indexPattern,
  indexToAdd = [],
  limit,
  loadingIndexName,
  fields,
  filterQuery,
  sourceId,
  sortField,
  startDate,
}: UseTimelineProps): [boolean, TimelineArgs] => {
  const dispatch = useDispatch();
  const getQuery = inputsSelectors.timelineQueryByIdSelector();
  const { isInspected } = useSelector((state: State) => getQuery(state, id), shallowEqual);
  const { data, notifications, uiSettings } = useKibana().services;
  const refetch = useRef<inputsModel.Refetch>(noop);
  const abortCtrl = useRef(new AbortController());
  const defaultKibanaIndex = uiSettings.get<string[]>(DEFAULT_INDEX_KEY);
  const defaultIndex =
    indexPattern == null || (indexPattern != null && indexPattern.title === '')
      ? [
          ...(['all', 'raw'].includes(eventType) ? defaultKibanaIndex : []),
          ...(['all', 'alert', 'signal'].includes(eventType) ? indexToAdd : []),
        ]
      : indexPattern?.title.split(',') ?? [];
  const [loading, setLoading] = useState(false);
  const [timelineRequest, setTimelineRequest] = useState<TimelineRequestOptions>({
    fieldRequested: fields,
    filterQuery: createFilter(filterQuery),
    sourceId,
    timerange: {
      interval: '12h',
      from: startDate,
      to: endDate,
    },
    // pagination: generateTablePaginationOptions(activePage, limit),
    pagination: generateTablePaginationOptions(0, limit),
    sort: {
      direction: 'asc',
      field: sortField,
    },
    defaultIndex,
    docValueFields: docValueFields ?? [],
    inspect: isInspected,
    factoryQueryType: 'timeline',
  });
  const { initializeTimeline, setIndexToAdd, setIsTimelineLoading } = useManageTimeline();
  useEffect(() => {
    initializeTimeline({
      filterManager,
      id,
      indexToAdd,
      timelineRowActions: () => [getInvestigateInResolverAction({ dispatch, timelineId: id })],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIsTimelineLoading({ id, isLoading: loading || loadingIndexName });
  }, [loadingIndexName, id, setIsTimelineLoading, loading]);

  useEffect(() => {
    setIndexToAdd({ id, indexToAdd });
  }, [id, indexToAdd, setIndexToAdd]);

  const clearSignalsState = useCallback(() => {
    if (id != null && detectionsTimelineIds.some((timelineId) => timelineId === id)) {
      dispatch(timelineActions.clearEventsLoading({ id }));
      dispatch(timelineActions.clearEventsDeleted({ id }));
    }
  }, [dispatch, id]);

  const wrappedLoadMore = useCallback(
    (newActivePage: number) => {
      clearSignalsState();
      setTimelineRequest((prevRequest) => {
        return {
          ...prevRequest,
          pagination: generateTablePaginationOptions(newActivePage, limit),
        };
      });
    },
    [clearSignalsState, limit]
  );

  const [timelineResponse, setTimelineResponse] = useState<TimelineArgs>({
    id: ID,
    inspect: {
      dsl: [],
      response: [],
    },
    refetch: refetch.current,
    totalCount: -1,
    pageInfo: {
      activePage: 0,
      fakeTotalCount: 0,
      showMorePagesIndicator: false,
    },
    events: [],
    loadMore: wrappedLoadMore,
    getUpdatedAt: () => Date.now(),
  });

  const timelineSearch = useCallback(
    (request: TimelineRequestOptions) => {
      let didCancel = false;
      const asyncSearch = async () => {
        abortCtrl.current = new AbortController();
        setLoading(true);

        const searchSubscription$ = data.search
          .search<TimelineRequestOptions, HostsStrategyResponse>(request, {
            strategy: 'securitySolutionTimelineSearchStrategy',
            signal: abortCtrl.current.signal,
          })
          .subscribe({
            next: (response) => {
              if (!response.isPartial && !response.isRunning) {
                if (!didCancel) {
                  setLoading(false);
                  setTimelineResponse((prevResponse) => ({
                    ...prevResponse,
                    events: response.edges,
                    inspect: response.inspect ?? prevResponse.inspect,
                    pageInfo: response.pageInfo,
                    refetch: refetch.current,
                    totalCount: response.totalCount,
                  }));
                }
                searchSubscription$.unsubscribe();
              } else if (response.isPartial && !response.isRunning) {
                if (!didCancel) {
                  setLoading(false);
                }
                // notifications.toasts.addWarning(i18n.ERROR_ALL_HOST);
                searchSubscription$.unsubscribe();
              }
            },
            error: (msg) => {
              if (msg.message !== 'Aborted') {
                // notifications.toasts.addDanger({ title: i18n.FAIL_ALL_HOST, text: msg.message });
              }
            },
          });
      };
      abortCtrl.current.abort();
      asyncSearch();
      refetch.current = asyncSearch;
      return () => {
        didCancel = true;
        abortCtrl.current.abort();
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.search, notifications.toasts]
  );

  useEffect(() => {
    setTimelineRequest((prevRequest) => {
      const myRequest = {
        ...prevRequest,
        defaultIndex,
        docValueFields: docValueFields ?? [],
        filterQuery: createFilter(filterQuery),
        // pagination: generateTablePaginationOptions(activePage, limit),
        pagination: generateTablePaginationOptions(0, limit),
        timerange: {
          interval: '12h',
          from: startDate,
          to: endDate,
        },
        sort: {
          direction: 'asc',
          field: sortField,
        },
      };
      if (!deepEqual(prevRequest, myRequest)) {
        return myRequest;
      }
      return prevRequest;
    });
  }, [defaultIndex, docValueFields, endDate, filterQuery, limit, startDate, sortField]);

  useEffect(() => {
    timelineSearch(timelineRequest);
  }, [timelineRequest, timelineSearch]);

  return [loading, timelineResponse];
};

export interface OwnProps extends QueryTemplateProps {
  children?: (args: TimelineArgs) => React.ReactNode;
  endDate: string;
  eventType?: EventType;
  id: string;
  indexPattern?: IIndexPattern;
  indexToAdd?: string[];
  limit: number;
  sortField: SortField;
  fields: string[];
  startDate: string;
  queryDeduplication: string;
}

type TimelineQueryProps = OwnProps & PropsFromRedux & WithKibanaProps & CustomReduxProps;

class TimelineQueryComponent extends QueryTemplate<
  TimelineQueryProps,
  GetTimelineQuery.Query,
  GetTimelineQuery.Variables
> {
  private updatedDate: number = Date.now();
  private memoizedTimelineEvents: (variables: string, events: TimelineEdges[]) => TimelineItem[];

  constructor(props: TimelineQueryProps) {
    super(props);
    this.memoizedTimelineEvents = memoizeOne(this.getTimelineEvents);
  }

  public render() {
    const {
      children,
      clearSignalsState,
      docValueFields,
      endDate,
      eventType = 'raw',
      id,
      indexPattern,
      indexToAdd = [],
      isInspected,
      kibana,
      limit,
      fields,
      filterQuery,
      sourceId,
      sortField,
      startDate,
      queryDeduplication,
    } = this.props;
    const defaultKibanaIndex = kibana.services.uiSettings.get<string[]>(DEFAULT_INDEX_KEY);
    const defaultIndex =
      indexPattern == null || (indexPattern != null && indexPattern.title === '')
        ? [
            ...(['all', 'raw'].includes(eventType) ? defaultKibanaIndex : []),
            ...(['all', 'alert', 'signal'].includes(eventType) ? indexToAdd : []),
          ]
        : indexPattern?.title.split(',') ?? [];
    // Fun fact: When using this hook multiple times within a component (e.g. add_exception_modal & edit_exception_modal),
    // the apolloClient will perform queryDeduplication and prevent the first query from executing. A deep compare is not
    // performed on `indices`, so another field must be passed to circumvent this.
    // For details, see https://github.com/apollographql/react-apollo/issues/2202
    const variables: GetTimelineQuery.Variables & { queryDeduplication: string } = {
      fieldRequested: fields,
      filterQuery: createFilter(filterQuery),
      sourceId,
      timerange: {
        interval: '12h',
        from: startDate,
        to: endDate,
      },
      pagination: { limit, cursor: null, tiebreaker: null },
      sortField,
      defaultIndex,
      docValueFields: docValueFields ?? [],
      inspect: isInspected,
      queryDeduplication,
    };

    return (
      <Query<GetTimelineQuery.Query, GetTimelineQuery.Variables>
        query={timelineQuery}
        fetchPolicy="network-only"
        notifyOnNetworkStatusChange
        skip={skipQueryForDetectionsPage(id, defaultIndex)}
        variables={variables}
      >
        {({ data, loading, fetchMore, refetch }) => {
          this.setRefetch(refetch);
          this.setExecuteBeforeRefetch(clearSignalsState);
          this.setExecuteBeforeFetchMore(clearSignalsState);

          const timelineEdges = getOr([], 'source.Timeline.edges', data);
          this.setFetchMore(fetchMore);
          this.setFetchMoreOptions((newCursor: string, tiebreaker?: string) => ({
            variables: {
              pagination: {
                cursor: newCursor,
                tiebreaker,
                limit,
              },
            },
            updateQuery: (prev, { fetchMoreResult }) => {
              if (!fetchMoreResult) {
                return prev;
              }
              return {
                ...fetchMoreResult,
                source: {
                  ...fetchMoreResult.source,
                  Timeline: {
                    ...fetchMoreResult.source.Timeline,
                    edges: uniqBy('node._id', [
                      ...prev.source.Timeline.edges,
                      ...fetchMoreResult.source.Timeline.edges,
                    ]),
                  },
                },
              };
            },
          }));
          this.updatedDate = Date.now();
          return children!({
            id,
            inspect: getOr(null, 'source.Timeline.inspect', data),
            refetch: this.wrappedRefetch,
            loading,
            totalCount: getOr(0, 'source.Timeline.totalCount', data),
            pageInfo: getOr({}, 'source.Timeline.pageInfo', data),
            events: this.memoizedTimelineEvents(JSON.stringify(variables), timelineEdges),
            loadMore: this.wrappedLoadMore,
            getUpdatedAt: this.getUpdatedAt,
          });
        }}
      </Query>
    );
  }

  private getUpdatedAt = () => this.updatedDate;

  private getTimelineEvents = (variables: string, timelineEdges: TimelineEdges[]): TimelineItem[] =>
    timelineEdges.map((e: TimelineEdges) => e.node);
}

const makeMapStateToProps = () => {
  const getQuery = inputsSelectors.timelineQueryByIdSelector();
  const mapStateToProps = (state: State, { id }: OwnProps) => {
    const { isInspected } = getQuery(state, id);
    return {
      isInspected,
    };
  };
  return mapStateToProps;
};

const mapDispatchToProps = (dispatch: Dispatch) => ({
  clearSignalsState: ({ id }: { id?: string }) => {
    if (id != null && detectionsTimelineIds.some((timelineId) => timelineId === id)) {
      dispatch(timelineActions.clearEventsLoading({ id }));
      dispatch(timelineActions.clearEventsDeleted({ id }));
    }
  },
});

const connector = connect(makeMapStateToProps, mapDispatchToProps);

type PropsFromRedux = ConnectedProps<typeof connector>;

export const TimelineQuery = compose<React.ComponentClass<OwnProps>>(
  connector,
  withKibana
)(TimelineQueryComponent);

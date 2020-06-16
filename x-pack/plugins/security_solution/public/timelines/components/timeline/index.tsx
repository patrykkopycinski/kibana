/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React, { useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import deepEqual from 'fast-deep-equal';

import { NO_ALERT_INDEX } from '../../../../common/constants';
import { WithSource } from '../../../common/containers/source';
import { useSignalIndex } from '../../../alerts/containers/detection_engine/alerts/use_signal_index';
import { inputsModel, inputsSelectors, State } from '../../../common/store';
import { timelineActions, timelineSelectors } from '../../store/timeline';
import { ColumnHeaderOptions, TimelineModel } from '../../../timelines/store/timeline/model';
import { timelineDefaults } from '../../../timelines/store/timeline/defaults';
import { defaultHeaders } from './body/column_headers/default_headers';
import {
  OnChangeItemsPerPage,
  OnDataProviderRemoved,
  OnDataProviderEdited,
  OnToggleDataProviderEnabled,
  OnToggleDataProviderExcluded,
} from './events';
import { Timeline } from './timeline';

export interface Props {
  id: string;
  onClose: () => void;
  usersViewing: string[];
}

const StatefulTimelineComponent: React.FC<Props> = ({
  columns,
  dataProviders,
  eventType,
  end,
  filters,
  id,
  isLive,
  itemsPerPage,
  itemsPerPageOptions,
  kqlMode,
  kqlQueryExpression,
  onClose,
  show,
  sort,
  start,
  usersViewing,
}) => {
  const dispatch = useDispatch();
  const { loading, signalIndexExists, signalIndexName } = useSignalIndex();
  const showCallOutUnauthorizedMsg = useSelector(timelineSelectors.getShowCallOutUnauthorizedMsg);
  const kqlQueryExpression = useSelector((state) =>
    timelineSelectors.getKqlFilterQuerySelector()(state, id)
  );
  const input = useSelector(inputsSelectors.getTimelineSelector);
  const {
    columns,
    dataProviders,
    eventType,
    filters,
    itemsPerPage,
    itemsPerPageOptions,
    kqlMode,
    show,
    sort,
  } = useSelector(
    (state) => timelineSelectors.getTimelineByIdSelector()(state, id) ?? timelineDefaults
  );

  const end = input.timerange.to;
  const isLive = input.policy.kind === 'interval';
  const start = input.timerange.from;

  const timelineFilter = kqlMode === 'filter' ? filters || [] : [];

  const indexToAdd = useMemo<string[]>(() => {
    if (
      eventType &&
      signalIndexExists &&
      signalIndexName != null &&
      ['signal', 'alert', 'all'].includes(eventType)
    ) {
      return [signalIndexName];
    }
    return [NO_ALERT_INDEX]; // Following index does not exist so we won't show any events;
  }, [eventType, signalIndexExists, signalIndexName]);

  const onDataProviderRemoved: OnDataProviderRemoved = useCallback(
    (providerId: string, andProviderId?: string) =>
      dispatch(timelineActions.removeProvider({ id, providerId, andProviderId })),
    [dispatch, id]
  );

  const onToggleDataProviderEnabled: OnToggleDataProviderEnabled = useCallback(
    ({ providerId, enabled, andProviderId }) =>
      dispatch(
        timelineActions.updateDataProviderEnabled({
          id,
          enabled,
          providerId,
          andProviderId,
        })
      ),
    [dispatch, id]
  );

  const onToggleDataProviderExcluded: OnToggleDataProviderExcluded = useCallback(
    ({ providerId, excluded, andProviderId }) =>
      dispatch(
        timelineActions.updateDataProviderExcluded({
          id,
          excluded,
          providerId,
          andProviderId,
        })
      ),
    [dispatch, id]
  );

  const onDataProviderEditedLocal: OnDataProviderEdited = useCallback(
    ({ andProviderId, excluded, field, operator, providerId, value }) =>
      dispatch(
        timelineActions.dataProviderEdited({
          andProviderId,
          excluded,
          field,
          id,
          operator,
          providerId,
          value,
        })
      ),
    [dispatch, id]
  );

  const onChangeItemsPerPage: OnChangeItemsPerPage = useCallback(
    (itemsChangedPerPage) =>
      dispatch(timelineActions.updateItemsPerPage!({ id, itemsPerPage: itemsChangedPerPage })),
    [dispatch, id]
  );

  const toggleColumn = useCallback(
    (column: ColumnHeaderOptions) => {
      const exists = columns.findIndex((c) => c.id === column.id) !== -1;

      if (!exists) {
        dispatch(
          timelineActions.upsertColumn({
            column,
            id,
            index: 1,
          })
        );
      }

      if (exists) {
        dispatch(
          timelineActions.removeColumn({
            columnId: column.id,
            id,
          })
        );
      }
    },
    [columns, dispatch, id]
  );

  useEffect(() => {
    dispatch(timelineActions.createTimeline({ id, columns: defaultHeaders, show: false }));
  }, [dispatch, id]);

  return (
    <WithSource sourceId="default" indexToAdd={indexToAdd}>
      {({ indexPattern, browserFields }) => (
        <Timeline
          browserFields={browserFields}
          columns={columns}
          dataProviders={dataProviders!}
          end={end}
          eventType={eventType}
          filters={timelineFilter}
          id={id}
          indexPattern={indexPattern}
          indexToAdd={indexToAdd}
          isLive={isLive}
          itemsPerPage={itemsPerPage!}
          itemsPerPageOptions={itemsPerPageOptions!}
          kqlMode={kqlMode}
          kqlQueryExpression={kqlQueryExpression}
          loadingIndexName={loading}
          onChangeItemsPerPage={onChangeItemsPerPage}
          onClose={onClose}
          onDataProviderEdited={onDataProviderEditedLocal}
          onDataProviderRemoved={onDataProviderRemoved}
          onToggleDataProviderEnabled={onToggleDataProviderEnabled}
          onToggleDataProviderExcluded={onToggleDataProviderExcluded}
          show={show!}
          showCallOutUnauthorizedMsg={showCallOutUnauthorizedMsg}
          sort={sort!}
          start={start}
          toggleColumn={toggleColumn}
          usersViewing={usersViewing}
        />
      )}
    </WithSource>
  );
};

StatefulTimelineComponent.displayName = 'StatefulTimelineComponent';

export const StatefulTimeline = React.memo(
  StatefulTimelineComponent,
  (prevProps, nextProps) =>
    prevProps.eventType === nextProps.eventType &&
    prevProps.end === nextProps.end &&
    prevProps.id === nextProps.id &&
    prevProps.isLive === nextProps.isLive &&
    prevProps.itemsPerPage === nextProps.itemsPerPage &&
    prevProps.kqlMode === nextProps.kqlMode &&
    prevProps.kqlQueryExpression === nextProps.kqlQueryExpression &&
    prevProps.show === nextProps.show &&
    prevProps.start === nextProps.start &&
    deepEqual(prevProps.columns, nextProps.columns) &&
    deepEqual(prevProps.dataProviders, nextProps.dataProviders) &&
    deepEqual(prevProps.filters, nextProps.filters) &&
    deepEqual(prevProps.itemsPerPageOptions, nextProps.itemsPerPageOptions) &&
    deepEqual(prevProps.sort, nextProps.sort) &&
    deepEqual(prevProps.usersViewing, nextProps.usersViewing)
);

StatefulTimeline.displayName = 'StatefulTimeline';

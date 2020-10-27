/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React, { useCallback, useState } from 'react';

import { BrowserFields, DocValueFields } from '../../containers/source';
import { TimelineEventsDetailsItem } from '../../../../common/search_strategy/timeline';
import { ColumnHeaderOptions } from '../../../timelines/store/timeline/model';
import { OnUpdateColumns } from '../../../timelines/components/timeline/events';

import { EventDetails, View } from './event_details';
import { useTimelineEventsDetails } from '../../../timelines/containers/details';

interface Props {
  browserFields: BrowserFields;
  columnHeaders: ColumnHeaderOptions[];
  docValueFields: DocValueFields[];
  event: {
    index: string;
    eventId: string;
  };
  onUpdateColumns: OnUpdateColumns;
  timelineId: string;
  toggleColumn: (column: ColumnHeaderOptions) => void;
}

export const StatefulEventDetails = React.memo<Props>(
  ({
    browserFields,
    columnHeaders,
    docValueFields,
    event,
    onUpdateColumns,
    timelineId,
    toggleColumn,
  }) => {
    const [view, setView] = useState<View>('table-view');
    const [loading, detailsData] = useTimelineEventsDetails({
      docValueFields,
      indexName: event.index,
      eventId: event.eventId,
      skip: false,
    });
    const handleSetView = useCallback((newView) => setView(newView), []);

    if (loading || !detailsData) {
      return <>{`Loading...`}</>;
    }

    return (
      <EventDetails
        browserFields={browserFields}
        columnHeaders={columnHeaders}
        data={detailsData}
        onUpdateColumns={onUpdateColumns}
        onViewSelected={handleSetView}
        timelineId={timelineId}
        toggleColumn={toggleColumn}
        view={view}
      />
    );
  }
);

StatefulEventDetails.displayName = 'StatefulEventDetails';

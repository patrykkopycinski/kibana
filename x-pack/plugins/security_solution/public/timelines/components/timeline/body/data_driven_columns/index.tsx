/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React, { useMemo } from 'react';
import { getOr } from 'lodash/fp';

import { Ecs } from '../../../../../../common/ecs';
import { TimelineNonEcsData } from '../../../../../../common/search_strategy/timeline';
import { ColumnHeaderOptions } from '../../../../../timelines/store/timeline/model';
import { EventsTd, EventsTdContent, EventsTdGroupData } from '../../styles';
import { getColumnRenderer } from '../renderers/get_column_renderer';
import { columnRenderers } from '../renderers';
interface DataDrivenColumnProps {
  eventId: string;
  header: ColumnHeaderOptions;
  data: TimelineNonEcsData[];
  ecsData: Ecs;
  timelineId: string;
}

const DataDrivenColumnComponent: React.FC<DataDrivenColumnProps> = ({
  header,
  data,
  ecsData,
  eventId,
  timelineId,
}) => {
  const Content = useMemo(
    () =>
      getColumnRenderer(header.id, columnRenderers, data).renderColumn({
        columnName: header.id,
        eventId,
        field: header,
        linkValues: getOr([], header.linkField ?? '', ecsData),
        timelineId,
        truncate: true,
        values: getMappedNonEcsValue({
          data,
          fieldName: header.id,
        }),
      }),
    [data, ecsData, eventId, header, timelineId]
  );

  return (
    <EventsTd width={header.width}>
      <EventsTdContent data-test-subj="cell-container">{Content}</EventsTdContent>
    </EventsTd>
  );
};

export const DataDrivenColumn = React.memo(DataDrivenColumnComponent);

interface DataDrivenColumnsProps {
  _id: string;
  columnHeaders: ColumnHeaderOptions[];
  data: TimelineNonEcsData[];
  ecsData: Ecs;
  timelineId: string;
}

export const DataDrivenColumns = React.memo<DataDrivenColumnsProps>(
  ({ _id, columnHeaders, data, ecsData, timelineId }) => (
    <EventsTdGroupData data-test-subj="data-driven-columns">
      {columnHeaders.map((header) => (
        <DataDrivenColumn
          key={header.id}
          eventId={_id}
          header={header}
          data={data}
          ecsData={ecsData}
          timelineId={timelineId}
        />
      ))}
    </EventsTdGroupData>
  )
);

DataDrivenColumns.displayName = 'DataDrivenColumns';

const getMappedNonEcsValue = ({
  data,
  fieldName,
}: {
  data: TimelineNonEcsData[];
  fieldName: string;
}): string[] | undefined => {
  const item = data.find((d) => d.field === fieldName);
  if (item != null && item.value != null) {
    return item.value;
  }
  return undefined;
};

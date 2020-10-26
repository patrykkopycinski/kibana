/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { Resizable, ResizeCallback } from 're-resizable';
import deepEqual from 'fast-deep-equal';
import { useDrag, useDrop, DropTargetMonitor, XYCoord } from 'react-dnd';
import { useDispatch } from 'react-redux';

import { ColumnHeaderOptions } from '../../../../../timelines/store/timeline/model';
import {
  getDraggableFieldId,
  addFieldToTimelineColumns,
} from '../../../../../common/components/drag_and_drop/helpers';
import { OnColumnRemoved, OnColumnSorted, OnFilterChange, OnColumnResized } from '../../events';
import { EventsTh, EventsThContent, EventsHeadingHandle } from '../../styles';
import { Sort } from '../sort';

import { Header } from './header';

const RESIZABLE_ENABLE = { right: true };

interface DragItem {
  index: number;
  id: string;
  type: string;
}

interface ColumneHeaderProps {
  draggableIndex: number;
  header: ColumnHeaderOptions;
  onColumnRemoved: OnColumnRemoved;
  onColumnSorted: OnColumnSorted;
  onColumnResized: OnColumnResized;
  isDragging: boolean;
  onFilterChange?: OnFilterChange;
  sort: Sort;
  timelineId: string;
}

const ColumnHeaderComponent: React.FC<ColumneHeaderProps> = ({
  browserFields,
  draggableIndex,
  header,
  timelineId,
  // isDragging,
  onColumnRemoved,
  onColumnResized,
  onColumnSorted,
  onFilterChange,
  sort,
  moveCard,
}) => {
  const dispatch = useDispatch();
  const ref = useRef<HTMLDivElement>(null);
  const [, drop] = useDrop({
    accept: 'column',
    drop(item: DragItem, monitor: DropTargetMonitor) {
      const dragIndex = item.index;

      addFieldToTimelineColumns({
        browserFields,
        dispatch,
        result: {
          draggableId,
          destination: {
            droppableId: 'aa',
            index: dragIndex,
          },
        },
        timelineId,
      });
    },
    hover(item: DragItem, monitor: DropTargetMonitor) {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = draggableIndex;

      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return;
      }

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect();

      // Get vertical middle
      const hoverMiddleX = (hoverBoundingRect.right - hoverBoundingRect.left) / 2;

      // Determine mouse position
      const clientOffset = monitor.getClientOffset();

      // Get pixels to the top
      const hoverClientX = (clientOffset as XYCoord).x - hoverBoundingRect.left;

      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%

      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientX < hoverMiddleX) {
        return;
      }

      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientX > hoverMiddleX) {
        return;
      }

      // Time to actually perform the action
      moveCard(dragIndex, hoverIndex);

      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex;
    },
  });

  const draggableId = useMemo(
    () =>
      getDraggableFieldId({
        contextId: `timeline-column-headers-${timelineId}`,
        fieldId: header.id,
      }),
    [timelineId, header.id]
  );

  const [{ isDragging }, drag] = useDrag({
    item: { type: 'column', id: draggableId, index: draggableIndex },
    collect: (monitor: any) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const opacity = isDragging ? 0 : 1;
  drag(drop(ref));

  const resizableSize = useMemo(
    () => ({
      width: header.width,
      height: 'auto',
    }),
    [header.width]
  );
  const resizableStyle: {
    position: 'absolute' | 'relative';
  } = useMemo(
    () => ({
      position: isDragging ? 'absolute' : 'relative',
    }),
    [isDragging]
  );
  const resizableHandleComponent = useMemo(
    () => ({
      right: <EventsHeadingHandle />,
    }),
    []
  );
  const handleResizeStop: ResizeCallback = useCallback(
    (e, direction, ref, delta) => {
      onColumnResized({ columnId: header.id, delta: delta.width });
    },
    [header.id, onColumnResized]
  );

  const DraggableContent = useMemo(
    () => (
      <EventsTh ref={ref} style={{ opacity }} data-test-subj="draggable-header">
        <EventsThContent>
          <Header
            timelineId={timelineId}
            header={header}
            onColumnRemoved={onColumnRemoved}
            onColumnSorted={onColumnSorted}
            onFilterChange={onFilterChange}
            sort={sort}
          />
        </EventsThContent>
      </EventsTh>
    ),
    [header, onColumnRemoved, onColumnSorted, onFilterChange, opacity, sort, timelineId]
  );

  return (
    <Resizable
      enable={RESIZABLE_ENABLE}
      size={resizableSize}
      style={resizableStyle}
      handleComponent={resizableHandleComponent}
      onResizeStop={handleResizeStop}
    >
      {DraggableContent}
    </Resizable>
  );
};

export const ColumnHeader = React.memo(
  ColumnHeaderComponent,
  (prevProps, nextProps) =>
    prevProps.draggableIndex === nextProps.draggableIndex &&
    prevProps.timelineId === nextProps.timelineId &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.onColumnRemoved === nextProps.onColumnRemoved &&
    prevProps.onColumnResized === nextProps.onColumnResized &&
    prevProps.onColumnSorted === nextProps.onColumnSorted &&
    prevProps.onFilterChange === nextProps.onFilterChange &&
    prevProps.sort === nextProps.sort &&
    deepEqual(prevProps.header, nextProps.header)
);

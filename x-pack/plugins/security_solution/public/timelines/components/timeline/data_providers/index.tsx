/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { rgba } from 'polished';
import React, { useEffect, useMemo, useState, memo } from 'react';
import styled from 'styled-components';
import { useDrop, useDragLayer, XYCoord } from 'react-dnd';

import { BrowserFields } from '../../../../common/containers/source';
// import { DroppableWrapper } from '../../../../common/components/drag_and_drop/droppable_wrapper';
import { droppableTimelineProvidersPrefix } from '../../../../common/components/drag_and_drop/helpers';

import { DataProvider } from './data_provider';
import { Empty } from './empty';
import { Providers } from './providers';
import { Provider } from './provider';
import { useManageTimeline } from '../../manage_timeline';

interface Props {
  browserFields: BrowserFields;
  timelineId: string;
  dataProviders: DataProvider[];
}

const DropTargetDataProvidersContainer = styled.div<{ isDragging: boolean; isOver: boolean }>`
  padding: 2px 0 4px 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-bottom: 2px;
  position: relative;
  border: 0.2rem dashed ${({ theme }) => theme.eui.euiColorMediumShade};
  border-radius: 5px;
  padding: 5px 0;
  margin: 2px 0 2px 0;
  min-height: 100px;
  overflow-y: auto;
  background-color: ${({ theme }) => theme.eui.euiFormBackgroundColor};

  ${({ isDragging, isOver, theme }) =>
    isDragging &&
    `
    background: ${rgba(theme.eui.euiColorSuccess, isOver ? 0.2 : 0.1)};
    border: 0.2rem dashed ${theme.eui.euiColorSuccess};

    & .euiTextColor--subdued {
      color: ${theme.eui.euiColorSuccess};
    }

    & .euiFormHelpText {
      color: ${theme.eui.euiColorSuccess};
    }
  `}
`;

const getDroppableId = (id: string): string => `${droppableTimelineProvidersPrefix}${id}`;

/**
 * Renders the data providers section of the timeline.
 *
 * The data providers section is a drop target where users
 * can drag-and drop new data providers into the timeline.
 *
 * It renders an interactive card representation of the
 * data providers. It also provides uniform
 * UI controls for the following actions:
 * 1) removing a data provider
 * 2) temporarily disabling a data provider
 * 3) applying boolean negation to the data provider
 *
 * Given an empty collection of DataProvider[], it prompts
 * the user to drop anything with a facet count into
 * the data pro section.
 */

const DroppableWrapper = ({ children, isDropDisabled }) => {
  const [{ canDrop, isDragging, isOver }, drop] = useDrop({
    accept: 'field',
    drop: () => ({ name: 'Dustbin' }),
    canDrop: () => !isDropDisabled,
    collect: (monitor) => ({
      isDragging: monitor.getItemType() === 'field',
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  return <div ref={drop}>{children}</div>;
};

export const DataProviders = React.memo<Props>(({ browserFields, dataProviders, timelineId }) => {
  const { getManageTimelineById } = useManageTimeline();
  const isLoading = useMemo(() => getManageTimelineById(timelineId).isLoading, [
    getManageTimelineById,
    timelineId,
  ]);
  const [{ isDragging, isOver }, drop] = useDrop({
    canDrop: () => false,
    accept: 'field',
    collect: (monitor) => ({
      isDragging: monitor.getItemType() === 'field',
      isOver: monitor.isOver(),
    }),
  });

  return (
    <DropTargetDataProvidersContainer
      ref={drop}
      isDragging={isDragging}
      isOver={isOver}
      data-test-subj="dataProviders"
    >
      {dataProviders != null && dataProviders.length ? (
        <Providers
          browserFields={browserFields}
          timelineId={timelineId}
          dataProviders={dataProviders}
        />
      ) : (
        <DroppableWrapper isDropDisabled={isLoading} droppableId={getDroppableId(timelineId)}>
          <Empty browserFields={browserFields} timelineId={timelineId} />
        </DroppableWrapper>
      )}
    </DropTargetDataProvidersContainer>
  );
});

DataProviders.displayName = 'DataProviders';

const layerStyles: React.CSSProperties = {
  position: 'fixed',
  pointerEvents: 'none',
  zIndex: 99999,
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',
};

function getItemStyles(initialOffset: XYCoord | null, currentOffset: XYCoord | null) {
  if (!initialOffset || !currentOffset) {
    return {
      display: 'none',
    };
  }

  const { x, y } = currentOffset;

  const transform = `translate(${x}px, ${y}px)`;
  return {
    transform,
    WebkitTransform: transform,
  };
}

export const CustomDragLayer: React.FC = () => {
  const { itemType, isDragging, item, initialOffset, currentOffset } = useDragLayer((monitor) => ({
    item: monitor.getItem(),
    itemType: monitor.getItemType(),
    initialOffset: monitor.getInitialSourceClientOffset(),
    currentOffset: monitor.getSourceClientOffset(),
    isDragging: monitor.isDragging(),
  }));

  if (!isDragging || itemType !== 'field') {
    return null;
  }

  // console.error('item', item);

  return (
    <div style={layerStyles}>
      <div style={getItemStyles(initialOffset, currentOffset)}>
        <Provider dataProvider={item.dataProvider} />
      </div>
    </div>
  );
};

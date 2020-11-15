/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { DraggableStateSnapshot, DraggingStyle, NotDraggingStyle } from 'react-beautiful-dnd';
import styled from 'styled-components';
import deepEqual from 'fast-deep-equal';
import { useDrag, DragSourceMonitor, DragPreviewImage } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';

import { DataProvider } from '../../../timelines/components/timeline/data_providers/data_provider';
import { ROW_RENDERER_BROWSER_EXAMPLE_TIMELINE_ID } from '../../../timelines/components/row_renderers_browser/constants';

import { TruncatableText } from '../truncatable_text';
import { WithHoverActions } from '../with_hover_actions';
import { DraggableWrapperHoverContent, useGetTimelineId } from './draggable_wrapper_hover_content';
import { getDraggableId } from './helpers';
import { ProviderContainer } from './provider_container';

interface WrapperProps {
  disabled: boolean;
}

const Wrapper = styled.div<WrapperProps>`
  display: inline-block;
  max-width: 100%;

  ${({ disabled }) =>
    disabled &&
    `
    [data-rbd-draggable-id]:hover,
    .euiBadge:hover,
    .euiBadge__text:hover {
      cursor: default;
    }
  `}
`;

Wrapper.displayName = 'Wrapper';

const ProviderContentWrapper = styled.span`
  > span.euiToolTipAnchor {
    display: block; /* allow EuiTooltip content to be truncatable */
  }
`;

interface Props {
  children: React.ReactNode;
  dataProvider: DataProvider;
  disabled?: boolean;
  inline?: boolean;
  timelineId?: string;
  truncate?: boolean;
  onFilterAdded?: () => void;
}

/**
 * Wraps a draggable component to handle registration / unregistration of the
 * data provider associated with the item being dropped
 */

export const getStyle = (
  style: DraggingStyle | NotDraggingStyle | undefined,
  snapshot: DraggableStateSnapshot
) => {
  if (!snapshot.isDropAnimating) {
    return style;
  }

  return {
    ...style,
    transitionDuration: '0.00000001s', // cannot be 0, but can be a very short duration
  };
};

const DraggableWrapperComponent: React.FC<Props> = ({
  children,
  dataProvider,
  onFilterAdded,
  timelineId,
  truncate,
}) => {
  const draggableRef = useRef<HTMLDivElement | null>(null);
  const [closePopOverTrigger, setClosePopOverTrigger] = useState(false);
  const [showTopN, setShowTopN] = useState<boolean>(false);
  const [goGetTimelineId, setGoGetTimelineId] = useState(false);
  const timelineIdFind = useGetTimelineId(draggableRef, goGetTimelineId);
  const isDisabled = dataProvider.id.includes(`-${ROW_RENDERER_BROWSER_EXAMPLE_TIMELINE_ID}-`);
  const [{ isDragging }, drag, preview] = useDrag({
    item: { type: 'field', dataProvider },

    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  const handleClosePopOverTrigger = useCallback(
    () => setClosePopOverTrigger((prevClosePopOverTrigger) => !prevClosePopOverTrigger),
    []
  );

  const toggleTopN = useCallback(() => {
    setShowTopN((prevShowTopN) => {
      const newShowTopN = !prevShowTopN;
      if (newShowTopN === false) {
        handleClosePopOverTrigger();
      }
      return newShowTopN;
    });
  }, [handleClosePopOverTrigger]);

  const hoverContent = useMemo(
    () => (
      <DraggableWrapperHoverContent
        closePopOver={handleClosePopOverTrigger}
        draggableId={getDraggableId(dataProvider.id)}
        field={dataProvider.queryMatch.field}
        goGetTimelineId={setGoGetTimelineId}
        onFilterAdded={onFilterAdded}
        showTopN={showTopN}
        timelineId={timelineId ?? timelineIdFind}
        toggleTopN={toggleTopN}
        value={
          typeof dataProvider.queryMatch.value !== 'number'
            ? dataProvider.queryMatch.value
            : `${dataProvider.queryMatch.value}`
        }
      />
    ),
    [
      dataProvider,
      handleClosePopOverTrigger,
      onFilterAdded,
      showTopN,
      timelineId,
      timelineIdFind,
      toggleTopN,
    ]
  );

  const DraggableContent = useMemo(
    () => (
      <ProviderContainer ref={drag} data-test-subj="providerContainer">
        {truncate ? (
          <TruncatableText data-test-subj="draggable-truncatable-content">
            {children}
          </TruncatableText>
        ) : (
          <ProviderContentWrapper
            data-test-subj={`draggable-content-${dataProvider.queryMatch.field}`}
          >
            {children}
          </ProviderContentWrapper>
        )}
      </ProviderContainer>
    ),
    [children, dataProvider.queryMatch.field, drag, truncate]
  );

  const content = useMemo(
    () => (
      <Wrapper data-test-subj="draggableWrapperDiv" disabled={isDisabled}>
        {DraggableContent}
      </Wrapper>
    ),
    [DraggableContent, isDisabled]
  );

  const renderContent = useCallback(() => content, [content]);

  if (isDisabled) return <>{content}</>;

  return <>{content}</>;

  // return (
  //   <WithHoverActions
  //     alwaysShow={showTopN}
  //     closePopOverTrigger={closePopOverTrigger}
  //     hoverContent={hoverContent}
  //     render={renderContent}
  //   />
  // );
};

export const DraggableWrapper = React.memo(
  DraggableWrapperComponent,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    deepEqual(prevProps.dataProvider, nextProps.dataProvider) &&
    prevProps.onFilterAdded === nextProps.onFilterAdded &&
    prevProps.timelineId === nextProps.timelineId &&
    prevProps.truncate === nextProps.truncate
);

DraggableWrapper.displayName = 'DraggableWrapper';

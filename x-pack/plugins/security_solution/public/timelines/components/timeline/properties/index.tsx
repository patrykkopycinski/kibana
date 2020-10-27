/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import React, { useState, useCallback } from 'react';
import styled from 'styled-components';

import { TimelineStatusLiteral, TimelineTypeLiteral } from '../../../../../common/types/timeline';
import { useThrottledResizeObserver } from '../../../../common/components/utils';
import { Note } from '../../../../common/lib/note';
import { InputsModelId } from '../../../../common/store/inputs/constants';
import { AssociateNote, UpdateNote } from '../../notes/helpers';
import { TimelineProperties } from './styles';
import { PropertiesRight } from './properties_right';
import { useAllCasesModal } from '../../../../cases/components/use_all_cases_modal';
import { Description, Name, StarIcon } from './helpers';

type UpdateIsFavorite = ({ id, isFavorite }: { id: string; isFavorite: boolean }) => void;
type UpdateTitle = ({ id, title }: { id: string; title: string }) => void;
type UpdateDescription = ({ id, description }: { id: string; description: string }) => void;
type ToggleLock = ({ linkToId }: { linkToId: InputsModelId }) => void;

interface Props {
  associateNote: AssociateNote;
  description: string;
  getNotesByIds: (noteIds: string[]) => Note[];
  graphEventId?: string;
  isDataInTimeline: boolean;
  isFavorite: boolean;
  noteIds: string[];
  timelineId: string;
  timelineType: TimelineTypeLiteral;
  status: TimelineStatusLiteral;
  title: string;
  toggleLock: ToggleLock;
  updateDescription: UpdateDescription;
  updateIsFavorite: UpdateIsFavorite;
  updateNote: UpdateNote;
  updateTitle: UpdateTitle;
  usersViewing: string[];
}

export const datePickerThreshold = 600;
export const showNotesThreshold = 810;
export const showDescriptionThreshold = 970;

export const PropertiesLeftStyle = styled(EuiFlexGroup)`
  width: 100%;
`;

PropertiesLeftStyle.displayName = 'PropertiesLeftStyle';

/** Displays the properties of a timeline, i.e. name, description, notes, etc */
export const Properties = React.memo<Props>(
  ({
    associateNote,
    description,
    getNotesByIds,
    graphEventId,
    isDataInTimeline,
    isFavorite,
    noteIds,
    status,
    timelineId,
    timelineType,
    title,
    toggleLock,
    updateDescription,
    updateIsFavorite,
    updateNote,
    updateTitle,
    usersViewing,
  }) => {
    const { ref, width = 0 } = useThrottledResizeObserver(300);
    const [showActions, setShowActions] = useState(false);
    const [showNotes, setShowNotes] = useState(false);
    const [showTimelineModal, setShowTimelineModal] = useState(false);

    const onButtonClick = useCallback(() => setShowActions(!showActions), [showActions]);
    const onToggleShowNotes = useCallback(() => setShowNotes(!showNotes), [showNotes]);
    const onClosePopover = useCallback(() => setShowActions(false), []);
    const onCloseTimelineModal = useCallback(() => setShowTimelineModal(false), []);
    const onOpenTimelineModal = useCallback(() => {
      onClosePopover();
      setShowTimelineModal(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const { Modal: AllCasesModal, onOpenModal: onOpenCaseModal } = useAllCasesModal({ timelineId });

    return (
      <TimelineProperties ref={ref} data-test-subj="timeline-properties">
        <PropertiesLeftStyle alignItems="center" data-test-subj="properties-left" gutterSize="s">
          <EuiFlexItem grow={false}>
            <StarIcon
              isFavorite={isFavorite}
              timelineId={timelineId}
              updateIsFavorite={updateIsFavorite}
            />
          </EuiFlexItem>

          <Name
            timelineId={timelineId}
            timelineType={timelineType}
            title={title}
            updateTitle={updateTitle}
          />

          <EuiFlexItem grow={2}>
            <Description
              description={description}
              timelineId={timelineId}
              updateDescription={updateDescription}
            />
          </EuiFlexItem>
        </PropertiesLeftStyle>

        <PropertiesRight
          associateNote={associateNote}
          description={description}
          getNotesByIds={getNotesByIds}
          graphEventId={graphEventId}
          isDataInTimeline={isDataInTimeline}
          noteIds={noteIds}
          onButtonClick={onButtonClick}
          onClosePopover={onClosePopover}
          onCloseTimelineModal={onCloseTimelineModal}
          onOpenCaseModal={onOpenCaseModal}
          onOpenTimelineModal={onOpenTimelineModal}
          onToggleShowNotes={onToggleShowNotes}
          showActions={showActions}
          showDescription={width < showDescriptionThreshold}
          showNotes={showNotes}
          showNotesFromWidth={width < showNotesThreshold}
          showTimelineModal={showTimelineModal}
          showUsersView={title.length > 0}
          status={status}
          timelineId={timelineId}
          timelineType={timelineType}
          title={title}
          updateDescription={updateDescription}
          updateNote={updateNote}
          usersViewing={usersViewing}
        />
        <AllCasesModal />
      </TimelineProperties>
    );
  }
);

Properties.displayName = 'Properties';

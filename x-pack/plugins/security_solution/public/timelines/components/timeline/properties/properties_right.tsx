/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React, { useCallback } from 'react';
import styled from 'styled-components';
import {
  EuiContextMenu,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiIcon,
  EuiToolTip,
  EuiAvatar,
} from '@elastic/eui';
import { useHistory } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { NewTimeline, Description, NotesButton, NewCase, ExistingCase } from './helpers';
import { defaultHeaders } from '../body/column_headers/default_headers';

import { disableTemplate } from '../../../../../common/constants';
import { TimelineType, TimelineStatus } from '../../../../../common/types/timeline';

import { InspectButton, InspectButtonContainer } from '../../../../common/components/inspect';
import { useKibana } from '../../../../common/lib/kibana';
import { Note } from '../../../../common/lib/note';

import { AssociateNote } from '../../notes/helpers';
import { OpenTimelineModalButton } from '../../open_timeline/open_timeline_modal/open_timeline_modal_button';
import { OpenTimelineModal } from '../../open_timeline/open_timeline_modal';
import { timelineSelectors } from '../../../../timelines/store/timeline';
import { setInsertTimeline } from '../../../store/timeline/actions';
import { timelineActions } from '../../../store/timeline';
import { SiemPageName } from '../../../../app/types';

import * as i18n from './translations';
import { NewTemplateTimeline } from './new_template_timeline';

export const PropertiesRightStyle = styled(EuiFlexGroup)`
  margin-right: 5px;
`;

PropertiesRightStyle.displayName = 'PropertiesRightStyle';

const DescriptionPopoverMenuContainer = styled.div`
  margin-top: 15px;
`;

DescriptionPopoverMenuContainer.displayName = 'DescriptionPopoverMenuContainer';

const SettingsIcon = styled(EuiIcon)`
  margin-left: 4px;
  cursor: pointer;
`;

SettingsIcon.displayName = 'SettingsIcon';

const HiddenFlexItem = styled(EuiFlexItem)`
  display: none;
`;

HiddenFlexItem.displayName = 'HiddenFlexItem';

const Avatar = styled(EuiAvatar)`
  margin-left: 5px;
`;

Avatar.displayName = 'Avatar';

type UpdateDescription = ({ id, description }: { id: string; description: string }) => void;
export type UpdateNote = (note: Note) => void;

interface PropertiesRightComponentProps {
  associateNote: AssociateNote;
  description: string;
  getNotesByIds: (noteIds: string[]) => Note[];
  isDataInTimeline: boolean;
  noteIds: string[];
  onButtonClick: () => void;
  onClosePopover: () => void;
  onCloseTimelineModal: () => void;
  onOpenCaseModal: () => void;
  onOpenTimelineModal: () => void;
  onToggleShowNotes: () => void;
  showActions: boolean;
  showDescription: boolean;
  showNotes: boolean;
  showNotesFromWidth: boolean;
  showTimelineModal: boolean;
  showUsersView: boolean;
  status: TimelineStatus;
  timelineId: string;
  title: string;
  updateDescription: UpdateDescription;
  updateNote: UpdateNote;
  usersViewing: string[];
}

const PropertiesRightComponent: React.FC<PropertiesRightComponentProps> = ({
  associateNote,
  description,
  getNotesByIds,
  isDataInTimeline,
  noteIds,
  onButtonClick,
  onClosePopover,
  onCloseTimelineModal,
  onOpenCaseModal,
  onOpenTimelineModal,
  onToggleShowNotes,
  showActions,
  showDescription,
  showNotes,
  showNotesFromWidth,
  showTimelineModal,
  showUsersView,
  status,
  timelineId,
  title,
  updateDescription,
  updateNote,
  usersViewing,
}) => {
  const history = useHistory();
  const dispatch = useDispatch();
  const uiCapabilities = useKibana().services.application.capabilities;
  const capabilitiesCanUserCRUD: boolean = !!uiCapabilities.siem.crud;

  const savedObjectId = useSelector(
    (state: State) => timelineSelectors.selectTimeline(state, timelineId)?.savedObjectId
  );

  const handleNewTimelineClick = useCallback(() => {
    onClosePopover();
    dispatch(
      timelineActions.createTimeline({
        id: timelineId,
        columns: defaultHeaders,
        show: true,
        timelineType: TimelineType.default,
      })
    );
  }, [onClosePopover, dispatch, timelineId]);

  const handleOpenTimelineClick = useCallback(() => {
    onClosePopover();
    onOpenTimelineModal();
  }, [onClosePopover, onOpenTimelineModal]);

  const handleNewCaseClick = useCallback(() => {
    onClosePopover();
    history.push({
      pathname: `/${SiemPageName.case}/create`,
    });
    dispatch(
      setInsertTimeline({
        timelineId,
        timelineSavedObjectId: savedObjectId,
        timelineTitle: title.length > 0 ? title : i18n.UNTITLED_TIMELINE,
      })
    );
  }, [onClosePopover, history, dispatch, timelineId, savedObjectId, title]);

  const handleExistingCaseClick = useCallback(() => {
    onClosePopover();
    onOpenCaseModal();
  }, [onOpenCaseModal, onClosePopover]);

  const handleInspectClick = useCallback(() => {}, []);

  const panels = [
    {
      id: 0,
      items: [
        {
          name: 'Create new timeline',
          icon: 'plusInCircle',
          disabled: !capabilitiesCanUserCRUD,
          onClick: handleNewTimelineClick,
        },
        {
          name: i18n.OPEN_TIMELINE,
          icon: 'folderOpen',
          'data-test-subj': 'open-timeline-button',
          onClick: handleOpenTimelineClick,
        },
        {
          name: 'Attach timeline',
          icon: 'paperClip',
          panel: 1,
          disabled: status === TimelineStatus.draft,
          toolTipContent: 'You need to put the title to the timeline first',
        },
        // {
        //   name: i18n.INSPECT_TIMELINE_TITLE,
        //   icon: 'user',
        //   toolTipPosition: 'right',
        //   disabled: !isDataInTimeline,
        //   onClick: handleInspectClick,
        // },
      ],
    },
    {
      id: 1,
      title: 'Attach timeline',
      items: [
        {
          name: i18n.ATTACH_TIMELINE_TO_NEW_CASE,
          icon: 'paperClip',
          onClick: handleNewCaseClick,
          dataTestSubj: 'attach-timeline-case',
          color: 'text',
          iconSide: 'left',
          iconType: 'paperClip',
        },

        {
          name: i18n.ATTACH_TIMELINE_TO_EXISTING_CASE,
          icon: 'paperClip',
          onClick: handleExistingCaseClick,
          dataTestSubj: 'attach-timeline-existing-case',
          color: 'text',
          iconSide: 'left',
          iconType: 'paperClip',
        },
      ],
    },
  ];

  return (
    <PropertiesRightStyle alignItems="flexStart" data-test-subj="properties-right" gutterSize="s">
      <EuiFlexItem grow={false}>
        <InspectButtonContainer>
          <EuiPopover
            anchorPosition="downRight"
            button={
              <SettingsIcon
                data-test-subj="settings-gear"
                type="gear"
                size="l"
                onClick={onButtonClick}
              />
            }
            id="timelineSettingsPopover"
            isOpen={showActions}
            closePopover={onClosePopover}
            panelPaddingSize="none"
          >
            <EuiContextMenu initialPanelId={0} panels={panels} />
            {/*
              {capabilitiesCanUserCRUD && (
                <EuiFlexItem grow={false}>
                  <NewTimeline
                    timelineId={timelineId}
                    title={i18n.NEW_TIMELINE}
                    closeGearMenu={onClosePopover}
                  />
                </EuiFlexItem>
              )}

              <EuiFlexItem grow={false}>
                <OpenTimelineModalButton onClick={onOpenTimelineModal} />
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <NewCase
                  onClosePopover={onClosePopover}
                  timelineId={timelineId}
                  timelineTitle={title}
                  timelineStatus={status}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <ExistingCase
                  onClosePopover={onClosePopover}
                  onOpenCaseModal={onOpenCaseModal}
                  timelineStatus={status}
                />
              </EuiFlexItem>
             */}

            <EuiFlexGroup alignItems="flexStart" direction="column" gutterSize="none">
              <EuiFlexItem grow={false}>
                <InspectButton
                  queryId={timelineId}
                  inputId="timeline"
                  inspectIndex={0}
                  isDisabled={!isDataInTimeline}
                  onCloseInspect={onClosePopover}
                  title={i18n.INSPECT_TIMELINE_TITLE}
                />
              </EuiFlexItem>
              {showNotesFromWidth && (
                <EuiFlexItem grow={false}>
                  <NotesButton
                    animate={true}
                    associateNote={associateNote}
                    getNotesByIds={getNotesByIds}
                    noteIds={noteIds}
                    showNotes={showNotes}
                    size="l"
                    text={i18n.NOTES}
                    toggleShowNotes={onToggleShowNotes}
                    toolTip={i18n.NOTES_TOOL_TIP}
                    updateNote={updateNote}
                  />
                </EuiFlexItem>
              )}

              {showDescription && (
                <EuiFlexItem grow={false}>
                  <DescriptionPopoverMenuContainer>
                    <Description
                      description={description}
                      timelineId={timelineId}
                      updateDescription={updateDescription}
                    />
                  </DescriptionPopoverMenuContainer>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiPopover>
        </InspectButtonContainer>
      </EuiFlexItem>

      {showUsersView
        ? usersViewing.map((user) => (
            // Hide the hard-coded elastic user avatar as the 7.2 release does not implement
            // support for multi-user-collaboration as proposed in elastic/ingest-dev#395
            <HiddenFlexItem key={user}>
              <EuiToolTip
                data-test-subj="timeline-action-pin-tool-tip"
                content={`${user} ${i18n.IS_VIEWING}`}
              >
                <Avatar data-test-subj="avatar" size="s" name={user} />
              </EuiToolTip>
            </HiddenFlexItem>
          ))
        : null}

      {showTimelineModal ? <OpenTimelineModal onClose={onCloseTimelineModal} /> : null}
    </PropertiesRightStyle>
  );
};

export const PropertiesRight = React.memo(PropertiesRightComponent);

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { memo, useMemo } from 'react';
import { css } from '@emotion/react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  useEuiTheme,
} from '@elastic/eui';
import { useSelector } from 'react-redux-v7';
import type { DetonateTask } from '../../../../../common/detonate_prototype';
import type { State } from '../../../../common/store';
import { timelineSelectors } from '../../../../timelines/store';
import { TimelineId } from '../../../../../common/types';
import { useIsInSecurityApp } from '../../../../common/hooks/is_in_security_app';
import { ToolsFlyoutHeader } from '../../../shared/components/tools_flyout_header';
import { NOTES_TITLE } from '../../../shared/constants/flyout_titles';
import { useTimelineConfig } from '../../../shared/tools/notes/hooks/use_timeline_config';
import { NotesDetailsContent } from '../../../shared/tools/notes/components/notes_details_content';
import { buildDetonationRecord } from '../../main/utils/build_detonation_record';
import { SandboxBadge } from '../sandbox_badge';
import { DETONATION_NOTES_TOOL_TEST_ID } from '../test_ids';

export interface DetonationNotesProps {
  /** The detonation run the notes are attached to; notes are keyed on `task.id`. */
  task: DetonateTask;
}

/**
 * Notes tool for a detonation run, opened as a child of the result flyout. The shared
 * `NotesDetails` is not reused: its header would offer to open the run's `detonate-tasks`
 * document as a document flyout, which is not a document the alert flyout can show.
 * Epic #20877 §5: reuse of the shared tool is pending a product answer.
 */
export const DetonationNotes: FC<DetonationNotesProps> = memo(({ task }) => {
  const { euiTheme } = useEuiTheme();
  const hit = useMemo(() => buildDetonationRecord(task), [task]);
  const isTimelineOpen = useSelector(
    (state: State) => timelineSelectors.selectTimelineById(state, TimelineId.active)?.show ?? false
  );
  const timelineConfig = useTimelineConfig(task.id, isTimelineOpen);
  const isInSecurityApp = useIsInSecurityApp();

  return (
    <>
      <EuiFlyoutHeader
        hasBorder
        css={css`
          padding-block: ${euiTheme.size.s} !important;
        `}
      >
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem>
            <ToolsFlyoutHeader title={NOTES_TITLE} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <SandboxBadge />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>
      <EuiFlyoutBody data-test-subj={DETONATION_NOTES_TOOL_TEST_ID}>
        <NotesDetailsContent
          hit={hit}
          timelineConfig={timelineConfig}
          hideTimelineIcon={!isInSecurityApp}
        />
      </EuiFlyoutBody>
    </>
  );
});

DetonationNotes.displayName = 'DetonationNotes';

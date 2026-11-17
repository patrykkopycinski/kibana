/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import type { DetonateTask } from '../../../../../common/detonate_prototype';
import { useIsInSecurityApp } from '../../../../common/hooks/is_in_security_app';
import { useTimelineConfig } from '../../../shared/tools/notes/hooks/use_timeline_config';
import { DetonationNotes } from '.';
import { DETONATION_NOTES_TOOL_TEST_ID, DETONATION_TOOL_SANDBOX_BADGE_TEST_ID } from '../test_ids';

jest.mock('react-redux-v7', () => ({
  ...jest.requireActual('react-redux-v7'),
  useSelector: jest.fn(() => false),
}));
jest.mock('../../../../common/hooks/is_in_security_app');
jest.mock('../../../shared/tools/notes/hooks/use_timeline_config');
jest.mock('../../../shared/components/tools_flyout_header', () => ({
  ToolsFlyoutHeader: () => <div />,
}));

const mockNotesDetailsContent = jest.fn();
jest.mock('../../../shared/tools/notes/components/notes_details_content', () => ({
  NotesDetailsContent: (props: unknown) => {
    mockNotesDetailsContent(props);
    return <div data-test-subj="notesContentMock" />;
  },
}));

const task = { id: 'task-1', sample_filename: 'invoice.pdf' } as unknown as DetonateTask;
const timelineConfig = { id: 'timeline-config' };

describe('<DetonationNotes />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useIsInSecurityApp).mockReturnValue(true);
    jest.mocked(useTimelineConfig).mockReturnValue(timelineConfig as never);
  });

  it('keys the notes on the run id, not an alert document id', () => {
    render(<DetonationNotes task={task} />);

    expect(screen.getByTestId(DETONATION_NOTES_TOOL_TEST_ID)).toBeInTheDocument();
    const { hit } = mockNotesDetailsContent.mock.calls[0][0] as { hit: DataTableRecord };
    expect(hit.raw._id).toBe('task-1');
    expect(useTimelineConfig).toHaveBeenCalledWith('task-1', false);
  });

  it('marks the tool as showing sandbox data', () => {
    render(<DetonationNotes task={task} />);

    expect(screen.getByTestId(DETONATION_TOOL_SANDBOX_BADGE_TEST_ID)).toHaveTextContent('sandbox');
  });

  it('passes the timeline config and shows the timeline icon in the security app', () => {
    render(<DetonationNotes task={task} />);

    expect(mockNotesDetailsContent).toHaveBeenCalledWith(
      expect.objectContaining({ timelineConfig, hideTimelineIcon: false })
    );
  });

  it('hides the timeline icon outside the security app', () => {
    jest.mocked(useIsInSecurityApp).mockReturnValue(false);
    render(<DetonationNotes task={task} />);

    expect(mockNotesDetailsContent).toHaveBeenCalledWith(
      expect.objectContaining({ hideTimelineIcon: true })
    );
  });
});

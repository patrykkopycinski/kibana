/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { useKibana } from '../../../../common/lib/kibana';
import { useRunSession } from '../../../../detonate_prototype/hooks/use_detonate';
import { DetonationSessionView } from '.';
import {
  DETONATION_SESSION_VIEW_TOOL_ERROR_TEST_ID,
  DETONATION_SESSION_VIEW_TOOL_TEST_ID,
  DETONATION_TOOL_SANDBOX_BADGE_TEST_ID,
} from '../test_ids';

jest.mock('../../../../common/lib/kibana');
jest.mock('../../../../detonate_prototype/hooks/use_detonate');
jest.mock('../../../shared/components/tools_flyout_header', () => ({
  ToolsFlyoutHeader: () => <div />,
}));

const getSessionView = jest.fn(() => <div data-test-subj="sessionViewMock" />);

const renderTool = () =>
  render(
    <I18nProvider>
      <DetonationSessionView taskId="task-1" />
    </I18nProvider>
  );

describe('<DetonationSessionView />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useKibana).mockReturnValue({
      services: { sessionView: { getSessionView } },
    } as unknown as ReturnType<typeof useKibana>);
  });

  it('loads the session of the given run', () => {
    jest.mocked(useRunSession).mockReturnValue({ data: undefined, isLoading: true } as never);
    renderTool();

    expect(useRunSession).toHaveBeenCalledWith('task-1');
  });

  it('shows a spinner while loading and does not render Session View', () => {
    jest.mocked(useRunSession).mockReturnValue({ data: undefined, isLoading: true } as never);
    renderTool();

    expect(
      screen.getByTestId(`${DETONATION_SESSION_VIEW_TOOL_TEST_ID}Loading`)
    ).toBeInTheDocument();
    expect(getSessionView).not.toHaveBeenCalled();
  });

  it('shows the empty state when the run recorded no process events', () => {
    jest.mocked(useRunSession).mockReturnValue({ data: undefined, isLoading: false } as never);
    renderTool();

    expect(screen.getByTestId(`${DETONATION_SESSION_VIEW_TOOL_TEST_ID}Empty`)).toBeInTheDocument();
    expect(getSessionView).not.toHaveBeenCalled();
  });

  it('marks the tool as showing sandbox data', () => {
    jest.mocked(useRunSession).mockReturnValue({ data: undefined, isLoading: true } as never);
    renderTool();

    expect(screen.getByTestId(DETONATION_TOOL_SANDBOX_BADGE_TEST_ID)).toHaveTextContent('sandbox');
  });

  it('shows an error callout, not the empty state, when the process events fail to load', () => {
    jest
      .mocked(useRunSession)
      .mockReturnValue({ data: undefined, isLoading: false, isError: true } as never);
    renderTool();

    expect(screen.getByTestId(DETONATION_SESSION_VIEW_TOOL_ERROR_TEST_ID)).toBeInTheDocument();
    expect(
      screen.queryByTestId(`${DETONATION_SESSION_VIEW_TOOL_TEST_ID}Empty`)
    ).not.toBeInTheDocument();
    expect(getSessionView).not.toHaveBeenCalled();
  });

  it('shows only the error callout when a refetch fails while cached data is present', () => {
    jest.mocked(useRunSession).mockReturnValue({
      data: {
        index: 'detonate-events',
        session_entity_id: 'entity-1',
        session_start_time: '2026-11-16T10:00:00.000Z',
      },
      isLoading: false,
      isError: true,
    } as never);
    renderTool();

    expect(screen.getByTestId(DETONATION_SESSION_VIEW_TOOL_ERROR_TEST_ID)).toBeInTheDocument();
    expect(screen.queryByTestId('sessionViewMock')).not.toBeInTheDocument();
    expect(getSessionView).not.toHaveBeenCalled();
  });

  it('renders Session View with the run session entity, index and start time', () => {
    jest.mocked(useRunSession).mockReturnValue({
      data: {
        index: 'detonate-events',
        session_entity_id: 'entity-1',
        session_start_time: '2026-11-16T10:00:00.000Z',
      },
      isLoading: false,
    } as never);
    renderTool();

    expect(screen.getByTestId('sessionViewMock')).toBeInTheDocument();
    expect(getSessionView).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 'detonate-events',
        preserveIndex: true,
        sessionEntityId: 'entity-1',
        sessionStartTime: '2026-11-16T10:00:00.000Z',
        isFullScreen: true,
      })
    );
  });
});

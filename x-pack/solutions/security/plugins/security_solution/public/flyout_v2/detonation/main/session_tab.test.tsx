/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { useKibana } from '../../../common/lib/kibana';
import { useRunSession } from '../../../detonate_prototype/hooks/use_detonate';
import { SessionTab, SESSION_TAB_TEST_ID } from './session_tab';

jest.mock('../../../common/lib/kibana');
jest.mock('../../../detonate_prototype/hooks/use_detonate');

const getSessionView = jest.fn(() => <div data-test-subj="sessionViewMock" />);

const renderTab = () =>
  render(
    <I18nProvider>
      <SessionTab taskId="task-1" />
    </I18nProvider>
  );

describe('<SessionTab />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useKibana).mockReturnValue({
      services: { sessionView: { getSessionView } },
    } as unknown as ReturnType<typeof useKibana>);
  });

  it('shows a spinner while loading', () => {
    jest.mocked(useRunSession).mockReturnValue({ data: undefined, isLoading: true } as never);
    renderTab();

    expect(screen.getByTestId(`${SESSION_TAB_TEST_ID}Loading`)).toBeInTheDocument();
    expect(getSessionView).not.toHaveBeenCalled();
  });

  it('shows an error callout, not the empty state, when the process events fail to load', () => {
    jest
      .mocked(useRunSession)
      .mockReturnValue({ data: undefined, isLoading: false, isError: true } as never);
    renderTab();

    expect(screen.getByTestId(`${SESSION_TAB_TEST_ID}Error`)).toBeInTheDocument();
    expect(screen.queryByTestId(`${SESSION_TAB_TEST_ID}Empty`)).not.toBeInTheDocument();
    expect(getSessionView).not.toHaveBeenCalled();
  });

  it('shows the empty state when the run recorded no process events', () => {
    jest.mocked(useRunSession).mockReturnValue({ data: undefined, isLoading: false } as never);
    renderTab();

    expect(screen.getByTestId(`${SESSION_TAB_TEST_ID}Empty`)).toBeInTheDocument();
    expect(screen.queryByTestId(`${SESSION_TAB_TEST_ID}Error`)).not.toBeInTheDocument();
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
    renderTab();

    expect(screen.getByTestId('sessionViewMock')).toBeInTheDocument();
    expect(getSessionView).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 'detonate-events',
        preserveIndex: true,
        sessionEntityId: 'entity-1',
        sessionStartTime: '2026-11-16T10:00:00.000Z',
      })
    );
  });
});

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { useHistory } from 'react-router-dom';
import { decode } from '@kbn/rison';
import { DOC_VIEWER_FLYOUT_HISTORY_KEY } from '@kbn/unified-doc-viewer';
import { useDetonationFlyoutApi } from './use_detonation_flyout_api';
import type { PaginationStore } from '../document/pagination/store';
import { useKibana } from '../../common/lib/kibana';
import { useIsInSecurityApp } from '../../common/hooks/is_in_security_app';
import { flyoutProviders } from '../shared/components/flyout_provider';
import { documentFlyoutHistoryKey } from '../shared/constants/flyout_history';
import {
  FlyoutV2EventTypes,
  FLYOUT_ORIGIN,
  FLYOUT_SURFACE,
  FLYOUT_TYPE,
  FLYOUT_SESSION_KIND,
} from '../../common/lib/telemetry';

jest.mock('react-redux-v7', () => ({
  ...jest.requireActual('react-redux-v7'),
  useStore: jest.fn(() => ({})),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: jest.fn(() => ({})),
}));

const useHistoryMock = useHistory as jest.Mock;
jest.mock('../../common/lib/kibana');
jest.mock('../../common/hooks/is_in_security_app');
jest.mock('../shared/components/flyout_provider', () => ({
  flyoutProviders: jest.fn(() => 'FLYOUT_CONTENT'),
}));
jest.mock('../shared/hooks/use_default_flyout_properties', () => ({
  useDefaultDocumentFlyoutProperties: jest.fn(() => ({ size: 's' })),
}));

const mockOpenSystemFlyout = jest.fn();
const mockReportEvent = jest.fn();

describe('useDetonationFlyoutApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useHistoryMock.mockReturnValue({});
    mockOpenSystemFlyout.mockReturnValue({ onClose: Promise.resolve(), close: jest.fn() });
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        overlays: { openSystemFlyout: mockOpenSystemFlyout },
        storage: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
        telemetry: { reportEvent: mockReportEvent },
      },
    });
    (useIsInSecurityApp as jest.Mock).mockReturnValue(true);
  });

  it('openDetonationFlyout opens a system flyout as a new session with the document properties', () => {
    const { result } = renderHook(() => useDetonationFlyoutApi());
    result.current.openDetonationFlyout({ taskId: 'task-1' });

    expect(flyoutProviders).toHaveBeenCalledTimes(1);
    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      'FLYOUT_CONTENT',
      expect.objectContaining({ size: 's', session: 'start', historyKey: documentFlyoutHistoryKey })
    );
    expect(mockReportEvent).toHaveBeenCalledWith(FlyoutV2EventTypes.FlyoutOpened, {
      surface: FLYOUT_SURFACE.FLYOUT,
      flyoutType: FLYOUT_TYPE.DETONATION,
      tool: undefined,
      session: FLYOUT_SESSION_KIND.START,
      origin: undefined,
    });
  });

  it('openDetonationFlyout forwards the given origin', () => {
    const { result } = renderHook(() => useDetonationFlyoutApi());
    result.current.openDetonationFlyout({ taskId: 'task-1', origin: FLYOUT_ORIGIN.ALERTS_TABLE });

    expect(mockReportEvent).toHaveBeenCalledWith(FlyoutV2EventTypes.FlyoutOpened, {
      surface: FLYOUT_SURFACE.FLYOUT,
      flyoutType: FLYOUT_TYPE.DETONATION,
      tool: undefined,
      session: FLYOUT_SESSION_KIND.START,
      origin: FLYOUT_ORIGIN.ALERTS_TABLE,
    });
  });

  it('openDetonationFlyoutAsChild opens a system flyout that inherits the current session', () => {
    const { result } = renderHook(() => useDetonationFlyoutApi());
    result.current.openDetonationFlyoutAsChild({ taskId: 'task-1' });

    expect(flyoutProviders).toHaveBeenCalledTimes(1);
    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      'FLYOUT_CONTENT',
      expect.objectContaining({
        size: 's',
        session: 'inherit',
        historyKey: documentFlyoutHistoryKey,
      })
    );
    expect(mockReportEvent).toHaveBeenCalledWith(FlyoutV2EventTypes.FlyoutOpened, {
      surface: FLYOUT_SURFACE.FLYOUT,
      flyoutType: FLYOUT_TYPE.DETONATION,
      tool: undefined,
      session: FLYOUT_SESSION_KIND.INHERIT,
      origin: undefined,
    });
  });

  it('uses the doc-viewer history key when outside the security app', () => {
    (useIsInSecurityApp as jest.Mock).mockReturnValue(false);
    const { result } = renderHook(() => useDetonationFlyoutApi());
    result.current.openDetonationFlyout({ taskId: 'task-1' });

    expect(mockOpenSystemFlyout.mock.calls[0][1].historyKey).toBe(DOC_VIEWER_FLYOUT_HISTORY_KEY);
  });

  it('persists the task id in the flyoutV2 URL descriptor so it can be restored', () => {
    const replace = jest.fn();
    useHistoryMock.mockReturnValue({ location: { search: '' }, replace });

    const { result } = renderHook(() => useDetonationFlyoutApi());
    result.current.openDetonationFlyout({ taskId: 'task-1' });

    expect(replace).toHaveBeenCalledTimes(1);
    const { search } = replace.mock.calls[0][0];
    const encoded = new URLSearchParams(search).get('flyoutV2');
    expect(decode(encoded as string)).toEqual([{ kind: 'detonation', taskId: 'task-1' }]);
  });

  describe('pagination', () => {
    // The flyout body is `<FlyoutSessionContextProvider><Suspense>{body}</Suspense>`.
    const openedBody = (): React.ReactElement => {
      const calls = (flyoutProviders as jest.Mock).mock.calls;
      const session = calls[calls.length - 1][0].children as React.ReactElement;
      return (session.props.children as React.ReactElement).props.children;
    };
    const openedStore = (): PaginationStore => openedBody().props.value;

    it('wraps the flyout in a pagination store over the given runs', () => {
      const { result } = renderHook(() => useDetonationFlyoutApi());
      result.current.openDetonationFlyout({
        taskId: 'run-2',
        pagination: { taskIds: ['run-1', 'run-2', 'run-3'] },
      });

      expect(openedStore().getSnapshot()).toEqual(
        expect.objectContaining({
          flyoutDocumentIndex: 1,
          totalDocumentCount: 3,
          flyoutDocumentId: 'run-2',
        })
      );
    });

    it('reopens the flyout on the neighbouring run, keeping the same row order', () => {
      const { result } = renderHook(() => useDetonationFlyoutApi());
      const taskIds = ['run-1', 'run-2', 'run-3'];
      result.current.openDetonationFlyout({ taskId: 'run-2', pagination: { taskIds } });

      act(() => openedStore().getSnapshot().openDocumentFlyoutImpl?.(2));

      expect(mockOpenSystemFlyout).toHaveBeenCalledTimes(2);
      expect(openedStore().getSnapshot()).toEqual(
        expect.objectContaining({
          flyoutDocumentIndex: 2,
          totalDocumentCount: 3,
          flyoutDocumentId: 'run-3',
        })
      );
      expect(openedBody().props.children.props.taskId).toBe('run-3');
    });

    it('adds no pagination without rows, or when the run is not among them', () => {
      const { result } = renderHook(() => useDetonationFlyoutApi());

      result.current.openDetonationFlyout({ taskId: 'run-2' });
      expect(openedBody().props.taskId).toBe('run-2');

      result.current.openDetonationFlyout({
        taskId: 'run-9',
        pagination: { taskIds: ['run-1', 'run-2'] },
      });
      expect(openedBody().props.taskId).toBe('run-9');
    });
  });
});

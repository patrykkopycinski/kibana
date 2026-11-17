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
import type { DetonateTask } from '../../../common/detonate_prototype';
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
  FLYOUT_TOOL,
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
  useDefaultToolsFlyoutProperties: jest.fn(() => ({ size: 'm' })),
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

  describe('tools opened as children of the result', () => {
    const task = { id: 'task-1', sample_filename: 'invoice.pdf' } as unknown as DetonateTask;

    const openedBody = (): React.ReactElement => {
      // `useOpenFlyout` wraps the body as session provider > Suspense > tool element.
      const call = jest.mocked(flyoutProviders).mock.calls[0];
      const provider = (call[0] as { children: React.ReactElement }).children;
      const suspense = (provider.props as { children: React.ReactElement }).children;
      return (suspense.props as { children: React.ReactElement }).children;
    };

    it('openDetonationSessionView opens a tools-size child that inherits the result session', () => {
      const { result } = renderHook(() => useDetonationFlyoutApi());
      result.current.openDetonationSessionView({
        task,
        origin: FLYOUT_ORIGIN.FLYOUT_HEADER,
      });

      expect(mockOpenSystemFlyout).toHaveBeenCalledTimes(1);
      expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
        'FLYOUT_CONTENT',
        expect.objectContaining({
          size: 'm',
          session: 'inherit',
          historyKey: documentFlyoutHistoryKey,
        })
      );
      expect(mockReportEvent).toHaveBeenCalledWith(FlyoutV2EventTypes.FlyoutOpened, {
        surface: FLYOUT_SURFACE.TOOL,
        flyoutType: FLYOUT_TYPE.DETONATION,
        tool: FLYOUT_TOOL.SESSION_VIEW,
        session: FLYOUT_SESSION_KIND.INHERIT,
        origin: FLYOUT_ORIGIN.FLYOUT_HEADER,
      });
    });

    it('openDetonationSessionView renders Session View for the given run', () => {
      const { result } = renderHook(() => useDetonationFlyoutApi());
      result.current.openDetonationSessionView({ task });

      expect(openedBody().props).toEqual({ taskId: 'task-1' });
    });

    it.each([
      ['the sample filename', task, 'invoice.pdf'],
      [
        'the run id when there is no sample filename',
        { id: 'task-2' } as unknown as DetonateTask,
        'task-2',
      ],
    ])(
      'openDetonationSessionView titles the child menu entry with %s',
      (_, openedTask, expected) => {
        const { result } = renderHook(() => useDetonationFlyoutApi());
        result.current.openDetonationSessionView({ task: openedTask });

        const [, properties] = mockOpenSystemFlyout.mock.calls[0];
        expect(properties.title).toContain(`Session view: ${expected}`);
      }
    );

    it('openDetonationNotes opens a tools-size child that inherits the result session', () => {
      const { result } = renderHook(() => useDetonationFlyoutApi());
      result.current.openDetonationNotes({ task, origin: FLYOUT_ORIGIN.FLYOUT_HEADER });

      expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
        'FLYOUT_CONTENT',
        expect.objectContaining({
          size: 'm',
          session: 'inherit',
          historyKey: documentFlyoutHistoryKey,
        })
      );
      expect(mockReportEvent).toHaveBeenCalledWith(FlyoutV2EventTypes.FlyoutOpened, {
        surface: FLYOUT_SURFACE.TOOL,
        flyoutType: FLYOUT_TYPE.DETONATION,
        tool: FLYOUT_TOOL.NOTES,
        session: FLYOUT_SESSION_KIND.INHERIT,
        origin: FLYOUT_ORIGIN.FLYOUT_HEADER,
      });
    });

    it('openDetonationNotes renders Notes for the given run', () => {
      const { result } = renderHook(() => useDetonationFlyoutApi());
      result.current.openDetonationNotes({ task });

      expect(openedBody().props).toEqual({ task });
    });

    it('does not write the tool to the URL or hook the result entry on close', () => {
      const replace = jest.fn();
      useHistoryMock.mockReturnValue({ replace, location: { search: '' } });
      const { result } = renderHook(() => useDetonationFlyoutApi());
      result.current.openDetonationSessionView({ task });
      result.current.openDetonationNotes({ task });

      expect(replace).not.toHaveBeenCalled();
      mockOpenSystemFlyout.mock.calls.forEach(([, properties]) =>
        expect(properties.onClose).toBeUndefined()
      );
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

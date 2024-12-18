/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { waitFor, renderHook } from '@testing-library/react';
import { EventEmitter } from 'events';

import { setTypes } from '../../../services';
import { coreMock } from '@kbn/core/public/mocks';
import { useSavedVisInstance } from './use_saved_vis_instance';
import { redirectWhenMissing } from '@kbn/kibana-utils-plugin/public';
import { getEditBreadcrumbs, getCreateBreadcrumbs } from '../breadcrumbs';
import { VisualizeConstants } from '../../../../common/constants';
import { createVisEditorsRegistry } from '../../../vis_editors_registry';
import { createEmbeddableStateTransferMock } from '@kbn/embeddable-plugin/public/mocks';
import type { VisualizeServices } from '../../types';
import type { TypesStart } from '../../../vis_types';

const mockDefaultEditorControllerDestroy = jest.fn();
const mockEmbeddableHandlerDestroy = jest.fn();
const mockEmbeddableHandlerRender = jest.fn();
const savedVisId = '9ca7aa90-b892-11e8-a6d9-e546fe2bba5f';
const mockSavedVisInstance = {
  embeddableHandler: {
    destroy: mockEmbeddableHandlerDestroy,
    render: mockEmbeddableHandlerRender,
  },
  savedVis: {
    id: savedVisId,
    title: 'Test Vis',
  },
  vis: {
    type: {},
  },
};

jest.mock('../get_visualization_instance', () => ({
  getVisualizationInstance: jest.fn(() => mockSavedVisInstance),
}));
const mockGetVisualizationInstance = jest.requireMock(
  '../get_visualization_instance'
).getVisualizationInstance;

jest.mock('../breadcrumbs', () => ({
  getEditBreadcrumbs: jest.fn((args, title) => title),
  getCreateBreadcrumbs: jest.fn((text) => text),
}));

jest.mock('@kbn/kibana-utils-plugin/public', () => {
  const actual = jest.requireActual('@kbn/kibana-utils-plugin/public');
  return {
    ...actual,
    redirectWhenMissing: jest.fn(),
  };
});

describe('useSavedVisInstance', () => {
  const coreStartMock = coreMock.createStart();
  const toastNotifications = coreStartMock.notifications.toasts;
  let mockServices: VisualizeServices;
  const eventEmitter = new EventEmitter();

  beforeAll(() => {
    setTypes({
      all: jest
        .fn()
        .mockReturnValue([
          { name: 'area', requiresSearch: true, options: { showIndexSelection: true } },
        ]),
    } as unknown as TypesStart);
  });

  beforeEach(() => {
    const visEditorsRegistry = createVisEditorsRegistry();

    visEditorsRegistry.registerDefault(
      jest.fn().mockImplementation(() => ({ destroy: mockDefaultEditorControllerDestroy }))
    );

    mockServices = {
      ...coreStartMock,
      toastNotifications,
      visEditorsRegistry,
      stateTransferService: createEmbeddableStateTransferMock(),
      chrome: { setBreadcrumbs: jest.fn(), docTitle: { change: jest.fn() } },
      history: {
        location: {
          pathname: VisualizeConstants.EDIT_PATH,
        },
        replace: () => {},
      },
      visualizations: {
        all: jest.fn(() => [
          {
            name: 'area',
            requiresSearch: true,
            options: {
              showIndexSelection: true,
            },
          },
          { name: 'gauge' },
        ]),
      },
    } as unknown as VisualizeServices;

    mockDefaultEditorControllerDestroy.mockClear();
    mockEmbeddableHandlerDestroy.mockClear();
    mockEmbeddableHandlerRender.mockClear();
    toastNotifications.addWarning.mockClear();
    mockGetVisualizationInstance.mockClear();
  });

  test('should not load instance until chrome is defined', () => {
    const { result } = renderHook(() =>
      useSavedVisInstance(mockServices, eventEmitter, undefined, undefined, undefined)
    );
    expect(mockGetVisualizationInstance).not.toHaveBeenCalled();
    expect(result.current.visEditorController).toBeUndefined();
    expect(result.current.savedVisInstance).toBeUndefined();
    expect(result.current.visEditorRef).toBeDefined();
  });

  describe('edit saved visualization route', () => {
    test('should load instance and initiate an editor if chrome is set up', async () => {
      const { result } = renderHook(() =>
        useSavedVisInstance(mockServices, eventEmitter, true, undefined, savedVisId)
      );

      result.current.visEditorRef.current = document.createElement('div');
      expect(mockGetVisualizationInstance).toHaveBeenCalledWith(mockServices, savedVisId);
      expect(mockGetVisualizationInstance.mock.calls.length).toBe(1);

      await waitFor(() => new Promise((resolve) => resolve(null)));
      expect(mockServices.chrome.setBreadcrumbs).toHaveBeenCalledWith('Test Vis');
      expect(mockServices.chrome.docTitle.change).toHaveBeenCalledWith('Test Vis');
      expect(getEditBreadcrumbs).toHaveBeenCalledWith(
        { originatingAppName: undefined, redirectToOrigin: undefined },
        'Test Vis'
      );
      expect(getCreateBreadcrumbs).not.toHaveBeenCalled();
      expect(mockEmbeddableHandlerRender).not.toHaveBeenCalled();
      expect(result.current.visEditorController).toBeDefined();
      expect(result.current.savedVisInstance).toBeDefined();
    });

    test('should pass the input timeRange if it exists', async () => {
      const embeddableInput = {
        timeRange: {
          from: 'now-7d/d',
          to: 'now',
        },
        id: 'panel1',
      };
      const { result } = renderHook(() =>
        useSavedVisInstance(
          mockServices,
          eventEmitter,
          true,
          undefined,
          savedVisId,
          embeddableInput
        )
      );

      result.current.visEditorRef.current = document.createElement('div');
      expect(mockGetVisualizationInstance).toHaveBeenCalledWith(mockServices, savedVisId);
      expect(mockGetVisualizationInstance.mock.calls.length).toBe(1);

      await waitFor(() => new Promise((resolve) => resolve(null)));
      expect(mockServices.chrome.setBreadcrumbs).toHaveBeenCalledWith('Test Vis');
      expect(mockServices.chrome.docTitle.change).toHaveBeenCalledWith('Test Vis');
      expect(getEditBreadcrumbs).toHaveBeenCalledWith(
        { originatingAppName: undefined, redirectToOrigin: undefined },
        'Test Vis'
      );
      expect(getCreateBreadcrumbs).not.toHaveBeenCalled();
      expect(mockEmbeddableHandlerRender).not.toHaveBeenCalled();
      expect(result.current.visEditorController).toBeDefined();
      expect(result.current.savedVisInstance).toBeDefined();
      expect(result.current.savedVisInstance?.panelTimeRange).toStrictEqual({
        from: 'now-7d/d',
        to: 'now',
      });
    });

    test('should destroy the editor and the savedVis on unmount if chrome exists', async () => {
      const { result, unmount } = renderHook(() =>
        useSavedVisInstance(mockServices, eventEmitter, true, undefined, savedVisId)
      );

      result.current.visEditorRef.current = document.createElement('div');

      await waitFor(() => new Promise((resolve) => resolve(null)));
      unmount();

      expect(mockDefaultEditorControllerDestroy.mock.calls.length).toBe(1);
      expect(mockEmbeddableHandlerDestroy).not.toHaveBeenCalled();
    });
  });

  describe('create new visualization route', () => {
    beforeEach(() => {
      mockServices.history.location = {
        ...mockServices.history.location,
        pathname: VisualizeConstants.CREATE_PATH,
        search: '?type=area&indexPattern=1a2b3c4d',
      };
      // @ts-ignore-error
      delete mockSavedVisInstance.savedVis.id;
    });

    test('should create new visualization based on search params', async () => {
      const { result } = renderHook(() =>
        useSavedVisInstance(mockServices, eventEmitter, true, undefined, undefined)
      );

      result.current.visEditorRef.current = document.createElement('div');

      expect(mockGetVisualizationInstance).toHaveBeenCalledWith(mockServices, {
        indexPattern: '1a2b3c4d',
        type: 'area',
      });

      await waitFor(() => new Promise((resolve) => resolve(null)));

      expect(getCreateBreadcrumbs).toHaveBeenCalled();
      expect(mockEmbeddableHandlerRender).not.toHaveBeenCalled();
      expect(result.current.visEditorController).toBeDefined();
      expect(result.current.savedVisInstance).toBeDefined();
    });

    test('should throw error if vis type is invalid', async () => {
      mockServices.history.location = {
        ...mockServices.history.location,
        search: '?type=myVisType&indexPattern=1a2b3c4d',
      };

      renderHook(() => useSavedVisInstance(mockServices, eventEmitter, true, undefined, undefined));

      expect(mockGetVisualizationInstance).not.toHaveBeenCalled();
      expect(redirectWhenMissing).toHaveBeenCalled();
      expect(toastNotifications.addWarning).toHaveBeenCalled();
    });

    test("should throw error if index pattern or saved search id doesn't exist in search params", async () => {
      mockServices.history.location = {
        ...mockServices.history.location,
        search: '?type=area',
      };

      renderHook(() => useSavedVisInstance(mockServices, eventEmitter, true, undefined, undefined));

      expect(mockGetVisualizationInstance).not.toHaveBeenCalled();
      expect(redirectWhenMissing).toHaveBeenCalled();
      expect(toastNotifications.addWarning).toHaveBeenCalled();
    });
  });

  describe('embeded mode', () => {
    test('should create new visualization based on search params', async () => {
      const { result, unmount } = renderHook(() =>
        useSavedVisInstance(mockServices, eventEmitter, false, undefined, savedVisId)
      );

      // mock editor ref
      // @ts-expect-error
      result.current.visEditorRef.current = 'div';

      expect(mockGetVisualizationInstance).toHaveBeenCalledWith(mockServices, savedVisId);

      await waitFor(() => new Promise((resolve) => resolve(null)));

      expect(mockEmbeddableHandlerRender).toHaveBeenCalled();
      expect(result.current.visEditorController).toBeUndefined();
      expect(result.current.savedVisInstance).toBeDefined();

      unmount();
      expect(mockDefaultEditorControllerDestroy).not.toHaveBeenCalled();
      expect(mockEmbeddableHandlerDestroy.mock.calls.length).toBe(1);
    });
  });
});

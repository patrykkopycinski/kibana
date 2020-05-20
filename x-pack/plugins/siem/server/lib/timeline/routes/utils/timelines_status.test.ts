/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { TimelineType } from '../../../../../common/types/timeline';
import { FrameworkRequest } from '../../../framework';

import {
  mockUniqueParsedObjects,
  mockUniqueParsedTemplateTimelineObjects,
  mockGetTemplateTimelineValue,
  mockGetTimelineValue,
} from '../__mocks__/import_timelines';

import { TimelinesStatus as TimelinesStatusType } from './common';

describe('TimelinesStatus', () => {
  describe('timeline', () => {
    describe('given timeline exists', () => {
      const mockGetTimeline: jest.Mock = jest.fn();
      const mockGetTemplateTimeline: jest.Mock = jest.fn();
      let timelineObj: TimelinesStatusType;

      afterEach(() => {
        jest.clearAllMocks();
      });

      afterAll(() => {
        jest.resetModules();
      });

      beforeEach(async () => {
        jest.doMock('../../saved_object', () => {
          return {
            getTimeline: mockGetTimeline.mockReturnValue(mockGetTimelineValue),
            getTimelineByTemplateTimelineId: mockGetTemplateTimeline.mockReturnValue({
              timeline: [],
            }),
          };
        });

        const TimelinesStatus = jest.requireActual('./timelines_status').TimelinesStatus;

        timelineObj = new TimelinesStatus({
          timelineInput: {
            id: mockUniqueParsedObjects[0].savedObjectId,
            type: TimelineType.default,
            version: mockUniqueParsedObjects[0].version,
          },
          timelineType: TimelineType.default,
          templateTimelineInput: {
            id: mockUniqueParsedTemplateTimelineObjects[0].templateTimelineId,
            type: TimelineType.template,
            version: mockUniqueParsedTemplateTimelineObjects[0].templateTimelineVersion,
          },
          frameworkRequest: {} as FrameworkRequest,
        });

        await timelineObj.init();
      });

      test('should get timeline', () => {
        expect(mockGetTimeline).toHaveBeenCalled();
      });

      test('should get templateTimeline', () => {
        expect(mockGetTemplateTimeline).toHaveBeenCalled();
      });

      test('should not creatable', () => {
        expect(timelineObj.isCreatable).toEqual(false);
      });

      test('should not CreatableViaImport', () => {
        expect(timelineObj.isCreatableViaImport).toEqual(false);
      });

      test('should be Updatable', () => {
        expect(timelineObj.isUpdatable).toEqual(true);
      });

      test('should not be UpdatableViaImport', () => {
        expect(timelineObj.isUpdatableViaImport).toEqual(false);
      });

      test('should indicate we are handling a timeline', () => {
        expect(timelineObj.isHandlingTemplateTimeline).toEqual(false);
      });
    });

    describe('given timeline does NOT exists', () => {
      const mockGetTimeline: jest.Mock = jest.fn();
      const mockGetTemplateTimeline: jest.Mock = jest.fn();
      let timelineObj: TimelinesStatusType;

      afterEach(() => {
        jest.clearAllMocks();
      });

      afterAll(() => {
        jest.resetModules();
      });

      beforeEach(async () => {
        jest.doMock('../../saved_object', () => {
          return {
            getTimeline: mockGetTimeline.mockReturnValue(null),
            getTimelineByTemplateTimelineId: mockGetTemplateTimeline.mockReturnValue({
              timeline: [],
            }),
          };
        });

        const TimelinesStatus = jest.requireActual('./common').TimelinesStatus;

        timelineObj = new TimelinesStatus({
          timelineInput: {
            id: mockUniqueParsedObjects[0].savedObjectId,
            type: TimelineType.default,
            version: mockUniqueParsedObjects[0].version,
          },
          timelineType: TimelineType.default,
          templateTimelineInput: {
            id: mockUniqueParsedTemplateTimelineObjects[0].templateTimelineId,
            type: TimelineType.template,
            version: mockUniqueParsedTemplateTimelineObjects[0].templateTimelineVersion,
          },
          frameworkRequest: {} as FrameworkRequest,
        });

        await timelineObj.init();
      });

      test('should get timeline', () => {
        expect(mockGetTimeline).toHaveBeenCalled();
      });

      test('should get templateTimeline', () => {
        expect(mockGetTemplateTimeline).toHaveBeenCalled();
      });

      test('should be creatable', () => {
        expect(timelineObj.isCreatable).toEqual(true);
      });

      test('should be CreatableViaImport', () => {
        expect(timelineObj.isCreatableViaImport).toEqual(true);
      });

      test('should be Updatable', () => {
        expect(timelineObj.isUpdatable).toEqual(false);
      });

      test('should not be UpdatableViaImport', () => {
        expect(timelineObj.isUpdatableViaImport).toEqual(false);
      });

      test('should indicate we are handling a timeline', () => {
        expect(timelineObj.isHandlingTemplateTimeline).toEqual(false);
      });
    });
  });

  describe('template timeline', () => {
    describe('given template timeline exists', () => {
      const mockGetTimeline: jest.Mock = jest.fn();
      const mockGetTemplateTimeline: jest.Mock = jest.fn();

      let timelineObj: TimelinesStatusType;

      beforeEach(async () => {
        jest.doMock('../../saved_object', () => ({
          getTimeline: mockGetTimeline.mockReturnValue(mockGetTemplateTimelineValue),
          getTimelineByTemplateTimelineId: mockGetTemplateTimeline.mockReturnValue({
            timeline: [mockGetTemplateTimelineValue],
          }),
        }));

        const TimelinesStatus = jest.requireActual('./common').TimelinesStatus;

        timelineObj = new TimelinesStatus({
          timelineInput: {
            id: mockUniqueParsedObjects[0].savedObjectId,
            type: TimelineType.default,
            version: mockUniqueParsedObjects[0].version,
          },
          timelineType: TimelineType.template,
          templateTimelineInput: {
            id: mockUniqueParsedTemplateTimelineObjects[0].templateTimelineId,
            type: TimelineType.template,
            version: mockUniqueParsedTemplateTimelineObjects[0].templateTimelineVersion,
          },
          frameworkRequest: {} as FrameworkRequest,
        });
        await timelineObj.init();
      });

      afterEach(() => {
        jest.clearAllMocks();
      });

      afterAll(() => {
        jest.resetModules();
      });

      test('should get timeline', () => {
        expect(mockGetTimeline).toHaveBeenCalled();
      });

      test('should get templateTimeline', () => {
        expect(mockGetTemplateTimeline).toHaveBeenCalled();
      });

      test('should not creatable', () => {
        expect(timelineObj.isCreatable).toEqual(false);
      });

      test('should not CreatableViaImport', () => {
        expect(timelineObj.isCreatableViaImport).toEqual(false);
      });

      test('should be Updatable', () => {
        expect(timelineObj.isUpdatable).toEqual(true);
      });

      test('should be UpdatableViaImport', () => {
        expect(timelineObj.isUpdatableViaImport).toEqual(true);
      });

      test('should indicate we are handling a template timeline', () => {
        expect(timelineObj.isHandlingTemplateTimeline).toEqual(true);
      });
    });

    describe('given template timeline does NOT exists', () => {
      const mockGetTimeline: jest.Mock = jest.fn();
      const mockGetTemplateTimeline: jest.Mock = jest.fn();

      let timelineObj: TimelinesStatusType;

      afterEach(() => {
        jest.clearAllMocks();
      });

      afterAll(() => {
        jest.resetModules();
      });

      beforeEach(async () => {
        jest.doMock('../../saved_object', () => ({
          getTimeline: mockGetTimeline,
          getTimelineByTemplateTimelineId: mockGetTemplateTimeline,
        }));

        const TimelinesStatus = jest.requireActual('./common').TimelinesStatus;

        timelineObj = new TimelinesStatus({
          timelineInput: {
            id: mockUniqueParsedObjects[0].savedObjectId,
            type: TimelineType.default,
            version: mockUniqueParsedObjects[0].version,
          },
          timelineType: TimelineType.template,
          templateTimelineInput: {
            id: mockUniqueParsedTemplateTimelineObjects[0].templateTimelineId,
            type: TimelineType.template,
            version: mockUniqueParsedTemplateTimelineObjects[0].templateTimelineVersion,
          },
          frameworkRequest: {} as FrameworkRequest,
        });
        await timelineObj.init();
      });

      test('should get timeline', () => {
        expect(mockGetTimeline).toHaveBeenCalled();
      });

      test('should get templateTimeline', () => {
        expect(mockGetTemplateTimeline).toHaveBeenCalled();
      });

      test('should be creatable', () => {
        expect(timelineObj.isCreatable).toEqual(true);
      });

      test('should be CreatableViaImport', () => {
        expect(timelineObj.isCreatableViaImport).toEqual(true);
      });

      test('should be Updatable', () => {
        expect(timelineObj.isUpdatable).toEqual(false);
      });

      test('should be UpdatableViaImport', () => {
        expect(timelineObj.isUpdatableViaImport).toEqual(false);
      });

      test('should indicate we are handling a template timeline', () => {
        expect(timelineObj.isHandlingTemplateTimeline).toEqual(true);
      });
    });
  });
});

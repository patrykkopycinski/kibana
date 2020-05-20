/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { TimelineTypeLiteralWithNull, TimelineType } from '../../../../../common/types/timeline';
import { FrameworkRequest } from '../../../framework';

import { TimelineStatusActions, TimelineStatusAction } from './common';
import { TimelineObject } from './timeline_input';
import {
  checkIsCreateFailureCases,
  checkIsUpdateFailureCases,
  checkIsCreateViaImportFailureCases,
} from './failure_cases';

interface GivenTimelineInput {
  id: string | null;
  type: TimelineTypeLiteralWithNull;
  version: string | number | null;
}

interface TimelinesStatusProps {
  timelineType: TimelineTypeLiteralWithNull;
  timelineInput: GivenTimelineInput;
  templateTimelineInput: GivenTimelineInput;
  frameworkRequest: FrameworkRequest;
}

export class TimelinesStatus {
  public readonly timelineObject: TimelineObject;
  public readonly templateTimelineObject: TimelineObject;
  private readonly timelineType: TimelineTypeLiteralWithNull;

  constructor({
    timelineType = TimelineType.default,
    timelineInput,
    templateTimelineInput,
    frameworkRequest,
  }: TimelinesStatusProps) {
    this.timelineObject = new TimelineObject({
      id: timelineInput.id,
      type: timelineInput.type,
      version: timelineInput.version,
      frameworkRequest,
    });

    this.templateTimelineObject = new TimelineObject({
      id: templateTimelineInput.id,
      type: templateTimelineInput.type,
      version: templateTimelineInput.version,
      frameworkRequest,
    });

    this.timelineType = timelineType ?? TimelineType.default;
  }

  public get isCreatable() {
    return (
      (this.timelineObject.isCreatable && !this.isHandlingTemplateTimeline) ||
      (this.templateTimelineObject.isCreatable &&
        this.timelineObject.isCreatable &&
        this.isHandlingTemplateTimeline)
    );
  }

  public get isCreatableViaImport() {
    return this.isCreatable;
  }

  public get isUpdatable() {
    return (
      (this.timelineObject.isUpdatable && !this.isHandlingTemplateTimeline) ||
      (this.templateTimelineObject.isUpdatable && this.isHandlingTemplateTimeline)
    );
  }

  public get isUpdatableViaImport() {
    return (
      (this.timelineObject.isUpdatableViaImport && !this.isHandlingTemplateTimeline) ||
      (this.templateTimelineObject.isUpdatableViaImport && this.isHandlingTemplateTimeline)
    );
  }

  public getFailureChecker(action?: TimelineStatusAction) {
    if (action === TimelineStatusActions.create) {
      return checkIsCreateFailureCases;
    } else if (action === TimelineStatusActions.createViaImport) {
      return checkIsCreateViaImportFailureCases;
    } else {
      return checkIsUpdateFailureCases;
    }
  }

  public checkIsFailureCases(action?: TimelineStatusAction) {
    const failureChecker = this.getFailureChecker(action);
    const version = this.templateTimelineObject.getVersion;
    return failureChecker(
      this.isHandlingTemplateTimeline,
      this.timelineObject.getVersion?.toString() ?? null,
      version != null && typeof version === 'string' ? parseInt(version, 10) : version,
      this.timelineObject.data,
      this.templateTimelineObject.data
    );
  }

  public get templateTimelineInput() {
    return this.templateTimelineObject;
  }

  public get timelineInput() {
    return this.timelineObject;
  }

  private getTimelines() {
    return Promise.all([
      this.timelineObject.getTimeline(),
      this.templateTimelineObject.getTimeline(),
    ]);
  }

  public get isHandlingTemplateTimeline() {
    return this.timelineType === TimelineType.template;
  }

  public async init() {
    await this.getTimelines();
  }
}

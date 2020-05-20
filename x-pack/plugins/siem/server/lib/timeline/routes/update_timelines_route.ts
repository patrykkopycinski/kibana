/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { IRouter } from '../../../../../../../src/core/server';

import { TIMELINE_URL } from '../../../../common/constants';
import { TimelineType } from '../../../../common/types/timeline';

import { SetupPlugins } from '../../../plugin';
import { buildRouteValidation } from '../../../utils/build_validation/route_validation';
import { ConfigType } from '../../..';

import { transformError, buildSiemResponse } from '../../detection_engine/routes/utils';
import { FrameworkRequest } from '../../framework';

import { updateTimelineSchema } from './schemas/update_timelines_schema';
import { buildFrameworkRequest, TimelinesStatus, TimelineStatusActions } from './utils/common';
import { createTimelines } from './utils/create_timelines';

export const updateTimelinesRoute = (
  router: IRouter,
  config: ConfigType,
  security: SetupPlugins['security']
) => {
  router.patch(
    {
      path: TIMELINE_URL,
      validate: {
        body: buildRouteValidation(updateTimelineSchema),
      },
      options: {
        tags: ['access:siem'],
      },
    },
    // eslint-disable-next-line complexity
    async (context, request, response) => {
      const siemResponse = buildSiemResponse(response);

      try {
        const frameworkRequest = await buildFrameworkRequest(context, security, request);
        const { timelineId, timeline, version } = request.body;
        const { templateTimelineId, templateTimelineVersion, timelineType } = timeline;

        const { isUpdatable, checkIsFailureCases, init: initTimelineStatus } = new TimelinesStatus({
          timelineType: timelineType ?? TimelineType.default,
          timelineInput: {
            id: timelineId,
            type: TimelineType.default,
            version,
          },
          templateTimelineInput: {
            id: templateTimelineId ?? null,
            type: TimelineType.template,
            version: templateTimelineVersion ?? null,
          },
          frameworkRequest,
        });
        await initTimelineStatus();

        if (isUpdatable) {
          const updatedTimeline = await createTimelines(
            (frameworkRequest as unknown) as FrameworkRequest,
            timeline,
            timelineId,
            version
          );
          return response.ok({
            body: {
              data: {
                persistTimeline: updatedTimeline,
              },
            },
          });
        } else {
          const error = checkIsFailureCases(TimelineStatusActions.update);
          return siemResponse.error(
            error || {
              statusCode: 405,
              body: 'update timeline error',
            }
          );
        }
      } catch (err) {
        const error = transformError(err);
        return siemResponse.error({
          body: error.message,
          statusCode: error.statusCode,
        });
      }
    }
  );
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema, type TypeOf } from '@kbn/config-schema';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';

const configResponseSchema = schema.object({
  enabled: schema.boolean(),
  connector: schema.object({
    id: schema.string(),
    actionTypeId: schema.string(),
  }),
  thresholds: schema.object({
    minimumConfidence: schema.number(),
    maximumAlertsPerRun: schema.number(),
    fprProfile: schema.object({
      scoreThreshold: schema.number(),
      safeTuningClasses: schema.arrayOf(schema.string()),
      status: schema.string(),
      decisionDate: schema.string(),
    }),
  }),
  already_tagged: schema.boolean(),
});

export type DaybreakConfigResponse = TypeOf<typeof configResponseSchema>;

export const registerConfigRoute = ({ logger, router }: RouteDependencies) => {
  const wrapHandler = getHandlerWrapper({ logger });

  router.get(
    {
      path: '/internal/daybreak/config',
      security: daybreakRouteSecurity,
      validate: false,
      options: { access: 'internal' },
    },
    wrapHandler(async (ctx, request, response) => {
      return response.ok({
        body: {
          enabled: true,
          connector: {
            id: 'eis-anthropic-claude-5-sonnet',
            actionTypeId: '.inference',
          },
          thresholds: {
            minimumConfidence: 0.7,
            maximumAlertsPerRun: 25,
            fprProfile: {
              scoreThreshold: 0.8,
              safeTuningClasses: [],
              status: 'unratified',
              decisionDate: '2026-07-13',
            },
          },
          already_tagged: false,
        },
      });
    })
  );
};

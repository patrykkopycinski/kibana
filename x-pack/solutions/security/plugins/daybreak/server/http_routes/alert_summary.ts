/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { daybreakApiPath } from '../../common/http_api';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';
import { daybreakGoldenDataset } from '../evals/golden_dataset';

const alertSummaryQuerySchema = schema.object({
  rowId: schema.maybe(schema.string()),
  alertId: schema.maybe(schema.string()),
});

const findGoldenRow = (rowId?: string, alertId?: string) => {
  if (rowId) {
    return daybreakGoldenDataset.examples.find((row) => row.id === rowId);
  }
  if (alertId) {
    return daybreakGoldenDataset.examples.find(
      (row) => row.input.alertEvidence.alertId === alertId
    );
  }
  return daybreakGoldenDataset.examples[0];
};

export const registerAlertSummaryRoute = ({ logger, router }: RouteDependencies) => {
  const wrapHandler = getHandlerWrapper({ logger });

  router.get(
    {
      path: `${daybreakApiPath}/alert-summary`,
      security: daybreakRouteSecurity,
      validate: { query: alertSummaryQuerySchema },
      options: { access: 'public' },
    },
    wrapHandler(async (ctx, request, response) => {
      const { rowId, alertId } = request.query;
      const row = findGoldenRow(rowId, alertId);

      if (!row) {
        const key = rowId ?? alertId ?? '(default)';
        return response.notFound({ body: { message: `Golden dataset row not found: ${key}` } });
      }

      const evidence = row.input.alertEvidence;
      return response.ok({
        body: {
          total: 1,
          rowId: row.id,
          alertId: evidence.alertId,
          alerts: [
            {
              _id: evidence.alertId,
              _source: {
                alertId: evidence.alertId,
                rowId: row.id,
                ruleName: evidence.ruleName,
                ruleDescription: evidence.ruleDescription,
                severity: evidence.severity,
                signalCount: evidence.signalCount,
                hostSummary: evidence.hostSummary,
                summary: evidence.summary,
                tactics: evidence.tactics,
                stanceSignals: evidence.stanceSignals,
              },
            },
          ],
        },
      });
    })
  );
};

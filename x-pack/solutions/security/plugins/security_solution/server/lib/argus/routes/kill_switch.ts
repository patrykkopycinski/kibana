/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';

import {
  ARGUS_SOC_INDICES,
  ARGUS_WRITE_API_CAPABILITY,
  KILL_SWITCH_DOC_ID,
  KILL_SWITCH_ROUTE,
  buildKillSwitchState,
  type RawKillSwitchDoc,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';

const toggleBodySchema = schema.object({
  autonomy_enabled: schema.boolean(),
  reason: schema.string({ minLength: 1, maxLength: 1024 }),
  scope: schema.maybe(schema.string({ minLength: 1, maxLength: 128 })),
  artifact_type: schema.maybe(schema.string({ minLength: 1, maxLength: 128 })),
});

export const registerKillSwitchRoutes = ({ router, logger }: ArgusRoutesDeps) => {
  // ── GET — everyone with `securitySolution` read can see the current state.
  // The UI uses this to paint the header chip and to decide whether to show
  // the "Re-enable" vs "Disable" toggle.
  router.versioned
    .get({
      access: 'internal',
      path: KILL_SWITCH_ROUTE,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution'],
        },
      },
    })
    .addVersion({ version: '1', validate: false }, async (context, _request, response) => {
      const siemResponse = buildSiemResponse(response);
      try {
        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const source = await fetchKillSwitchSource(esClient);
        return response.ok({ body: buildKillSwitchState({ source }) });
      } catch (err) {
        const error = transformError(err);
        logger.error(`Argus kill_switch GET failed: ${error.message}`);
        return siemResponse.error({
          statusCode: error.statusCode,
          body: error.message,
        });
      }
    });

  // ── POST — gated by the write capability so `siem.show` users cannot
  // flip autonomy. Writes are append-and-upsert: we overwrite the singleton
  // doc AND push an audit-trail entry so there's a tamper-resistant record
  // of who flipped what and why.
  router.versioned
    .post({
      access: 'internal',
      path: KILL_SWITCH_ROUTE,
      security: {
        authz: {
          requiredPrivileges: [ARGUS_WRITE_API_CAPABILITY],
        },
      },
    })
    .addVersion(
      { version: '1', validate: { request: { body: toggleBodySchema } } },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);
        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;
          const username = core.security.authc.getCurrentUser()?.username ?? 'unknown';

          const previous = await fetchKillSwitchSource(esClient);
          const previousEnabled =
            previous?.autonomy_enabled === undefined ? true : Boolean(previous.autonomy_enabled);

          const now = new Date().toISOString();
          const nextDoc: RawKillSwitchDoc = {
            autonomy_enabled: request.body.autonomy_enabled,
            reason: request.body.reason,
            set_by: username,
            previous_state: previousEnabled,
            scope: request.body.scope,
            artifact_type: request.body.artifact_type,
            '@timestamp': now,
          };

          await esClient.index({
            index: ARGUS_SOC_INDICES.killSwitch,
            id: KILL_SWITCH_DOC_ID,
            refresh: 'wait_for',
            document: nextDoc,
          });

          await writeAuditEntry(
            esClient,
            {
              '@timestamp': now,
              action: 'kill_switch_toggle',
              subject_kind: 'kill_switch',
              subject_id: KILL_SWITCH_DOC_ID,
              actor: username,
              from: { autonomy_enabled: previousEnabled },
              to: { autonomy_enabled: request.body.autonomy_enabled },
              reason: request.body.reason,
              scope: request.body.scope,
              artifact_type: request.body.artifact_type,
            },
            logger
          );

          const state = buildKillSwitchState({ source: nextDoc });
          return response.ok({
            body: {
              state: state.state,
              bootstrap: false,
              previous_state: { autonomy_enabled: previousEnabled },
            },
          });
        } catch (err) {
          const error = transformError(err);
          logger.error(`Argus kill_switch POST failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};

const fetchKillSwitchSource = async (
  esClient: ElasticsearchClient
): Promise<RawKillSwitchDoc | undefined> => {
  try {
    const res = await esClient.get<RawKillSwitchDoc>({
      index: ARGUS_SOC_INDICES.killSwitch,
      id: KILL_SWITCH_DOC_ID,
    });
    return (res._source ?? undefined) as RawKillSwitchDoc | undefined;
  } catch (err) {
    // 404 → bootstrap state. Anything else → surface the error.
    if ((err as { statusCode?: number })?.statusCode === 404) return undefined;
    if ((err as { meta?: { statusCode?: number } })?.meta?.statusCode === 404) return undefined;
    throw err;
  }
};

const writeAuditEntry = async (
  esClient: ElasticsearchClient,
  entry: Record<string, unknown>,
  logger: Logger
): Promise<void> => {
  try {
    await esClient.index({
      index: ARGUS_SOC_INDICES.auditTrail,
      document: entry,
    });
  } catch (err) {
    // Audit failures must not block the primary write (kill-switch doc
    // upsert is the source of truth), but silent failures are un-diagnosable.
    // Log a warning so orphan toggles are traceable.
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `Argus audit_trail write failed for ${entry.subject_kind}=${entry.subject_id}: ${message}`
    );
  }
};

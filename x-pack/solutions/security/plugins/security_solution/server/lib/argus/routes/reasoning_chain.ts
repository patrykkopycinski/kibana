/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';

import { REASONING_CHAIN_ROUTE, type ReasoningChainSubject } from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';
import { fetchReasoningChain } from '../fetch_reasoning_chain';

const subjectSchema = schema.object({
  subject_kind: schema.oneOf([schema.literal('alert'), schema.literal('run')]),
  subject_id: schema.string({ minLength: 1, maxLength: 1024 }),
});

export const registerReasoningChainRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: REASONING_CHAIN_ROUTE,
      security: {
        authz: {
          // Demo-grade: reuse the existing Security Solution privilege. Phase B
          // will switch to a dedicated `siem.argus_read` sub-feature privilege.
          requiredPrivileges: ['securitySolution'],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: { request: { query: subjectSchema } },
      },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);
        const subject: ReasoningChainSubject = {
          kind: request.query.subject_kind,
          id: request.query.subject_id,
        };

        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;
          const result = await fetchReasoningChain(esClient, subject);
          return response.ok({ body: result });
        } catch (err) {
          const error = transformError(err);
          logger.error(
            `Argus reasoning_chain route failed for ${subject.kind}:${subject.id}: ${error.message}`
          );
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};

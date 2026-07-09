/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, RequestHandler } from '@kbn/core/server';
import { ProposalNotFoundError } from '../client/proposals/client';
import { ReadinessGateError } from '../client/proposals/gate';
import { EvidenceNotFoundError } from '../client/evidence/client';

/**
 * Wraps a Daybreak route handler with structured error mapping so the PD-2
 * store domain errors surface as meaningful HTTP responses:
 *
 * - {@link ProposalNotFoundError} / {@link EvidenceNotFoundError} → 404
 * - {@link ReadinessGateError} → 400 with the {@link GateFailure} body, so the
 *   gate-approval UI can render the `missingRequirements` list (FR-7, FR-016)
 * - anything else → 500
 *
 * The readiness-gate logic itself stays server-side (FR-7); the browser only
 * receives the structured failure.
 */
export const getHandlerWrapper =
  ({ logger }: { logger: Logger }) =>
  <P, Q, B>(handler: RequestHandler<P, Q, B>): RequestHandler<P, Q, B> => {
    return async (ctx, req, res) => {
      try {
        return await handler(ctx, req, res);
      } catch (e) {
        if (e instanceof ProposalNotFoundError || e instanceof EvidenceNotFoundError) {
          return res.notFound({
            body: { message: e.message },
          });
        }

        if (e instanceof ReadinessGateError) {
          return res.badRequest({
            body: {
              message: e.message,
              attributes: { failure: e.failure },
            },
          });
        }

        logger.error(
          `Unexpected error in daybreak route: ${
            e instanceof Error ? e.stack ?? e.message : String(e)
          }`
        );
        return res.customError({
          statusCode: 500,
          body: {
            message: e instanceof Error ? e.message : 'An unexpected error occurred',
          },
        });
      }
    };
  };

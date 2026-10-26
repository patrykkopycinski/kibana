/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — Kibana routes.
 *
 * These proxy the detonation service so that the browser never talks to it
 * directly: the service address is operator configuration, the analyst's
 * Kibana privileges are enforced here, and nothing about the deployment leaks
 * into the client bundle.
 *
 * All four analyst surfaces (page, alert action, Agent Builder skill, workflow
 * step) reach the service through these routes, so authorization and error
 * shaping are decided once.
 */

import { schema } from '@kbn/config-schema';
import type {
  IKibanaResponse,
  KibanaRequest,
  KibanaResponseFactory,
  Logger,
} from '@kbn/core/server';
import type { Readable } from 'stream';

import {
  DETONATE_HEALTHCHECK_PATH,
  DETONATE_SUBMIT_FILE_PATH,
  DETONATE_SUBMIT_HASH_PATH,
  DETONATE_TASKS_PATH,
} from '../../../common/detonate_prototype';
import type { DetonateTask } from '../../../common/detonate_prototype';
import type { SecuritySolutionPluginRouter } from '../../types';
import type { EndpointAppContextService } from '../../endpoint/endpoint_app_context_services';
import type { DetonateClient } from '../client';
import { DetonateServiceError } from '../client';

/**
 * A detonation sample is a malware binary. It is capped well below Kibana's
 * default payload ceiling: this prototype submits samples, it is not a file
 * transfer service.
 */
const MAX_SAMPLE_BYTES = 32 * 1024 * 1024;

/** Mirrors the service's optional submit fields. Everything is bounded. */
const submitOptionsSchema = {
  tags: schema.maybe(schema.arrayOf(schema.string({ maxLength: 256 }), { maxSize: 32 })),
  exec_wait_secs: schema.maybe(schema.number({ min: 0, max: 3600 })),
  pre_exec_commands: schema.maybe(
    schema.arrayOf(schema.string({ maxLength: 4096 }), { maxSize: 64 })
  ),
  exec_commands: schema.maybe(schema.arrayOf(schema.string({ maxLength: 4096 }), { maxSize: 64 })),
  exec_sample_arguments: schema.maybe(schema.string({ maxLength: 4096 })),
  vm_os_family: schema.maybe(
    schema.oneOf([schema.literal('linux'), schema.literal('windows'), schema.literal('macos')])
  ),
  vm_architecture: schema.maybe(
    schema.oneOf([schema.literal('x86_64'), schema.literal('aarch64')])
  ),
  vm_disk_image: schema.maybe(schema.string({ maxLength: 512 })),
  vm_has_internet: schema.maybe(schema.boolean()),
};

export interface DetonateRoutesDeps {
  router: SecuritySolutionPluginRouter;
  logger: Logger;
  /**
   * Resolved lazily so the routes exist even when the service is unreachable:
   * a misconfigured prototype answers 502 with an explanation, rather than
   * breaking Kibana's route registration at startup.
   */
  getClient: () => DetonateClient;
  /**
   * Submission is a write: it boots a VM and runs the sample as live malware.
   * The route-level `securitySolution` privilege is read-level, so the write
   * privilege is asserted in the handlers, the same check the Agent Builder
   * tool performs.
   */
  endpointAppContextService: EndpointAppContextService;
}

/** Collect a streamed upload, refusing anything over the cap mid-stream. */
const readSample = async (stream: Readable, maxBytes: number): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      // Stop reading rather than buffering the rest of an oversized upload.
      stream.destroy();
      throw new DetonateServiceError(
        `Sample exceeds the ${Math.floor(maxBytes / 1024 / 1024)}MB limit.`,
        400
      );
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
};

export const registerDetonatePrototypeRoutes = ({
  router,
  logger,
  getClient,
  endpointAppContextService,
}: DetonateRoutesDeps) => {
  /**
   * Shape an error for the analyst. The service's own message is passed
   * through only when it carries an actionable status; anything else becomes a
   * generic 502 so that a service-side stack trace cannot reach the browser.
   */
  const toErrorResponse = (error: unknown, response: KibanaResponseFactory): IKibanaResponse => {
    if (error instanceof DetonateServiceError) {
      return response.customError({
        statusCode: error.statusCode,
        body: { message: error.message },
      });
    }
    logger.error(
      `Detonate prototype route failed: ${error instanceof Error ? error.stack : error}`
    );
    return response.customError({
      statusCode: 500,
      body: { message: 'The detonation request could not be completed.' },
    });
  };

  /**
   * A detonation spends a VM and runs the sample as live malware — a write in
   * every sense that matters, even though it mutates nothing in Kibana. The
   * route-level privilege is read-level, so the write privilege is asserted
   * here, mirroring the check the Agent Builder tool does in-process.
   */
  const hasWritePrivilege = async (request: KibanaRequest): Promise<boolean> => {
    const authz = await endpointAppContextService.getEndpointAuthz(request);
    return authz.canWriteSecuritySolution;
  };

  router.versioned
    .get({
      access: 'internal',
      path: DETONATE_HEALTHCHECK_PATH,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion({ version: '1', validate: false }, async (_context, _request, response) => {
      try {
        return response.ok({ body: await getClient().healthcheck() });
      } catch (error) {
        return toErrorResponse(error, response);
      }
    });

  router.versioned
    .post({
      access: 'internal',
      path: DETONATE_SUBMIT_FILE_PATH,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
      options: {
        body: {
          accepts: ['multipart/form-data'],
          output: 'stream',
          maxBytes: MAX_SAMPLE_BYTES,
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: schema.object({
              sample_file: schema.stream(),
              sample_filename: schema.string({ minLength: 1, maxLength: 512 }),
              /**
               * The options arrive as a JSON string because the rest of the
               * request is multipart. Parsed and validated below rather than
               * trusted.
               */
              request_json: schema.maybe(schema.string({ maxLength: 16 * 1024 })),
            }),
          },
        },
      },
      async (_context, request, response): Promise<IKibanaResponse> => {
        try {
          if (!(await hasWritePrivilege(request))) {
            return response.forbidden({
              body: {
                message:
                  'Submitting a sample for detonation requires the Security Solution write privilege.',
              },
            });
          }

          const { sample_file: sampleFile, sample_filename: sampleFilename } = request.body;

          let options = {};
          if (request.body.request_json) {
            try {
              options = JSON.parse(request.body.request_json);
            } catch {
              return response.badRequest({
                body: { message: '`request_json` is not valid JSON.' },
              });
            }
            try {
              options = schema.object(submitOptionsSchema).validate(options);
            } catch {
              // `validate` throws rather than returning errors, and without
              // this branch a malformed option would surface as a 500.
              return response.badRequest({
                body: { message: '`request_json` contains invalid options.' },
              });
            }
          }

          const body = await readSample(sampleFile as Readable, MAX_SAMPLE_BYTES);
          if (body.length === 0) {
            return response.badRequest({ body: { message: 'The sample file is empty.' } });
          }

          const task = await getClient().submitFile(
            { ...options, sample_filename: sampleFilename },
            { filename: sampleFilename, body }
          );

          return response.ok<DetonateTask>({ body: task });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  router.versioned
    .post({
      access: 'internal',
      path: DETONATE_SUBMIT_HASH_PATH,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: schema.object({
              // Accepts the hash lengths the service does; bounded either way.
              sample_hash: schema.string({ minLength: 32, maxLength: 128 }),
              ...submitOptionsSchema,
            }),
          },
        },
      },
      async (_context, request, response): Promise<IKibanaResponse> => {
        try {
          if (!(await hasWritePrivilege(request))) {
            return response.forbidden({
              body: {
                message:
                  'Submitting a sample for detonation requires the Security Solution write privilege.',
              },
            });
          }

          return response.ok<DetonateTask>({ body: await getClient().submitHash(request.body) });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  router.versioned
    .get({
      access: 'internal',
      path: `${DETONATE_TASKS_PATH}/{taskId}`,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({ taskId: schema.string({ minLength: 1, maxLength: 128 }) }),
          },
        },
      },
      async (_context, request, response): Promise<IKibanaResponse> => {
        try {
          return response.ok<DetonateTask>({
            body: await getClient().getTask(request.params.taskId),
          });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  router.versioned
    .get({
      access: 'internal',
      path: `${DETONATE_TASKS_PATH}/{taskId}/updates`,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({ taskId: schema.string({ minLength: 1, maxLength: 128 }) }),
          },
        },
      },
      async (_context, request, response): Promise<IKibanaResponse> => {
        try {
          return response.ok({ body: await getClient().getTaskUpdates(request.params.taskId) });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  router.versioned
    .get({
      access: 'internal',
      path: DETONATE_TASKS_PATH,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            query: schema.object({
              query_string: schema.maybe(schema.string({ maxLength: 1024 })),
              offset: schema.maybe(schema.number({ min: 0 })),
              size: schema.maybe(schema.number({ min: 1, max: 200 })),
            }),
          },
        },
      },
      async (_context, request, response): Promise<IKibanaResponse> => {
        try {
          return response.ok({ body: await getClient().listTasks(request.query) });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  /**
   * Runs→alerts reverse index, as its own route so the alert surface can ask
   * "every run started from this alert" without learning the service's tag
   * convention. Read-only, so no write-privilege guard.
   */
  router.versioned
    .get({
      access: 'internal',
      path: `${DETONATE_TASKS_PATH}/alert/{alertId}`,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({
              alertId: schema.string({ minLength: 1, maxLength: 128 }),
            }),
          },
        },
      },
      async (_context, request, response): Promise<IKibanaResponse> => {
        try {
          return response.ok({
            body: await getClient().listTasks({ alert_id: request.params.alertId }),
          });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );
};

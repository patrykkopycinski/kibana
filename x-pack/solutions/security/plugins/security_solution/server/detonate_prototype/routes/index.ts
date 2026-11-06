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
  ElasticsearchClient,
  IKibanaResponse,
  KibanaRequest,
  KibanaResponseFactory,
  Logger,
} from '@kbn/core/server';
import type { Readable } from 'stream';
import { DETONATE_API_ACTION_ALL } from '@kbn/security-solution-features/actions';
import { ALERTZERO_API_PRIVILEGE_READ } from '@kbn/alertzero-plugin/common/constants';

import {
  DETONATE_HEALTHCHECK_PATH,
  DETONATE_MAX_ALERT_DOCS,
  DETONATE_PRIOR_RUNS_PATH,
  DETONATE_RUNS_PATH,
  DETONATE_SUBMIT_FILE_PATH,
  DETONATE_SUBMIT_HASH_PATH,
  DETONATE_TASKS_PATH,
  DETONATE_USAGE_PATH,
  detonateAllowanceWindow,
  detonateSandboxStreamName,
} from '../../../common/detonate_prototype';
import type {
  DetonateFileRequest,
  DetonateSandboxIngestResult,
  DetonateTask,
  DetonateUsage,
} from '../../../common/detonate_prototype';
import type { SecuritySolutionPluginRouter } from '../../types';
import type { EndpointAppContextService } from '../../endpoint/endpoint_app_context_services';
import type { DetonateClient } from '../client';
import { DetonateServiceError } from '../client';
import type { HasDetonatePrivilege } from '../authz';
import {
  countRunsInSpaceSince,
  getTaskInSpace,
  listTasksInSpace,
  lookupPriorRunsInSpace,
  submitInSpace,
} from '../space_scope';
import { toDetonationRecord } from '../detonation_record';
import { IOC_ALERT_READ_LIMIT, readTaskAlerts, readTaskIocs } from '../ioc_extraction';
import { ingestSandboxDocs, installSandboxTemplate } from '../sandbox_ingest';
import type { DetonationRecord } from '../detonation_record';

/**
 * Either privilege opens the routes: an analyst's Security Solution access, or the dedicated Detonate
 * sub-feature that automation identities hold without broad Security access.
 */
const DETONATE_ROUTE_SECURITY = {
  authz: { requiredPrivileges: [{ anyRequired: ['securitySolution', DETONATE_API_ACTION_ALL] }] },
};

/**
 * The run record and the allowance usage are also read from AlertZero (the Detonation attachment,
 * the Worker config panel), whose users may hold AlertZero read without Security access. Both are
 * read-only, run as the requesting user, and are space-scoped like every other route.
 */
export const DETONATE_RECORD_ROUTE_SECURITY = {
  authz: {
    requiredPrivileges: [
      {
        anyRequired: ['securitySolution', DETONATE_API_ACTION_ALL, ALERTZERO_API_PRIVILEGE_READ],
      },
    ],
  },
};

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
    schema.oneOf([schema.literal('linux'), schema.literal('windows'), schema.literal('darwin')])
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
   * breaking Kibana's route registration at startup. Takes the request because
   * a connector-backed client runs as the requesting user.
   */
  getClient: (request: KibanaRequest) => DetonateClient;
  /** Resolves the active space, which scopes every run. */
  endpointAppContextService: EndpointAppContextService;
  /**
   * Submission is a write: it boots a VM and runs the sample as live malware.
   * The route-level privilege is read-level, so write access is asserted in the
   * handlers, the same check the Agent Builder tool performs.
   */
  hasDetonatePrivilege: HasDetonatePrivilege;
  /** Runs per space per UTC month, reported by the usage route. */
  monthlyAllowance: number;
  /**
   * Kibana's internal user: the sandbox stream is a hidden `.kibana-` stream
   * that analysts cannot write to, and the route checks the run's space first.
   */
  getInternalEsClient: () => Promise<ElasticsearchClient>;
  /** Injected so tests can pin the month. */
  now?: () => Date;
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
  hasDetonatePrivilege,
  monthlyAllowance,
  getInternalEsClient,
  now = () => new Date(),
}: DetonateRoutesDeps) => {
  // Installed once per process; a failed install is retried on the next call.
  let sandboxTemplate: Promise<void> | undefined;
  const ensureSandboxTemplate = (esClient: ElasticsearchClient) => {
    sandboxTemplate =
      sandboxTemplate ??
      installSandboxTemplate(esClient).catch((error) => {
        sandboxTemplate = undefined;
        throw error;
      });
    return sandboxTemplate;
  };

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

  /** Runs are tagged with the space they were submitted from, and read back only from it. */
  const spaceIdFromRequest = (request: KibanaRequest): string =>
    endpointAppContextService.getActiveSpaceId(request);

  router.versioned
    .get({
      access: 'internal',
      path: DETONATE_HEALTHCHECK_PATH,
      security: DETONATE_ROUTE_SECURITY,
    })
    .addVersion({ version: '1', validate: false }, async (_context, request, response) => {
      try {
        return response.ok({ body: await getClient(request).healthcheck() });
      } catch (error) {
        return toErrorResponse(error, response);
      }
    });

  // The prior-run gate the workflow's first switch reads. `unknown` is passed
  // through untouched — the workflow, not the route, decides that unknown
  // means "detonate".
  router.versioned
    .get({
      access: 'internal',
      path: `${DETONATE_PRIOR_RUNS_PATH}/{sha256}`,
      security: DETONATE_ROUTE_SECURITY,
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({
              sha256: schema.string({
                minLength: 64,
                maxLength: 64,
                validate: (value) =>
                  /^[a-fA-F0-9]{64}$/.test(value) ? undefined : 'must be a hex sha256',
              }),
            }),
          },
        },
      },
      async (_context, request, response): Promise<IKibanaResponse> => {
        try {
          return response.ok({
            body: await lookupPriorRunsInSpace(
              getClient(request),
              request.params.sha256,
              spaceIdFromRequest(request)
            ),
          });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  router.versioned
    .post({
      access: 'internal',
      path: DETONATE_SUBMIT_FILE_PATH,
      security: DETONATE_ROUTE_SECURITY,
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
          if (!(await hasDetonatePrivilege(request, 'write'))) {
            return response.forbidden({
              body: {
                message:
                  'Submitting a sample for detonation requires the Security Solution write privilege or the Detonate privilege.',
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

          const client = getClient(request);
          const task = await submitInSpace<DetonateFileRequest>(
            (scoped) => client.submitFile(scoped, { filename: sampleFilename, body }),
            { ...options, sample_filename: sampleFilename },
            spaceIdFromRequest(request)
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
      security: DETONATE_ROUTE_SECURITY,
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
          if (!(await hasDetonatePrivilege(request, 'write'))) {
            return response.forbidden({
              body: {
                message:
                  'Submitting a sample for detonation requires the Security Solution write privilege or the Detonate privilege.',
              },
            });
          }

          const client = getClient(request);
          const task = await submitInSpace(
            (scoped) => client.submitHash(scoped),
            request.body,
            spaceIdFromRequest(request)
          );
          return response.ok<DetonateTask>({ body: task });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  router.versioned
    .get({
      access: 'internal',
      path: `${DETONATE_TASKS_PATH}/{taskId}`,
      security: DETONATE_ROUTE_SECURITY,
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
            body: await getTaskInSpace(
              getClient(request),
              request.params.taskId,
              spaceIdFromRequest(request)
            ),
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
      security: DETONATE_ROUTE_SECURITY,
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
          const client = getClient(request);
          await getTaskInSpace(client, request.params.taskId, spaceIdFromRequest(request));
          return response.ok({ body: await client.getTaskUpdates(request.params.taskId) });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  router.versioned
    .get({
      access: 'internal',
      path: `${DETONATE_RUNS_PATH}/{id}/record`,
      security: DETONATE_RECORD_ROUTE_SECURITY,
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({ id: schema.string({ minLength: 1, maxLength: 128 }) }),
          },
        },
      },
      async (_context, request, response): Promise<IKibanaResponse> => {
        try {
          const client = getClient(request);
          const task = await getTaskInSpace(client, request.params.id, spaceIdFromRequest(request));
          // Both reads are best-effort: the record stays useful without a duration or IOCs.
          const [updates, iocs] = await Promise.all([
            client.getTaskUpdates(task.id).catch((error) => {
              logger.debug(`Detonation ${task.id}: could not read updates: ${error}`);
              return [];
            }),
            readTaskIocs(
              task,
              (kind) => client.getTaskAlerts(task.id, kind, IOC_ALERT_READ_LIMIT),
              (kind, reason) =>
                logger.debug(`Detonation ${task.id}: could not read ${kind}: ${reason}`)
            ),
          ]);
          return response.ok<DetonationRecord>({
            body: toDetonationRecord(task, { updates, iocs }),
          });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  /** Copies a run's sandbox alerts into this space's sandbox stream; safe to repeat. */
  router.versioned
    .post({
      access: 'internal',
      path: `${DETONATE_RUNS_PATH}/{id}/ingest`,
      security: DETONATE_ROUTE_SECURITY,
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({ id: schema.string({ minLength: 1, maxLength: 128 }) }),
          },
        },
      },
      async (_context, request, response): Promise<IKibanaResponse> => {
        try {
          if (!(await hasDetonatePrivilege(request, 'write'))) {
            return response.forbidden({
              body: {
                message:
                  'Copying sandbox alerts requires the Security Solution write privilege or the Detonate privilege.',
              },
            });
          }

          const client = getClient(request);
          const spaceId = spaceIdFromRequest(request);
          const task = await getTaskInSpace(client, request.params.id, spaceId);
          const stream = detonateSandboxStreamName(spaceId);
          const { docs, failedKinds } = await readTaskAlerts(
            task,
            (kind) => client.getTaskAlerts(task.id, kind, DETONATE_MAX_ALERT_DOCS),
            (kind, reason) =>
              logger.debug(`Detonation ${task.id}: could not read ${kind}: ${reason}`)
          );

          const esClient = await getInternalEsClient();
          await ensureSandboxTemplate(esClient);
          const counts = await ingestSandboxDocs(esClient, stream, task, docs);

          return response.ok<DetonateSandboxIngestResult>({
            body: { task_id: task.id, stream, ...counts, unread_kinds: failedKinds },
          });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  /**
   * Every submission from this space this UTC month counts, whoever started it. Reputation hits
   * never submit, so they never count. A batch checks once, so it can overshoot by its size.
   */
  router.versioned
    .get({
      access: 'internal',
      path: DETONATE_USAGE_PATH,
      security: DETONATE_RECORD_ROUTE_SECURITY,
    })
    .addVersion({ version: '1', validate: false }, async (_context, request, response) => {
      try {
        const window = detonateAllowanceWindow(now());
        const { count, truncated } = await countRunsInSpaceSince(
          getClient(request),
          spaceIdFromRequest(request),
          window.since
        );
        return response.ok<DetonateUsage>({
          body: { used: count, allowance: monthlyAllowance, ...window, truncated },
        });
      } catch (error) {
        return toErrorResponse(error, response);
      }
    });

  router.versioned
    .get({
      access: 'internal',
      path: `${DETONATE_TASKS_PATH}/{taskId}/alerts`,
      security: DETONATE_ROUTE_SECURITY,
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({ taskId: schema.string({ minLength: 1, maxLength: 128 }) }),
            query: schema.object({
              kind: schema.oneOf([
                schema.literal('production-endpoint-alerts'),
                schema.literal('diagnostic-endpoint-alerts'),
                schema.literal('production-detection-alerts'),
              ]),
              limit: schema.number({ min: 1, max: DETONATE_MAX_ALERT_DOCS, defaultValue: 500 }),
            }),
          },
        },
      },
      async (_context, request, response): Promise<IKibanaResponse> => {
        try {
          const client = getClient(request);
          await getTaskInSpace(client, request.params.taskId, spaceIdFromRequest(request));
          return response.ok({
            body: await client.getTaskAlerts(
              request.params.taskId,
              request.query.kind,
              request.query.limit
            ),
          });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  router.versioned
    .get({
      access: 'internal',
      path: DETONATE_TASKS_PATH,
      security: DETONATE_ROUTE_SECURITY,
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
          return response.ok({
            body: await listTasksInSpace(
              getClient(request),
              spaceIdFromRequest(request),
              request.query
            ),
          });
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
      security: DETONATE_ROUTE_SECURITY,
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
            body: await listTasksInSpace(
              getClient(request),
              spaceIdFromRequest(request),
              {},
              {
                alertId: request.params.alertId,
              }
            ),
          });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );
};

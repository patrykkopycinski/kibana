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
import type { TypeOf } from '@kbn/config-schema';
import type {
  ElasticsearchClient,
  IKibanaResponse,
  KibanaRequest,
  KibanaResponseFactory,
  Logger,
} from '@kbn/core/server';
import type { Readable } from 'stream';
import { DETONATE_API_ACTION_ALL } from '@kbn/security-solution-features/actions';
import {
  ALERTZERO_API_PRIVILEGE_READ,
  ALERTZERO_API_PRIVILEGE_WRITE,
} from '@kbn/alertzero-plugin/common/constants';

import {
  alertRunTag,
  DETONATE_HANDOFF_MARKERS,
  DETONATE_HANDOFFS_PATH,
  DETONATE_HEALTHCHECK_PATH,
  DETONATE_MAX_ALERT_DOCS,
  DETONATE_PRIOR_RUNS_LOOKBACK,
  DETONATE_PRIOR_RUNS_PATH,
  DETONATE_PROCESS_EVENTS_KIND,
  DETONATE_RUNS_PATH,
  DETONATE_SUBMIT_FILE_PATH,
  DETONATE_SUBMIT_HASH_PATH,
  DETONATE_TASKS_PATH,
  DETONATE_ALERT_OUTCOMES_PATH,
  DETONATE_DECISIONS_PATH,
  DETONATE_USAGE_PATH,
  detonateAllowanceWindow,
  detonateSandboxStreamName,
  deriveDetonateVerdict,
  diffCategoryCounts,
  isDetonationComplete,
  runBelongsToSpace,
  spaceTaskQuery,
} from '../../../common/detonate_prototype';
import type {
  DetonateAlertDoc,
  DetonateAlertOutcomes,
  DetonateDecisionWrite,
  DetonateFileRequest,
  DetonateHandoffList,
  DetonateHandoffUpdate,
  DetonateRunDiffEmpty,
  DetonateRunDiffResult,
  DetonateRunSessionResult,
  DetonateSandboxCountResult,
  DetonateSandboxIngestResult,
  DetonateTask,
  DetonateUsage,
} from '../../../common/detonate_prototype';
import { DEFAULT_INDEX_KEY } from '../../../common/constants';
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
import type { EnsureResultsIndex, RecordRun } from '../results_store';
import { createResultsIndexEnsurer, getAlertOutcomes, writeAlertDecisions } from '../results_store';
import {
  IOC_ALERT_READ_LIMIT,
  alertDocSource,
  readField,
  readTaskAlerts,
  readTaskIocs,
} from '../ioc_extraction';
import { categoryCountsForRun, countsByCategory } from '../behavior_diff';
import { ingestSandboxDocs, installSandboxTemplate } from '../sandbox_ingest';
import {
  assertReadableAlertTags,
  assertReadableAlerts,
  listHandoffRuns,
  setRunHandoffMarkers,
} from '../handoffs';
import { buildDetonateCountQueries, validateSandboxCountRuleQuery } from '../esql_draft_guard';
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
 * Setting handoff markers is a Worker write. `securitySolution` is left out on purpose: the Security
 * read feature grants that API tag, and a read-only analyst must not mark alerts handled.
 */
export const DETONATE_HANDOFF_WRITE_ROUTE_SECURITY = {
  authz: {
    requiredPrivileges: [{ anyRequired: [DETONATE_API_ACTION_ALL, ALERTZERO_API_PRIVILEGE_WRITE] }],
  },
};

/**
 * A sandbox count runs caller-chosen WHERE/EVAL predicates as the internal
 * user against the sandbox stream: a write-tier capability, so it needs the
 * same privileges as a handoff write and no `securitySolution` read tag.
 */
export const DETONATE_SANDBOX_COUNT_ROUTE_SECURITY = DETONATE_HANDOFF_WRITE_ROUTE_SECURITY;

/** `DETONATE_HANDOFF_MARKERS`, spelled out so the body type stays the marker union. */
const handoffMarkerSchema = schema.oneOf([
  schema.literal('detonate:hunt-requested'),
  schema.literal('detonate:hunt-done'),
  schema.literal('detonate:coverage-requested'),
  schema.literal('detonate:coverage-reviewed'),
  schema.literal('detonate:coverage-in-progress'),
]);

/** `DETONATE_DECISION_STATES`, spelled out so the body type stays the state union. */
const decisionStateSchema = schema.oneOf([
  schema.literal('queued'),
  schema.literal('running'),
  schema.literal('released'),
  schema.literal('verdict_applied'),
  schema.literal('known_malicious'),
  schema.literal('skipped'),
  schema.literal('not_eligible'),
]);

/** `DETONATE_VERDICTS`, spelled out for the same reason. */
const verdictSchema = schema.oneOf([
  schema.literal('malicious'),
  schema.literal('benign'),
  schema.literal('inconclusive'),
]);

const handoffMarkerListSchema = schema.maybe(
  schema.arrayOf(handoffMarkerSchema, { maxSize: DETONATE_HANDOFF_MARKERS.length })
);

/**
 * A detonation sample is a malware binary. It is capped well below Kibana's
 * default payload ceiling: this prototype submits samples, it is not a file
 * transfer service.
 */
const MAX_SAMPLE_BYTES = 32 * 1024 * 1024;

/**
 * Where the submit came from. Kept in Kibana's results index and stripped before
 * the service call. The submitter is the authenticated user, never a field here.
 */
const originSchema = schema.object({
  source: schema.maybe(
    schema.oneOf([
      schema.literal('alert_flyout'),
      schema.literal('detonate_page'),
      schema.literal('workflow'),
      schema.literal('agent'),
    ])
  ),
  alert_ids: schema.maybe(schema.arrayOf(schema.string({ maxLength: 128 }), { maxSize: 32 })),
  host_name: schema.maybe(schema.string({ maxLength: 256 })),
  user_name: schema.maybe(schema.string({ maxLength: 256 })),
  file_path: schema.maybe(schema.string({ maxLength: 4096 })),
  workflow_execution_id: schema.maybe(schema.string({ maxLength: 128 })),
  conversation_id: schema.maybe(schema.string({ maxLength: 128 })),
});

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
  origin: schema.maybe(originSchema),
};

const submitOptionsObjectSchema = schema.object(submitOptionsSchema);

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
  /** Writes each run's results document; shared with the agent tool so one process has one template cache. */
  recordRun: RecordRun;
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
  /**
   * The caller's own client with the space's project routing, so an alert id a
   * workflow read from a linked project is checked where it lives. Not the
   * request-context client, which is origin-only under CPS.
   */
  getScopedEsClient: (request: KibanaRequest) => Promise<ElasticsearchClient>;
  /** Installs the results template and mapping before a decision write; one per process by default. */
  ensureResultsIndex?: EnsureResultsIndex;
  /** Injected so tests can pin the month. */
  now?: () => Date;
}

/**
 * `origin.alert_ids` is stored on the run and later drives alert tagging just
 * like `alert:<id>` tags, so it gets the same readable-alert check.
 */
const tagsWithOriginAlerts = (
  tags: readonly string[] | undefined,
  origin: { alert_ids?: readonly string[] } | undefined
): string[] => [...(tags ?? []), ...(origin?.alert_ids ?? []).map(alertRunTag)];

const MAX_MIME_TYPE_LENGTH = 255;
const MIME_TYPE_SHAPE = /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/;
const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/;

/**
 * The part's own `Content-Type`, which hapi keeps on the stream it hands over.
 * It is client-supplied and stored, so only a bounded `type/subtype` survives;
 * parameters such as `; charset=` are dropped.
 */
const sampleMimeType = (sampleFile: unknown): string | undefined => {
  const contentType = (sampleFile as { hapi?: { headers?: Record<string, unknown> } }).hapi
    ?.headers?.['content-type'];
  if (typeof contentType !== 'string') return undefined;
  const mimeType = contentType.split(';')[0].trim().slice(0, MAX_MIME_TYPE_LENGTH);
  return MIME_TYPE_SHAPE.test(mimeType) ? mimeType : undefined;
};

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
  recordRun,
  hasDetonatePrivilege,
  monthlyAllowance,
  getInternalEsClient,
  getScopedEsClient,
  ensureResultsIndex = createResultsIndexEnsurer(),
  now = () => new Date(),
}: DetonateRoutesDeps) => {
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

  /**
   * ES|QL's "unknown index" failure for exactly this space's sandbox stream:
   * the zero-doc state of a space whose first ingest has not run yet. Anything
   * else — another index name, another error type — is a real failure.
   */
  const isMissingSandboxStreamError = (error: unknown, spaceId: string): boolean => {
    if (!(error instanceof Error) || error.name !== 'ResponseError') return false;
    // ResponseError.message is just the ES error type (e.g.
    // "verification_exception"); the index names live in reason / root_cause.
    const errorBody = (error as { meta?: { body?: { error?: unknown } } }).meta?.body?.error;
    if (typeof errorBody !== 'object' || errorBody === null) return false;
    const {
      type,
      reason,
      root_cause: rootCause,
    } = errorBody as {
      type?: unknown;
      reason?: unknown;
      root_cause?: { reason?: unknown }[];
    };
    const namesTheStream = [
      ...(typeof reason === 'string' ? [reason] : []),
      ...(rootCause ?? []).map((cause) => (typeof cause.reason === 'string' ? cause.reason : '')),
    ];
    return (
      (type === 'verification_exception' || error.message.includes('verification_exception')) &&
      namesTheStream.some((r) => r.includes(detonateSandboxStreamName(spaceId)))
    );
  };

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
      async (context, request, response): Promise<IKibanaResponse> => {
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

          let options: TypeOf<typeof submitOptionsObjectSchema> = {};
          if (request.body.request_json) {
            try {
              options = JSON.parse(request.body.request_json);
            } catch {
              return response.badRequest({
                body: { message: '`request_json` is not valid JSON.' },
              });
            }
            try {
              options = submitOptionsObjectSchema.validate(options);
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

          const spaceId = spaceIdFromRequest(request);
          // Origin-only under CPS: the handoff write lands on this project's alerts index.
          await assertReadableAlertTags({
            esClient: (await context.core).elasticsearch.client.asCurrentUser,
            spaceId,
            tags: tagsWithOriginAlerts(options.tags, options.origin),
          });

          const { origin, ...serviceOptions } = options;
          const client = getClient(request);
          const task = await submitInSpace<DetonateFileRequest>(
            (scoped) => client.submitFile(scoped, { filename: sampleFilename, body }),
            { ...serviceOptions, sample_filename: sampleFilename },
            spaceId
          );

          // Not awaited: every later write merges into the same document, so
          // nothing a caller does next depends on this one having landed.
          void recordRun(spaceId, () =>
            toDetonationRecord(task, {
              spaceId,
              origin: {
                ...origin,
                submitter: endpointAppContextService.getCurrentUsername(request),
                file: {
                  size: body.length,
                  mime_type: sampleMimeType(sampleFile),
                },
              },
            })
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
      async (context, request, response): Promise<IKibanaResponse> => {
        try {
          if (!(await hasDetonatePrivilege(request, 'write'))) {
            return response.forbidden({
              body: {
                message:
                  'Submitting a sample for detonation requires the Security Solution write privilege or the Detonate privilege.',
              },
            });
          }

          const spaceId = spaceIdFromRequest(request);
          // Origin-only under CPS: the handoff write lands on this project's alerts index.
          await assertReadableAlertTags({
            esClient: (await context.core).elasticsearch.client.asCurrentUser,
            spaceId,
            tags: tagsWithOriginAlerts(request.body.tags, request.body.origin),
          });

          const { origin, ...serviceBody } = request.body;
          const client = getClient(request);
          const task = await submitInSpace(
            (scoped) => client.submitHash(scoped),
            serviceBody,
            spaceId
          );
          void recordRun(spaceId, () =>
            toDetonationRecord(task, {
              spaceId,
              origin: {
                ...origin,
                submitter: endpointAppContextService.getCurrentUsername(request),
              },
            })
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
          const spaceId = spaceIdFromRequest(request);
          const task = await getTaskInSpace(getClient(request), request.params.taskId, spaceId);
          // Every poll writes: the UI and the workflow poll until the run ends, and
          // Elasticsearch skips the write when the document did not change.
          void recordRun(spaceId, () => toDetonationRecord(task, { spaceId }));
          return response.ok<DetonateTask>({ body: task });
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
          const spaceId = spaceIdFromRequest(request);
          const task = await getTaskInSpace(client, request.params.id, spaceId);
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
          const record = toDetonationRecord(task, { updates, iocs });
          void recordRun(spaceId, () => toDetonationRecord(task, { updates, iocs, spaceId }));
          return response.ok<DetonationRecord>({ body: record });
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
   * Session View config for one run (N1). Copies the run's process events
   * into the space's sandbox stream (idempotent) and returns the config the
   * detonation flyout's Session tab renders: the stream as the index, the
   * run's entry leader as the tree root, and the earliest event as the
   * time-range floor. A run without recorded events is a null-shaped result,
   * not an error — the tab renders its empty state.
   */
  router.versioned
    .get({
      access: 'internal',
      path: `${DETONATE_RUNS_PATH}/{id}/session`,
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
          if (!(await hasDetonatePrivilege(request, 'read'))) {
            return response.forbidden({
              body: {
                message:
                  'Viewing a run session requires the Security Solution read privilege or the Detonate privilege.',
              },
            });
          }

          const client = getClient(request);
          const spaceId = spaceIdFromRequest(request);
          const task = await getTaskInSpace(client, request.params.id, spaceId);
          const stream = detonateSandboxStreamName(spaceId);

          // Events ride the same read as the alert kinds; a 404 until the
          // agent enrolls means "not yet", same as alerts.
          let events: Array<Record<string, unknown>> = [];
          try {
            events = await client.getTaskProcessEvents(task.id, DETONATE_MAX_ALERT_DOCS);
          } catch (error) {
            logger.debug(`Detonation ${task.id}: could not read process events: ${error}`);
          }

          const counts = { ingested: 0, duplicates: 0, dropped: 0, failed: 0 };
          if (events.length > 0) {
            const esClient = await getInternalEsClient();
            await ensureSandboxTemplate(esClient);
            const result = await ingestSandboxDocs(
              esClient,
              stream,
              task,
              events.map((doc) => ({ kind: DETONATE_PROCESS_EVENTS_KIND, doc }))
            );
            Object.assign(counts, result);
          }

          // The tree root is the entry leader shared by the run's events;
          // the time floor is the earliest event of the run.
          const firstStringField = (
            docs: Array<Record<string, unknown>>,
            path: string
          ): string | undefined => {
            for (const doc of docs) {
              const value = readField(alertDocSource(doc as DetonateAlertDoc), path)[0];
              if (typeof value === 'string') return value;
            }
            return undefined;
          };
          const sessionEntityId = firstStringField(events, 'process.entry_leader.entity_id');
          const sessionStartTime = firstStringField(events, '@timestamp');

          return response.ok<DetonateRunSessionResult>({
            body: {
              task_id: task.id,
              index: stream,
              ...(sessionEntityId ? { session_entity_id: sessionEntityId } : {}),
              ...(sessionStartTime ? { session_start_time: sessionStartTime } : {}),
              ...counts,
            },
          });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  /**
   * Behavior diff between two runs of the same sample (N2). Copies both runs'
   * alerts and events into the space's sandbox stream (idempotent, same as
   * /session and /ingest), then answers one ES|QL per run: per-category doc
   * counts, union-diffed server-side. `against` omitted: the most recent
   * earlier completed run of the same hash in this space; a first run answers
   * a null-shaped `{ reason: 'no-prior-run' }`, not a zero-delta fabrication.
   */
  router.versioned
    .get({
      access: 'internal',
      path: `${DETONATE_RUNS_PATH}/{id}/diff`,
      security: DETONATE_ROUTE_SECURITY,
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({ id: schema.string({ minLength: 1, maxLength: 128 }) }),
            query: schema.object({
              against: schema.maybe(schema.string({ minLength: 1, maxLength: 128 })),
            }),
          },
        },
      },
      async (_context, request, response): Promise<IKibanaResponse> => {
        try {
          if (!(await hasDetonatePrivilege(request, 'read'))) {
            return response.forbidden({
              body: {
                message:
                  'Viewing a run diff requires the Security Solution read privilege or the Detonate privilege.',
              },
            });
          }

          const client = getClient(request);
          const spaceId = spaceIdFromRequest(request);
          const task = await getTaskInSpace(client, request.params.id, spaceId);
          const hash = task.sample_hash?.toLowerCase();

          // Default baseline: the newest earlier completed run of the same
          // hash in this space. Caller-chosen `against` wins, and its fitness
          // is reported through `comparable`, not silently swapped.
          let againstTask: DetonateTask | undefined;
          let comparable = true;
          if (request.query.against) {
            againstTask = await getTaskInSpace(client, request.query.against, spaceId);
            comparable =
              hash !== undefined &&
              againstTask.sample_hash?.toLowerCase() === hash &&
              againstTask.id !== task.id;
          } else if (hash) {
            const { tasks } = await client.listTasks({
              query_string: spaceTaskQuery(spaceId, { sampleHash: hash }),
              size: DETONATE_PRIOR_RUNS_LOOKBACK,
              order: 'desc',
            });
            // "Previous run" means earlier: a same-hash run submitted after
            // this one must not become the baseline. Equal timestamps still
            // count (the service clock and submit order can tie).
            const createdAt = Date.parse(task.created_at);
            againstTask = tasks.find(
              (prior) =>
                prior.id !== task.id &&
                runBelongsToSpace(prior.tags, spaceId) &&
                prior.sample_hash?.toLowerCase() === hash &&
                isDetonationComplete(prior) &&
                Date.parse(prior.created_at) <= createdAt
            );
          }

          if (!againstTask) {
            return response.ok<DetonateRunDiffEmpty>({
              body: { task_id: task.id, reason: 'no-prior-run' },
            });
          }

          // Both runs' telemetry must be in the stream or the diff answers
          // against absence: copy first, idempotently, exactly like /session.
          const stream = detonateSandboxStreamName(spaceId);
          const esClient = await getInternalEsClient();
          await ensureSandboxTemplate(esClient);
          for (const run of [task, againstTask]) {
            const { docs } = await readTaskAlerts(
              run,
              (kind) => client.getTaskAlerts(run.id, kind, DETONATE_MAX_ALERT_DOCS),
              (kind, reason) =>
                logger.debug(`Detonation ${run.id}: could not read ${kind}: ${reason}`)
            );
            let events: Array<Record<string, unknown>> = [];
            try {
              events = await client.getTaskProcessEvents(run.id, DETONATE_MAX_ALERT_DOCS);
            } catch (error) {
              logger.debug(`Detonation ${run.id}: could not read process events: ${error}`);
            }
            await ingestSandboxDocs(esClient, stream, run, [
              ...docs,
              ...events.map((doc) => ({ kind: DETONATE_PROCESS_EVENTS_KIND, doc })),
            ]);
          }

          // The copies above land in bulk's refresh interval, but the ES|QL
          // below must see them in this same request: a run diffed seconds
          // after completing would otherwise answer zero categories for its
          // own just-copied telemetry. Refresh is idempotent and cheap; a
          // failure is the stream's failure and flows to the same error path.
          try {
            await esClient.indices.refresh({ index: stream });
          } catch (error) {
            logger.debug(`Detonate stream ${stream}: refresh before diff: ${error}`);
          }

          const [currentCounts, priorCounts] = await Promise.all([
            categoryCountsForRun(esClient, stream, task.id),
            categoryCountsForRun(esClient, stream, againstTask.id),
          ]);
          const current = countsByCategory(currentCounts);
          const prior = countsByCategory(priorCounts);

          return response.ok<DetonateRunDiffResult>({
            body: {
              task_id: task.id,
              against_task_id: againstTask.id,
              comparable,
              current: {
                task_id: task.id,
                verdict: deriveDetonateVerdict(task).verdict,
                categories: currentCounts,
              },
              prior: {
                task_id: againstTask.id,
                verdict: deriveDetonateVerdict(againstTask).verdict,
                categories: priorCounts,
              },
              delta: diffCategoryCounts(current, prior),
            },
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

  /** The runs whose alerts wait for the Hunt or the Detection Worker in this space. */
  router.versioned
    .get({
      access: 'internal',
      path: DETONATE_HANDOFFS_PATH,
      // The list searches every alert in the space as the internal user, so it
      // is a Worker capability like the marker write, not an AlertZero read.
      security: DETONATE_HANDOFF_WRITE_ROUTE_SECURITY,
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            query: schema.object({
              marker: schema.oneOf([schema.literal('hunt'), schema.literal('coverage')]),
            }),
          },
        },
      },
      async (_context, request, response): Promise<IKibanaResponse> => {
        try {
          const handoffs = await listHandoffRuns({
            esClient: await getInternalEsClient(),
            spaceId: spaceIdFromRequest(request),
            kind: request.query.marker,
          });
          return response.ok<DetonateHandoffList>({ body: { handoffs } });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  /** Sets or clears the handoff markers on this run's results document. */
  router.versioned
    .post({
      access: 'internal',
      path: `${DETONATE_RUNS_PATH}/{id}/handoff`,
      security: DETONATE_HANDOFF_WRITE_ROUTE_SECURITY,
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({ id: schema.string({ minLength: 1, maxLength: 128 }) }),
            body: schema.object(
              { add: handoffMarkerListSchema, remove: handoffMarkerListSchema },
              {
                validate: ({ add = [], remove = [] }) =>
                  add.length + remove.length === 0
                    ? 'Name at least one marker to add or remove.'
                    : undefined,
              }
            ),
          },
        },
      },
      async (_context, request, response): Promise<IKibanaResponse> => {
        try {
          const updated = await setRunHandoffMarkers({
            esClient: await getInternalEsClient(),
            spaceId: spaceIdFromRequest(request),
            taskId: request.params.id,
            add: request.body.add ?? [],
            remove: request.body.remove ?? [],
          });
          return response.ok<DetonateHandoffUpdate>({ body: { updated } });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  /**
   * Records per-alert decisions in the results index. The internal user writes
   * them, so the caller must already be able to read every alert named: the
   * production alert itself is never touched.
   */
  router.versioned
    .post({
      access: 'internal',
      path: DETONATE_DECISIONS_PATH,
      security: DETONATE_HANDOFF_WRITE_ROUTE_SECURITY,
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: schema.object({
              decisions: schema.arrayOf(
                schema.object(
                  {
                    alert_id: schema.string({ minLength: 1, maxLength: 128 }),
                    state: decisionStateSchema,
                    verdict: schema.maybe(verdictSchema),
                    task_id: schema.maybe(schema.string({ minLength: 1, maxLength: 128 })),
                    execution_id: schema.maybe(schema.string({ minLength: 1, maxLength: 128 })),
                    sha256: schema.maybe(
                      schema.string({
                        maxLength: 64,
                        validate: (value) =>
                          SHA256_PATTERN.test(value)
                            ? undefined
                            : 'expected a 64-character hexadecimal SHA-256',
                      })
                    ),
                    reason: schema.maybe(schema.string({ minLength: 1, maxLength: 256 })),
                  },
                  {
                    validate: ({ state, verdict }) =>
                      state === 'verdict_applied' && verdict === undefined
                        ? 'a verdict_applied decision requires a verdict'
                        : undefined,
                  }
                ),
                { minSize: 1, maxSize: 100 }
              ),
            }),
          },
        },
      },
      async (context, request, response): Promise<IKibanaResponse> => {
        try {
          const spaceId = spaceIdFromRequest(request);
          const { decisions } = request.body;
          await assertReadableAlerts({
            esClient: await getScopedEsClient(request),
            spaceId,
            alertIds: [...new Set(decisions.map(({ alert_id: alertId }) => alertId))],
          });

          const esClient = await getInternalEsClient();
          await ensureResultsIndex(esClient, spaceId);
          const written = await writeAlertDecisions(
            esClient,
            spaceId,
            decisions.map((decision) => ({
              alertId: decision.alert_id,
              state: decision.state,
              verdict: decision.verdict,
              taskId: decision.task_id,
              executionId: decision.execution_id,
              sha256: decision.sha256,
              reason: decision.reason,
            })),
            now()
          );
          return response.ok<DetonateDecisionWrite>({ body: { written } });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  /**
   * Which of a batch of alerts a sweep must leave alone, and why. Read-only; it
   * sits behind the write-tier privilege because it exposes per-alert verdicts
   * and only workflows call it.
   */
  router.versioned
    .post({
      access: 'internal',
      path: DETONATE_ALERT_OUTCOMES_PATH,
      security: DETONATE_HANDOFF_WRITE_ROUTE_SECURITY,
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: schema.object(
              {
                // Ids alone cannot match a finished run of a sibling alert; the
                // sweeps that know each alert's sample hash send `alerts`. The
                // hash is read off a keyword field a rule or a third party can
                // fill with anything, so it is checked in the handler: a bad one
                // costs that alert its hash, never the whole batch.
                alert_ids: schema.maybe(
                  schema.arrayOf(schema.string({ minLength: 1, maxLength: 128 }), {
                    minSize: 1,
                    maxSize: 200,
                  })
                ),
                alerts: schema.maybe(
                  schema.arrayOf(
                    schema.object({
                      alert_id: schema.string({ minLength: 1, maxLength: 128 }),
                      sha256: schema.maybe(schema.string({ maxLength: 256 })),
                    }),
                    { minSize: 1, maxSize: 200 }
                  )
                ),
              },
              {
                validate: ({ alert_ids: alertIds = [], alerts = [] }) =>
                  alertIds.length + alerts.length === 0 || alertIds.length + alerts.length > 200
                    ? 'expected between 1 and 200 alerts across alert_ids and alerts'
                    : undefined,
              }
            ),
          },
        },
      },
      async (_context, request, response): Promise<IKibanaResponse> => {
        try {
          const outcomes = await getAlertOutcomes(
            await getInternalEsClient(),
            spaceIdFromRequest(request),
            [
              ...(request.body.alert_ids ?? []).map((alertId) => ({ alertId })),
              ...(request.body.alerts ?? []).map(({ alert_id: alertId, sha256 }) => ({
                alertId,
                sha256: sha256 !== undefined && SHA256_PATTERN.test(sha256) ? sha256 : undefined,
              })),
            ],
            now().getTime()
          );
          return response.ok<DetonateAlertOutcomes>({
            body: { outcomes: Object.fromEntries(outcomes) },
          });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

  /**
   * Sandbox-match count for the Detection Worker (P2.3). The caller sends
   * only the validated stored-rule query; this route re-runs the full P2.2
   * guard against the request space's default index, applies the command
   * allow-list, builds the sandbox variant itself (fresh FROM on the space's
   * sandbox stream, `WHERE detonate.task_id == <path id>`, LIMIT dropped,
   * count appended, re-parsed and asserted) and runs it as the internal user.
   * Nothing the caller sends can change the task filter or the source.
   */
  router.versioned
    .post({
      access: 'internal',
      path: `${DETONATE_RUNS_PATH}/{id}/sandbox_count`,
      security: DETONATE_SANDBOX_COUNT_ROUTE_SECURITY,
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({ id: schema.string({ minLength: 1, maxLength: 128 }) }),
            body: schema.object({
              rule_query: schema.string({ minLength: 1, maxLength: 10_000 }),
            }),
          },
        },
      },
      async (context, request, response): Promise<IKibanaResponse> => {
        try {
          const client = getClient(request);
          const spaceId = spaceIdFromRequest(request);
          await getTaskInSpace(client, request.params.id, spaceId);

          const defaultIndex = await (
            await context.core
          ).uiSettings.client.get<string[]>(DEFAULT_INDEX_KEY);

          const guard = validateSandboxCountRuleQuery(request.body.rule_query, defaultIndex);
          if (!guard.ok) {
            return response.badRequest({ body: { message: guard.reason } });
          }

          const { sandbox_query: sandboxQuery } = buildDetonateCountQueries(
            request.body.rule_query,
            request.params.id,
            spaceId
          );

          const esClient = await getInternalEsClient();
          // The ES client answers `esql.query` with `{columns, values}` — one
          // row of one value for `STATS c = COUNT(*)`.
          let values: unknown[][] | undefined;
          try {
            ({ values } = await esClient.esql.query({
              query: sandboxQuery,
              format: 'json',
            }));
          } catch (error) {
            // A space's sandbox stream is created by its first ingest, so a
            // missing stream is the normal zero-doc state, not a failure.
            // Only the exact-name miss counts as zero; any other verification
            // error (a builder bug surfacing another index) still 500s.
            if (isMissingSandboxStreamError(error, spaceId)) {
              values = [[0]];
            } else {
              throw error;
            }
          }
          const count = Number(values?.[0]?.[0] ?? 0);

          return response.ok<DetonateSandboxCountResult>({ body: { count } });
        } catch (error) {
          return toErrorResponse(error, response);
        }
      }
    );

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

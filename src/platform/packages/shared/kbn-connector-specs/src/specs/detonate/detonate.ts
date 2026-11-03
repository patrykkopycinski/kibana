/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Detonate connector: submit a sample (hash, file, URL, or commands) to a
 * malware detonation service, then read the run's progress, logs, and alerts.
 *
 * The service base URL is connector configuration and the API key is a
 * connector secret, so no deployment-specific host appears in this source.
 */

import { i18n } from '@kbn/i18n';
import { z, lazySchema } from '@kbn/zod/v4';
import type { AxiosError } from 'axios';
import type { ActionContext, ConnectorSpec } from '../../connector_spec';
import { UISchemas } from '../../connector_spec';

const API_PREFIX = '/v1/detonate';

const MAX_FILENAME_LENGTH = 512;
/** Base64 of a 10 MiB sample; larger samples belong on a streamed upload path. */
const MAX_FILE_BASE64_LENGTH = 4 * Math.ceil((10 * 1024 * 1024) / 3);
const MAX_URL_LENGTH = 2083;
const MAX_TAGS = 32;
const MAX_TAG_LENGTH = 256;
const MAX_COMMANDS = 64;
const MAX_COMMAND_LENGTH = 4096;
const MAX_GLOBS = 32;
const MAX_TASK_PAGE_SIZE = 200;
const MAX_ALERTS = 5000;
const MAX_ALERT_GROUPS = 500;
/** Logs are bucket-backed text; cap what a caller pulls into memory. */
const MAX_LOG_CHARS = 200_000;
/** The service runs a VM for at most 15 minutes, so a longer observation window cannot complete. */
const MAX_EXEC_WAIT_SECS = 900;

/**
 * The service returns the whole task record, including the Fleet enrollment
 * token its sandbox agent enrolls with. It must never reach a workflow step,
 * a model, or a UI, so every task-shaped response is redacted here.
 */
const REDACTED_TASK_FIELDS = ['agent_fleet_enrollment_token'] as const;

const ALERT_SOURCES = {
  production_endpoint: 'production-endpoint-alerts',
  diagnostic_endpoint: 'diagnostic-endpoint-alerts',
  production_detection: 'production-detection-alerts',
} as const;
type AlertSource = keyof typeof ALERT_SOURCES;
const ALERT_SOURCE_KEYS = Object.keys(ALERT_SOURCES) as [AlertSource, ...AlertSource[]];

const LOG_PATHS = { script: 'script-log', exec: 'exec-log' } as const;
type LogType = keyof typeof LOG_PATHS;

interface DetonateConfig {
  url?: string;
}

const getBaseUrl = (ctx: ActionContext): string => {
  const url = ((ctx.config as DetonateConfig | undefined)?.url ?? '').trim();
  if (!url) {
    throw new Error('Detonate connector is missing the required URL configuration field.');
  }
  return `${url.replace(/\/+$/, '')}${API_PREFIX}`;
};

const taskPath = (ctx: ActionContext, taskId: string, suffix = ''): string =>
  `${getBaseUrl(ctx)}/tasks/${encodeURIComponent(taskId)}${suffix}`;

type ErrorBody = { message?: string; detail?: unknown } | string;

const describeErrorBody = (data: ErrorBody | undefined): string | undefined => {
  if (data === undefined || data === null) return undefined;
  if (typeof data === 'string') return data.slice(0, 500);
  if (data.message) return data.message;
  if (typeof data.detail === 'string') return data.detail;
  // FastAPI validation errors carry `detail` as a list of field errors.
  if (data.detail !== undefined) return JSON.stringify(data.detail).slice(0, 500);
  return undefined;
};

/**
 * The status code leads the message in a fixed shape so a server-side caller,
 * which only receives the message back from the actions framework, can still
 * tell a 404 (unknown or not-yet-indexed task) or 422 (rejected request) from
 * an outage.
 */
const formatDetonateError = (action: string, error: unknown): Error => {
  const { response } = error as AxiosError<ErrorBody>;
  const detail =
    describeErrorBody(response?.data) ?? (error instanceof Error ? error.message : String(error));
  return new Error(
    `Detonate ${action} failed (status ${response?.status ?? 'unknown'}): ${detail}`
  );
};

type TaskRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is TaskRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const redactTask = <T>(task: T): T => {
  if (!isRecord(task)) return task;
  const copy: TaskRecord = { ...task };
  for (const field of REDACTED_TASK_FIELDS) delete copy[field];
  return copy as T;
};

const redactTaskList = (data: unknown): unknown =>
  isRecord(data) && Array.isArray(data.tasks)
    ? { ...data, tasks: data.tasks.map((task) => redactTask(task)) }
    : data;

const redactUpdates = (data: unknown): unknown =>
  Array.isArray(data)
    ? data.map((update) =>
        isRecord(update) ? { ...update, task: redactTask(update.task) } : update
      )
    : data;

const Sha256Schema = lazySchema(() =>
  z
    .string()
    .length(64)
    .regex(/^[a-fA-F0-9]{64}$/)
    .describe('SHA-256 digest of the sample, 64 hex characters.')
);

const TaskIdSchema = lazySchema(() =>
  z.string().min(1).max(128).describe('Detonation task id returned by a submit action.')
);

const commandList = (description: string) =>
  z.array(z.string().min(1).max(MAX_COMMAND_LENGTH)).max(MAX_COMMANDS).describe(description);

/** Run options shared by every submit action. Mirrors the service request contract. */
const runOptionsShape = () => ({
  tags: z
    .array(z.string().min(1).max(MAX_TAG_LENGTH))
    .max(MAX_TAGS)
    .optional()
    .describe('Labels stored on the run, for example alert:<id> or space:<id>.'),
  exec_wait_secs: z
    .number()
    .int()
    .min(0)
    .max(MAX_EXEC_WAIT_SECS)
    .optional()
    .describe('Seconds to observe the sample after it starts. The service default is 120.'),
  pre_exec_commands: commandList('Commands run in the sandbox before the sample.').optional(),
  exec_sample_arguments: z
    .string()
    .max(MAX_COMMAND_LENGTH)
    .optional()
    .describe('Arguments passed to the sample.'),
  sample_filename: z
    .string()
    .min(1)
    .max(MAX_FILENAME_LENGTH)
    .optional()
    .describe('Filename the sample is written to inside the sandbox.'),
  vm_os_family: z
    .enum(['windows', 'linux', 'darwin'])
    .optional()
    .describe('Sandbox operating system; the service picks one when omitted.'),
  vm_disk_image: z
    .string()
    .min(1)
    .max(512)
    .optional()
    .describe('One of the disk images listed by the meta action.'),
  vm_has_internet: z
    .boolean()
    .optional()
    .describe(
      'Let the sandbox reach the internet. Off by default, which limits it to the telemetry cluster.'
    ),
  vm_globs_to_collect: z
    .array(z.string().min(1).max(1024))
    .max(MAX_GLOBS)
    .optional()
    .describe('File globs collected from the sandbox after the run.'),
  agent_version: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('Elastic Agent version to install; the service default when omitted.'),
});

const SubmitHashInputSchema = lazySchema(() =>
  z.object({
    sample_hash: z
      .string()
      .min(32)
      .max(128)
      .regex(/^[a-fA-F0-9]+$/)
      .describe(
        'Hash of a sample the service fetches from its public sample sources (MD5 to SHA-512).'
      ),
    ...runOptionsShape(),
  })
);
type SubmitHashInput = z.infer<typeof SubmitHashInputSchema>;

const SubmitFileInputSchema = lazySchema(() =>
  z.object({
    file: z
      .string()
      .min(1)
      .max(MAX_FILE_BASE64_LENGTH)
      .describe('Base64-encoded sample bytes, at most 10 MiB decoded.'),
    filename: z.string().min(1).max(MAX_FILENAME_LENGTH).describe('Original sample filename.'),
    ...runOptionsShape(),
  })
);
type SubmitFileInput = z.infer<typeof SubmitFileInputSchema>;

const SubmitUrlInputSchema = lazySchema(() =>
  z.object({
    sample_url: z
      .string()
      .min(1)
      .max(MAX_URL_LENGTH)
      .url()
      .describe('URL the service downloads the sample from.'),
    ...runOptionsShape(),
  })
);
type SubmitUrlInput = z.infer<typeof SubmitUrlInputSchema>;

const SubmitCommandsInputSchema = lazySchema(() =>
  z.object({
    exec_commands: z
      .array(z.string().min(1).max(MAX_COMMAND_LENGTH))
      .min(1)
      .max(MAX_COMMANDS)
      .describe('Shell commands to run in the sandbox instead of a sample.'),
    ...runOptionsShape(),
  })
);
type SubmitCommandsInput = z.infer<typeof SubmitCommandsInputSchema>;

const ListTasksInputSchema = lazySchema(() =>
  z.object({
    query_string: z
      .string()
      .min(1)
      .max(1024)
      .optional()
      .describe('Elasticsearch query_string over task fields, for example tags:"space:default".'),
    offset: z.number().int().min(0).max(10_000).optional().describe('Page offset.'),
    size: z
      .number()
      .int()
      .min(1)
      .max(MAX_TASK_PAGE_SIZE)
      .optional()
      .describe(`Page size (1-${MAX_TASK_PAGE_SIZE}); the service default is 10.`),
    order: z.enum(['asc', 'desc']).optional().describe('Creation-time order; default desc.'),
  })
);
type ListTasksInput = z.infer<typeof ListTasksInputSchema>;

const FindTasksByHashInputSchema = lazySchema(() =>
  z.object({
    sha256: Sha256Schema,
    size: z
      .number()
      .int()
      .min(1)
      .max(MAX_TASK_PAGE_SIZE)
      .optional()
      .describe(`Most recent runs to return (1-${MAX_TASK_PAGE_SIZE}); default 10.`),
  })
);
type FindTasksByHashInput = z.infer<typeof FindTasksByHashInputSchema>;

const AlertSourceSchema = lazySchema(() =>
  z
    .enum(ALERT_SOURCE_KEYS)
    .describe(
      'Which alerts to read: production_endpoint (shipping endpoint rules), diagnostic_endpoint (diagnostic rules), or production_detection (Kibana detection rules).'
    )
);

const GetTaskAlertsInputSchema = lazySchema(() =>
  z.object({
    taskId: TaskIdSchema,
    source: AlertSourceSchema,
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_ALERTS)
      .optional()
      .describe(`Maximum alert documents (1-${MAX_ALERTS}).`),
  })
);
type GetTaskAlertsInput = z.infer<typeof GetTaskAlertsInputSchema>;

const GetTaskAlertGroupsInputSchema = lazySchema(() =>
  z.object({
    taskId: TaskIdSchema,
    source: AlertSourceSchema,
    groups_limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_ALERT_GROUPS)
      .optional()
      .describe(`Maximum groups (1-${MAX_ALERT_GROUPS}).`),
    alerts_limit: z
      .number()
      .int()
      .min(0)
      .max(MAX_ALERT_GROUPS)
      .optional()
      .describe(`Alert documents kept per group (0-${MAX_ALERT_GROUPS}).`),
  })
);
type GetTaskAlertGroupsInput = z.infer<typeof GetTaskAlertGroupsInputSchema>;

const GetTaskLogInputSchema = lazySchema(() =>
  z.object({
    taskId: TaskIdSchema,
    logType: z
      .enum(['script', 'exec'])
      .describe(
        'script: the sandbox startup script log; exec: the log of the sample execution itself.'
      ),
  })
);
type GetTaskLogInput = z.infer<typeof GetTaskLogInputSchema>;

const definedParams = (input: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

const postJson = async (ctx: ActionContext, action: string, path: string, body: object) => {
  try {
    const response = await ctx.client.post(`${getBaseUrl(ctx)}${path}`, body, {
      headers: { 'Content-Type': 'application/json' },
    });
    return redactTask(response.data);
  } catch (error) {
    throw formatDetonateError(action, error);
  }
};

const get = async (
  ctx: ActionContext,
  action: string,
  url: string,
  params?: Record<string, unknown>
) => {
  try {
    const response = await ctx.client.get(url, params ? { params } : undefined);
    return response.data;
  } catch (error) {
    throw formatDetonateError(action, error);
  }
};

export const Detonate: ConnectorSpec = {
  metadata: {
    id: '.detonate',
    displayName: 'Detonate',
    description: i18n.translate('core.kibanaConnectorSpecs.detonate.metadata.description', {
      defaultMessage:
        'Submit a file, hash, URL, or commands to a malware detonation sandbox and read the run status, logs, and alerts',
    }),
    docsUrl: '',
    icon: 'bug',
    minimumLicense: 'enterprise',
    isTechnicalPreview: true,
    supportedFeatureIds: ['workflows'],
  },

  auth: {
    types: [
      {
        type: 'api_key_header',
        isRecommended: true,
        defaults: { headerField: 'Auth' },
      },
    ],
  },

  schema: lazySchema(() =>
    z.object({
      url: UISchemas.url('https://detonate.example.com')
        .describe('Detonation service base URL')
        .meta({
          label: i18n.translate('core.kibanaConnectorSpecs.detonate.config.url.label', {
            defaultMessage: 'Service URL',
          }),
          helpText: i18n.translate('core.kibanaConnectorSpecs.detonate.config.url.helpText', {
            defaultMessage:
              'Base URL of the detonation service gateway, without the /v1/detonate path or a trailing slash.',
          }),
        }),
    })
  ),

  validateUrls: {
    fields: ['url'],
  },

  actions: {
    healthcheck: {
      isTool: false,
      scope: 'read',
      description: 'Report whether the detonation service is up.',
      input: lazySchema(() => z.object({})),
      handler: async (ctx) => get(ctx, 'healthcheck', `${getBaseUrl(ctx)}/healthcheck`),
    },

    meta: {
      isTool: false,
      scope: 'read',
      description:
        'Read service metadata: the telemetry cluster version and the supported sandbox disk images.',
      input: lazySchema(() => z.object({})),
      handler: async (ctx) => get(ctx, 'meta', `${getBaseUrl(ctx)}/meta`),
    },

    submitHash: {
      isTool: false,
      scope: 'write',
      description:
        'Start a detonation for a sample hash. The service fetches the sample from public sample sources. Returns the created task.',
      input: SubmitHashInputSchema,
      handler: async (ctx, input: SubmitHashInput) =>
        postJson(ctx, 'submitHash', '/submit-hash', input),
    },

    submitFile: {
      isTool: false,
      scope: 'write',
      description:
        'Start a detonation for an uploaded sample. The sample is not shared with third-party sample sources. Returns the created task.',
      input: SubmitFileInputSchema,
      handler: async (ctx, input: SubmitFileInput) => {
        const { file, filename, ...options } = input;
        // Multipart field names are the service's: request_json plus sample_file.
        const form = new FormData();
        form.set('request_json', JSON.stringify(options));
        form.set('sample_file', new Blob([Buffer.from(file, 'base64')]), filename);
        try {
          const response = await ctx.client.post(`${getBaseUrl(ctx)}/submit-file`, form);
          return redactTask(response.data);
        } catch (error) {
          throw formatDetonateError('submitFile', error);
        }
      },
    },

    submitUrl: {
      isTool: false,
      scope: 'write',
      description:
        'Start a detonation for a sample the service downloads from a URL. Returns the created task.',
      input: SubmitUrlInputSchema,
      handler: async (ctx, input: SubmitUrlInput) =>
        postJson(ctx, 'submitUrl', '/submit-url', input),
    },

    submitCommands: {
      isTool: false,
      scope: 'write',
      description:
        'Start a detonation that runs shell commands instead of a sample. Returns the created task.',
      input: SubmitCommandsInputSchema,
      handler: async (ctx, input: SubmitCommandsInput) =>
        postJson(ctx, 'submitCommands', '/submit-commands', input),
    },

    getTask: {
      isTool: false,
      scope: 'read',
      description:
        'Read one detonation task: worker progress and alert counts and groups. A task submitted moments ago can answer 404 until it is indexed.',
      input: lazySchema(() => z.object({ taskId: TaskIdSchema })),
      handler: async (ctx, input: { taskId: string }) =>
        redactTask(await get(ctx, 'getTask', taskPath(ctx, input.taskId))),
    },

    getTaskMeta: {
      isTool: false,
      scope: 'read',
      description: 'Read links to the raw events, alerts, and logs of one detonation task.',
      input: lazySchema(() => z.object({ taskId: TaskIdSchema })),
      handler: async (ctx, input: { taskId: string }) =>
        get(ctx, 'getTaskMeta', taskPath(ctx, input.taskId, '/meta')),
    },

    getTaskUpdates: {
      isTool: false,
      scope: 'read',
      description: 'Read the timeline of task snapshots for one detonation.',
      input: lazySchema(() => z.object({ taskId: TaskIdSchema })),
      handler: async (ctx, input: { taskId: string }) => ({
        updates: redactUpdates(
          await get(ctx, 'getTaskUpdates', taskPath(ctx, input.taskId, '/updates'))
        ),
      }),
    },

    getTaskLog: {
      isTool: false,
      scope: 'read',
      description:
        'Read the startup script log or the execution log of one detonation. Logs expire after seven days.',
      input: GetTaskLogInputSchema,
      handler: async (ctx, input: GetTaskLogInput) => {
        const logType: LogType = input.logType;
        try {
          const response = await ctx.client.get(
            taskPath(ctx, input.taskId, `/${LOG_PATHS[logType]}`),
            { responseType: 'text' }
          );
          const log = typeof response.data === 'string' ? response.data : String(response.data);
          return {
            log: log.slice(0, MAX_LOG_CHARS),
            truncated: log.length > MAX_LOG_CHARS,
          };
        } catch (error) {
          throw formatDetonateError('getTaskLog', error);
        }
      },
    },

    getTaskAlerts: {
      isTool: false,
      scope: 'read',
      description:
        'Read the alert documents one detonation produced. Answers 404 until the sandbox agent has enrolled.',
      input: GetTaskAlertsInputSchema,
      handler: async (ctx, input: GetTaskAlertsInput) => ({
        alerts: await get(
          ctx,
          'getTaskAlerts',
          taskPath(ctx, input.taskId, `/${ALERT_SOURCES[input.source]}`),
          definedParams({ limit: input.limit })
        ),
      }),
    },

    getTaskAlertGroups: {
      isTool: false,
      scope: 'read',
      description:
        'Read the alerts one detonation produced, grouped by rule. Answers 404 until the sandbox agent has enrolled.',
      input: GetTaskAlertGroupsInputSchema,
      handler: async (ctx, input: GetTaskAlertGroupsInput) => ({
        groups: await get(
          ctx,
          'getTaskAlertGroups',
          taskPath(ctx, input.taskId, `/${ALERT_SOURCES[input.source]}/groups`),
          definedParams({ groups_limit: input.groups_limit, alerts_limit: input.alerts_limit })
        ),
      }),
    },

    listTasks: {
      isTool: false,
      scope: 'read',
      description:
        'Page through detonation tasks with an Elasticsearch query_string filter. The response has no total count.',
      input: ListTasksInputSchema,
      handler: async (ctx, input: ListTasksInput) =>
        redactTaskList(
          await get(ctx, 'listTasks', `${getBaseUrl(ctx)}/tasks`, definedParams(input))
        ),
    },

    findTasksByHash: {
      isTool: false,
      scope: 'read',
      description:
        'Find earlier detonations of a sample by SHA-256, newest first, so a known sample is not detonated again.',
      input: FindTasksByHashInputSchema,
      handler: async (ctx, input: FindTasksByHashInput) =>
        redactTaskList(
          await get(ctx, 'findTasksByHash', `${getBaseUrl(ctx)}/tasks`, {
            query_string: `sample_hash:${input.sha256.toLowerCase()}`,
            size: input.size ?? 10,
            order: 'desc',
          })
        ),
    },
  },

  test: {
    handler: async (ctx) => {
      // The gateway authenticates every request, so a healthcheck also proves the key.
      await get(ctx, 'healthcheck', `${getBaseUrl(ctx)}/healthcheck`);
      return {};
    },
    description: i18n.translate('core.kibanaConnectorSpecs.detonate.test.description', {
      defaultMessage: 'Checks that the detonation service is reachable and accepts the API key',
    }),
    enabled: true,
  },
};

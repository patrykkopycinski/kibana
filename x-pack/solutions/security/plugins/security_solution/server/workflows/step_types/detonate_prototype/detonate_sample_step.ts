/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — workflow step, server implementation.
 *
 * `start` submits the detonation and hands back the task id; `poll` wakes up
 * until the run reaches its terminal worker. The step goes through this
 * plugin's own internal routes rather than holding a `DetonateClient`, so the
 * service address, privilege checks and error shaping stay in one place and
 * the workflow engine's request scoping is preserved.
 */

import { isIP } from 'node:net';

import { createPollServerStepDefinition } from '@kbn/workflows-extensions/server';
import type { StepHandlerContext } from '@kbn/workflows-extensions/server';
import { z, lazySchema } from '@kbn/zod/v4';

import {
  DETONATE_ALERT_KINDS,
  DETONATE_SUBMIT_HASH_PATH,
  DETONATE_TASKS_PATH,
  isDetonationComplete,
  isDetonationFailed,
  totalDetonationAlerts,
} from '../../../../common/detonate_prototype';
import type {
  DetonateAlertDoc,
  DetonateAlertKind,
  DetonateExtractedIocs,
  DetonateTask,
} from '../../../../common/detonate_prototype';
import { detonateSampleStepCommonDefinition } from '../../../../common/workflows/step_types/detonate_prototype/detonate_sample_step_common';
import { toApiExecutionError } from '../../utils/to_api_execution_error';

/** How often the step wakes to re-read the task. */
const POLL_INTERVAL_MS = 5_000;

/**
 * Hard ceiling on poll wake-ups, independent of the author's `max_wait_secs`.
 * `max_wait_secs` is the author's budget and is enforced against wall-clock
 * time inside `poll`; this is the engine's backstop so a step cannot poll
 * forever if the clock comparison is ever wrong.
 */
const MAX_POLL_ATTEMPTS = Math.ceil((3600 * 1000) / POLL_INTERVAL_MS);

const detonateStateSchema = lazySchema(() =>
  z.object({
    taskId: z.string(),
    submittedAt: z.string(),
    deadlineAt: z.string(),
  })
);

/** Each family is spliced into an ES|QL `IN (...)`; keep that query bounded. */
const MAX_IOCS_PER_FAMILY = 100;

/** Hostname labels only: no quotes, backslashes, whitespace or control characters. */
const DOMAIN_PATTERN =
  /^(?=.{1,253}$)[a-z0-9_](?:[a-z0-9_-]{0,62})(?:\.[a-z0-9_](?:[a-z0-9_-]{0,62}))*\.?$/;
const FILE_HASH_PATTERN = /^[a-f0-9]{32,128}$/;

const keepValid = (values: string[], normalize: (value: string) => string | undefined) =>
  [...new Set(values.flatMap((value) => normalize(value) ?? []))].slice(0, MAX_IOCS_PER_FAMILY);

/**
 * Later steps splice these IOCs into queries, so a value that is not a valid
 * domain, IP or hex digest is dropped rather than escaped: it cannot be hunted.
 */
export const sanitizeIocs = (iocs: DetonateExtractedIocs): DetonateExtractedIocs => ({
  domains: keepValid(iocs.domains, (value) => {
    const domain = value.trim().toLowerCase();
    return DOMAIN_PATTERN.test(domain) ? domain : undefined;
  }),
  ips: keepValid(iocs.ips, (value) => {
    const ip = value.trim().toLowerCase();
    return isIP(ip) === 0 ? undefined : ip;
  }),
  file_hashes: keepValid(iocs.file_hashes, (value) => {
    const hash = value.trim().toLowerCase();
    return FILE_HASH_PATTERN.test(hash) ? hash : undefined;
  }),
});

/**
 * Reads `path` from a document whose fields may be nested objects, dotted
 * keys, or a mix of both, flattening arrays along the way.
 */
const readField = (source: unknown, path: string): unknown[] => {
  if (source === null || typeof source !== 'object') return [];
  if (Array.isArray(source)) return source.flatMap((item) => readField(item, path));

  const record = source as Record<string, unknown>;
  if (path in record) {
    const value = record[path];
    return Array.isArray(value) ? value.flat() : [value];
  }
  const dot = path.indexOf('.');
  return dot === -1
    ? []
    : Object.entries(record).flatMap(([key, value]) =>
        path.startsWith(`${key}.`) ? readField(value, path.slice(key.length + 1)) : []
      );
};

const readStrings = (source: unknown, path: string): string[] =>
  readField(source, path).filter((value): value is string => typeof value === 'string');

const IPV4_NON_PUBLIC: Array<[number, number, number]> = [
  // [first octet, second-octet low, second-octet high]
  [0, 0, 255],
  [10, 0, 255],
  [100, 64, 127],
  [127, 0, 255],
  [169, 254, 254],
  [172, 16, 31],
  [192, 168, 168],
];

/**
 * The sandbox VM's own addresses and its gateway are private; hunting the
 * fleet for them would match every host on a private network.
 */
const isPublicIp = (ip: string): boolean => {
  const family = isIP(ip);
  if (family === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a >= 224) return false;
    return !IPV4_NON_PUBLIC.some(([first, low, high]) => a === first && b >= low && b <= high);
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    return !(
      lower === '::' ||
      lower === '::1' ||
      /^f[cd]/.test(lower) ||
      /^fe[89ab]/.test(lower) ||
      lower.startsWith('ff') ||
      lower.startsWith('::ffff:')
    );
  }
  return false;
};

const FILE_HASH_FIELDS = ['sha256', 'sha1', 'md5'] as const;

/**
 * Derives IOCs from a run's raw alert documents: DNS question names, public
 * destination IPs, and the hashes of every file except the sample itself.
 * Output is sanitized and capped.
 */
export const extractIocsFromAlertDocs = (
  docs: DetonateAlertDoc[],
  sampleSha256?: string
): DetonateExtractedIocs => {
  const sample = sampleSha256?.trim().toLowerCase();
  const domains: string[] = [];
  const ips: string[] = [];
  const fileHashes: string[] = [];

  for (const doc of docs) {
    const source =
      doc._source !== null && typeof doc._source === 'object' ? (doc._source as object) : doc;
    domains.push(...readStrings(source, 'dns.question.name'));
    ips.push(...readStrings(source, 'destination.ip').filter((ip) => isPublicIp(ip.trim())));

    // An alert document describes one file, so a document about the sample
    // contributes none of its digests.
    const isSample = readStrings(source, 'file.hash.sha256').some(
      (hash) => hash.trim().toLowerCase() === sample
    );
    if (!isSample) {
      fileHashes.push(
        ...FILE_HASH_FIELDS.flatMap((algo) => readStrings(source, `file.hash.${algo}`))
      );
    }
  }

  return sanitizeIocs({ domains, ips, file_hashes: fileHashes });
};

const ALERT_COUNT_FIELD = {
  'production-endpoint-alerts': 'production_endpoint_alerts_count',
  'diagnostic-endpoint-alerts': 'diagnostic_endpoint_alerts_count',
  'production-detection-alerts': 'production_detection_alerts_count',
} as const satisfies Record<DetonateAlertKind, keyof DetonateTask>;

/** Per kind; the service default (5000) is far more than a hunt needs. */
const ALERT_READ_LIMIT = 500;

/**
 * Best-effort: the alert reads 404 until the sandbox agent enrolls and the
 * service queries the alert indices live, so any of them can fail. Returns
 * `undefined` only when no kind could be read — the output contract's
 * "could not be read" — and a kind the task already counts as zero is not
 * fetched at all.
 */
const readExtractedIocs = async (
  task: DetonateTask,
  { contextManager, logger }: Pick<StepHandlerContext, 'contextManager' | 'logger'>
): Promise<DetonateExtractedIocs | undefined> => {
  const kinds = DETONATE_ALERT_KINDS.filter((kind) => task[ALERT_COUNT_FIELD[kind]] !== 0);
  if (kinds.length === 0) return { domains: [], ips: [], file_hashes: [] };

  const reads = await Promise.allSettled(
    kinds.map(async (kind) => {
      const { body } = await contextManager.callKibanaApi<DetonateAlertDoc[]>({
        method: 'GET',
        path: `${DETONATE_TASKS_PATH}/${encodeURIComponent(task.id)}/alerts`,
        headers: { 'elastic-api-version': '1' },
        query: { kind, limit: ALERT_READ_LIMIT },
      });
      if (!Array.isArray(body)) throw new Error(`unexpected ${kind} response`);
      return body;
    })
  );

  const docs = reads.flatMap((read) => (read.status === 'fulfilled' ? read.value : []));
  reads.forEach((read, index) => {
    if (read.status === 'rejected') {
      logger.debug(
        `Detonation ${task.id}: could not read ${kinds[index]}: ${
          read.reason instanceof Error ? read.reason.message : String(read.reason)
        }`
      );
    }
  });

  return reads.some((read) => read.status === 'fulfilled')
    ? extractIocsFromAlertDocs(docs, task.sample_hash)
    : undefined;
};

/** Shape the task into the step's output contract. */
const toOutput = (
  task: DetonateTask,
  completed: boolean,
  extractedIocs?: DetonateExtractedIocs
) => ({
  task_id: task.id,
  completed,
  failed: isDetonationFailed(task),
  last_worker_name: task.last_worker_name,
  last_worker_status: task.last_worker_status,
  last_worker_status_details: task.last_worker_status_details,
  // sample_hash is deliberately not echoed (see output schema).
  sample_source: task.sample_source,
  production_endpoint_alerts_count: task.production_endpoint_alerts_count ?? 0,
  diagnostic_endpoint_alerts_count: task.diagnostic_endpoint_alerts_count ?? 0,
  production_detection_alerts_count: task.production_detection_alerts_count ?? 0,
  total_alerts_count: totalDetonationAlerts(task),
  // De-duplicated: a detonation commonly raises the same `event.code` from
  // several groups, and a workflow branching on "did Defend see X" wants the
  // set, not the multiset.
  endpoint_alert_event_codes: [
    ...new Set(
      [...task.production_endpoint_alert_groups, ...task.diagnostic_endpoint_alert_groups].map(
        (group) => group.event_code
      )
    ),
  ],
  detection_rule_names: [
    ...new Set(task.production_detection_alert_groups.map((group) => group.kibana_alert_rule_name)),
  ],
  ...(extractedIocs ? { extracted_iocs: extractedIocs } : {}),
});

export const detonateSampleStepDefinition = createPollServerStepDefinition({
  ...detonateSampleStepCommonDefinition,
  stateSchema: detonateStateSchema,

  start: async ({ input, contextManager, logger }) => {
    const {
      sample_hash: sampleHash,
      tags,
      vm_os_family: vmOsFamily,
      exec_wait_secs: execWaitSecs,
      // zod `.default()` does not run here: the engine renders `input` from the
      // `with` block and never calls `inputSchema.parse()` (same reason the
      // sibling `setAlertTags` handler defaults its arrays by destructuring).
      max_wait_secs: maxWaitSecs = 900,
    } = input;

    try {
      const { body: task } = await contextManager.callKibanaApi<DetonateTask>({
        method: 'POST',
        path: DETONATE_SUBMIT_HASH_PATH,
        // The detonate routes are versioned (`router.versioned`, version '1');
        // a versioned route rejects a self-call without this header with
        // "Please specify a version via elastic-api-version header" (400).
        headers: { 'elastic-api-version': '1' },
        body: {
          sample_hash: sampleHash,
          ...(tags ? { tags } : {}),
          ...(vmOsFamily ? { vm_os_family: vmOsFamily } : {}),
          ...(execWaitSecs !== undefined ? { exec_wait_secs: execWaitSecs } : {}),
        },
      });

      logger.info(`Submitted detonation ${task.id} for sample ${sampleHash}`);

      return {
        state: {
          taskId: task.id,
          submittedAt: new Date().toISOString(),
          // Computed at submit time so a slow first poll cannot extend the
          // author's budget.
          deadlineAt: new Date(Date.now() + maxWaitSecs * 1000).toISOString(),
        },
      };
    } catch (error) {
      throw toApiExecutionError(error, 'submit sample for detonation');
    }
  },

  poll: async ({ state, contextManager, logger, attempt }) => {
    if (!state) {
      throw new Error('Poll ran before start() seeded durable state — check engine wiring.');
    }

    let task: DetonateTask;
    try {
      ({ body: task } = await contextManager.callKibanaApi<DetonateTask>({
        method: 'GET',
        path: `${DETONATE_TASKS_PATH}/${encodeURIComponent(state.taskId)}`,
        headers: { 'elastic-api-version': '1' },
      }));
    } catch (error) {
      throw toApiExecutionError(error, `read detonation task ${state.taskId}`);
    }

    if (isDetonationComplete(task)) {
      logger.info(
        `Detonation ${state.taskId} finished after ${attempt + 1} poll(s): ` +
          `${task.last_worker_name}/${task.last_worker_status}, ` +
          `${totalDetonationAlerts(task)} alert(s)`
      );
      // A failed detonation is reported, not thrown: "the sample would not run"
      // is a result the workflow should be able to branch on, and throwing
      // would lose the alert counts a partial run did produce.
      return {
        output: toOutput(task, true, await readExtractedIocs(task, { contextManager, logger })),
      };
    }

    if (Date.now() >= Date.parse(state.deadlineAt)) {
      logger.warn(
        `Stopped waiting on detonation ${state.taskId} after ${attempt + 1} poll(s); ` +
          `last seen at ${task.last_worker_name}/${task.last_worker_status}`
      );
      // The run itself is left alone — it may still finish, and the task id in
      // the output is how the analyst finds it.
      return { output: toOutput(task, false) };
    }

    logger.debug(
      `Detonation ${state.taskId}: ${task.last_worker_name}/${task.last_worker_status} ` +
        `(poll ${attempt + 1})`
    );
    return { state };
  },

  policy: { strategy: 'fixed', intervalMs: POLL_INTERVAL_MS },
  ceilings: { maxAttempts: MAX_POLL_ATTEMPTS, maxWaitMs: POLL_INTERVAL_MS },
});

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — IOCs derived from a run's own alert documents. Shared
 * by the workflow step (which hunts them) and the run record (which shows them).
 */

import { isIP } from 'node:net';

import { DETONATE_ALERT_KINDS } from '../../common/detonate_prototype';
import type {
  DetonateAlertDoc,
  DetonateAlertKind,
  DetonateExtractedIocs,
  DetonateTask,
} from '../../common/detonate_prototype';

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
export const IOC_ALERT_READ_LIMIT = 500;

/**
 * Best-effort: the alert reads 404 until the sandbox agent enrolls and the
 * service queries the alert indices live, so any of them can fail. Returns
 * `undefined` only when no kind could be read ("could not be read"), and a
 * kind the task already counts as zero is not fetched at all.
 */
export const readTaskIocs = async (
  task: DetonateTask,
  readKind: (kind: DetonateAlertKind) => Promise<DetonateAlertDoc[]>,
  onReadError: (kind: DetonateAlertKind, reason: unknown) => void
): Promise<DetonateExtractedIocs | undefined> => {
  const kinds = DETONATE_ALERT_KINDS.filter((kind) => task[ALERT_COUNT_FIELD[kind]] !== 0);
  if (kinds.length === 0) return { domains: [], ips: [], file_hashes: [] };

  const reads = await Promise.allSettled(
    kinds.map(async (kind) => {
      const docs = await readKind(kind);
      if (!Array.isArray(docs)) throw new Error(`unexpected ${kind} response`);
      return docs;
    })
  );

  const docs = reads.flatMap((read) => (read.status === 'fulfilled' ? read.value : []));
  reads.forEach((read, index) => {
    if (read.status === 'rejected') onReadError(kinds[index], read.reason);
  });

  return reads.some((read) => read.status === 'fulfilled')
    ? extractIocsFromAlertDocs(docs, task.sample_hash)
    : undefined;
};

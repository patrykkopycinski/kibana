/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — copies a run's sandbox alerts into the space's hidden
 * sandbox stream, so Analyzer and Session View can open them without the
 * sandbox ever mixing with production alerts.
 */

import { createHash } from 'node:crypto';

import type { ElasticsearchClient } from '@kbn/core/server';
import type { estypes } from '@elastic/elasticsearch';

import type {
  DetonateAlertDoc,
  DetonateAlertKind,
  DetonateTask,
  DETONATE_PROCESS_EVENTS_KIND,
} from '../../common/detonate_prototype';
import {
  DETONATE_SANDBOX_RETENTION,
  DETONATE_SANDBOX_STREAM_PREFIX,
  DETONATE_SANDBOX_TEMPLATE_NAME,
} from '../../common/detonate_prototype';
import { alertDocSource, readField } from './ioc_extraction';

type SandboxFieldType = 'keyword' | 'date' | 'long' | 'float' | 'ip' | 'match_only_text';

/**
 * The only alert fields copied, and their mapping. Everything else (the
 * `Endpoint` policy, `Responses`, `elastic.agent`, host addresses and ids,
 * agent build details) stays behind; `host.name` and `agent.id` are replaced
 * below because they name the service's sandbox VM and agent.
 */
const SANDBOX_FIELDS: Readonly<Record<string, SandboxFieldType>> = {
  '@timestamp': 'date',
  message: 'match_only_text',
  'event.action': 'keyword',
  'event.category': 'keyword',
  'event.kind': 'keyword',
  'event.type': 'keyword',
  'event.id': 'keyword',
  'event.code': 'keyword',
  'event.dataset': 'keyword',
  'event.module': 'keyword',
  'event.outcome': 'keyword',
  'event.severity': 'long',
  'event.risk_score': 'float',
  'process.entity_id': 'keyword',
  'process.name': 'keyword',
  'process.pid': 'long',
  'process.executable': 'keyword',
  'process.args': 'keyword',
  'process.command_line': 'keyword',
  'process.start': 'date',
  'process.hash.sha256': 'keyword',
  'process.parent.entity_id': 'keyword',
  'process.parent.pid': 'long',
  'process.parent.name': 'keyword',
  'process.parent.executable': 'keyword',
  'process.Ext.ancestry': 'keyword',
  'process.entry_leader.entity_id': 'keyword',
  'process.entry_leader.start': 'date',
  'process.entry_leader.pid': 'long',
  'process.entry_leader.name': 'keyword',
  'process.session_leader.entity_id': 'keyword',
  'process.session_leader.start': 'date',
  'process.session_leader.pid': 'long',
  'process.session_leader.name': 'keyword',
  'process.group_leader.entity_id': 'keyword',
  'process.group_leader.start': 'date',
  'process.group_leader.pid': 'long',
  'process.group_leader.name': 'keyword',
  'process.tty': 'long',
  'file.name': 'keyword',
  'file.path': 'keyword',
  'file.directory': 'keyword',
  'file.extension': 'keyword',
  'file.size': 'long',
  'file.hash.md5': 'keyword',
  'file.hash.sha1': 'keyword',
  'file.hash.sha256': 'keyword',
  'dns.question.name': 'keyword',
  'dns.question.type': 'keyword',
  'dns.resolved_ip': 'ip',
  'destination.ip': 'ip',
  'destination.port': 'long',
  'destination.domain': 'keyword',
  'rule.name': 'keyword',
  'rule.ruleset': 'keyword',
  'kibana.alert.rule.name': 'keyword',
  'host.os.type': 'keyword',
  'user.name': 'keyword',
  'agent.type': 'keyword',
};

/** Written by the mapper rather than copied from the alert. */
const DERIVED_FIELDS: Readonly<Record<string, SandboxFieldType>> = {
  tags: 'keyword',
  'detonate.task_id': 'keyword',
  'detonate.alert_kind': 'keyword',
  'host.name': 'keyword',
  'agent.id': 'keyword',
};

type Mapping = Record<string, { type?: SandboxFieldType; properties?: Mapping }>;

const setPath = <T>(target: Record<string, unknown>, path: string, value: T) => {
  const keys = path.split('.');
  let node = target;
  keys.slice(0, -1).forEach((key) => {
    node[key] = node[key] ?? {};
    node = node[key] as Record<string, unknown>;
  });
  node[keys[keys.length - 1]] = value;
};

const buildMappingProperties = (): Mapping => {
  const properties: Mapping = {};
  Object.entries({ ...SANDBOX_FIELDS, ...DERIVED_FIELDS }).forEach(([path, type]) => {
    const keys = path.split('.');
    let node = properties;
    keys.slice(0, -1).forEach((key) => {
      node[key] = node[key] ?? { properties: {} };
      node = node[key].properties as Mapping;
    });
    node[keys[keys.length - 1]] = { type };
  });
  return properties;
};

export const sandboxIndexTemplate = (): estypes.IndicesPutIndexTemplateRequest => ({
  name: DETONATE_SANDBOX_TEMPLATE_NAME,
  index_patterns: [`${DETONATE_SANDBOX_STREAM_PREFIX}*`],
  priority: 500,
  data_stream: { hidden: true },
  _meta: { managed_by: 'security_solution', description: 'Detonate prototype sandbox alerts' },
  template: {
    settings: { 'index.hidden': true, 'index.mapping.ignore_malformed': true },
    lifecycle: { data_retention: DETONATE_SANDBOX_RETENTION },
    mappings: { dynamic: false, properties: buildMappingProperties() },
  },
});

/**
 * Overwrites rather than create-if-absent, so the template always matches this
 * code; Elasticsearch skips the cluster-state update when nothing changed.
 */
export const installSandboxTemplate = async (esClient: ElasticsearchClient): Promise<void> => {
  await esClient.indices.putIndexTemplate(sandboxIndexTemplate());
};

const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const firstString = (source: unknown, path: string): string | undefined =>
  readField(source, path).find(
    (value): value is string => typeof value === 'string' && value !== ''
  );

export interface SandboxDoc {
  _id: string;
  doc: Record<string, unknown>;
}

/**
 * One sandbox doc as an allow-listed copy, or `undefined` when it has no
 * `@timestamp`. The `_id` is stable per run and doc, so re-copying a run
 * creates no duplicates. `kind` tags the doc (`detonate.alert_kind`): an
 * alert kind, or `process-events` for the behavioral telemetry Session View
 * reads — the tag keeps events queryable apart from alerts in the stream.
 */
export const toSandboxDoc = (
  task: DetonateTask,
  kind: DetonateAlertKind | typeof DETONATE_PROCESS_EVENTS_KIND,
  alertDoc: DetonateAlertDoc
): SandboxDoc | undefined => {
  const source = alertDocSource(alertDoc);
  if (!firstString(source, '@timestamp')) return undefined;

  const doc: Record<string, unknown> = {};
  Object.keys(SANDBOX_FIELDS).forEach((path) => {
    const values = readField(source, path).filter(isScalar);
    if (values.length > 0) setPath(doc, path, values.length === 1 ? values[0] : values);
  });

  // The sandbox VM's real host name and agent id identify the service's
  // infrastructure. Analyzer only needs them consistent within one run.
  const osType = firstString(source, 'host.os.type');
  setPath(doc, 'host.name', `detonate-sandbox-${osType ?? 'vm'}`);
  if (readField(source, 'agent.id').length > 0) setPath(doc, 'agent.id', `detonate-${task.id}`);
  setPath(doc, 'tags', ['sandbox']);
  setPath(doc, 'detonate.task_id', task.id);
  setPath(doc, 'detonate.alert_kind', kind);

  const alertKey =
    firstString(source, 'kibana.alert.uuid') ??
    firstString(source, 'event.id') ??
    createHash('sha256').update(JSON.stringify(source)).digest('hex');

  return { _id: `${task.id}:${alertKey}`, doc };
};

export interface SandboxIngestCounts {
  ingested: number;
  duplicates: number;
  dropped: number;
  failed: number;
}

/** Bulk `create` only: a doc that is already there is a duplicate, not an error. */
export const ingestSandboxDocs = async (
  esClient: ElasticsearchClient,
  stream: string,
  task: DetonateTask,
  alerts: Array<{
    kind: DetonateAlertKind | typeof DETONATE_PROCESS_EVENTS_KIND;
    doc: DetonateAlertDoc;
  }>
): Promise<SandboxIngestCounts> => {
  const docs = alerts.flatMap(({ kind, doc }) => toSandboxDoc(task, kind, doc) ?? []);
  const counts: SandboxIngestCounts = {
    ingested: 0,
    duplicates: 0,
    dropped: alerts.length - docs.length,
    failed: 0,
  };
  if (docs.length === 0) return counts;

  const response = await esClient.bulk({
    operations: docs.flatMap(({ _id, doc }) => [{ create: { _index: stream, _id } }, doc]),
  });

  response.items.forEach((item) => {
    const status = item.create?.status;
    if (status === 201) counts.ingested += 1;
    else if (status === 409) counts.duplicates += 1;
    else counts.failed += 1;
  });
  return counts;
};

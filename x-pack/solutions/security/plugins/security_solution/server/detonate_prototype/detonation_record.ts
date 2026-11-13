/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DetonateConfidence,
  DetonateDecisionState,
  DetonateExtractedIocs,
  DetonateSubmitOrigin,
  DetonateTask,
  DetonateTaskUpdate,
  DetonateVerdictName,
  DetonationRunStatus,
} from '../../common/detonate_prototype';
import {
  deriveDetonateVerdict,
  detonationConfidence,
  detonationStep,
  diagnosticOnlyEventCodes,
  isDetonationComplete,
  SPACE_TAG_PREFIX,
  parseAlertTag,
  totalDetonationAlerts,
} from '../../common/detonate_prototype';

/**
 * A run as one flat, ECS-style document: what the result flyout's Table and
 * JSON tabs show and what other surfaces copy from. Every field is listed
 * here; nothing is spread from the task, so a field the service adds later
 * (or one it should never have returned) cannot reach a reader.
 */
export interface DetonationRecord {
  '@timestamp': string;
  'detonate.doc_kind': 'run';
  'event.start': string;
  'event.end'?: string;
  /** Nanoseconds, as in ECS. */
  'event.duration'?: number;
  'detonate.task_id': string;
  'detonate.alert_id'?: string;
  'detonate.state': DetonationRunStatus;
  'detonate.verdict'?: DetonateVerdictName;
  'detonate.confidence'?: DetonateConfidence;
  'detonate.evidence'?: string;
  'detonate.step.number': number;
  'detonate.step.of': number;
  'detonate.step.label': string;
  'detonate.step.worker': string;
  'detonate.step.status': string;
  'detonate.step.details'?: string;
  'file.hash.sha256'?: string;
  'file.name'?: string;
  'detonate.sample.source'?: string;
  'detonate.vm.os_family'?: string;
  'detonate.vm.has_internet': boolean;
  'detonate.alerts.total': number;
  'detonate.alerts.production_endpoint': number;
  'detonate.alerts.diagnostic_endpoint': number;
  'detonate.alerts.production_detection': number;
  'detonate.endpoint_event_codes': string[];
  'detonate.detection_rule_names': string[];
  /** Behaviour only the diagnostic side saw: candidate detections for an analyst. */
  'detonate.detections_to_review': string[];
  /** Absent when no alert read succeeded, so "none found" and "not read" stay distinct. */
  'detonate.iocs.domains'?: string[];
  'detonate.iocs.ips'?: string[];
  'detonate.iocs.file_hashes'?: string[];
  /** The space the run belongs to; the results index is per space. */
  'detonate.space_id'?: string;
  'detonate.source'?: DetonateSubmitOrigin['source'];
  'detonate.submitter'?: string;
  /** The `alert:` tag's alert plus any the caller named. */
  'detonate.origin.alert_ids'?: string[];
  'host.name'?: string;
  'user.name'?: string;
  'file.path'?: string;
  'file.size'?: number;
  'file.mime_type'?: string;
  'detonate.workflow.execution_id'?: string;
  'detonate.conversation_id'?: string;
  /** The run's tags without its space tags. */
  tags?: string[];
}

/**
 * What a sweep decided about one alert, keyed by the alert's id. It reuses the
 * run fields that mean the same thing (`detonate.verdict`, `file.hash.sha256`);
 * `detonate.task_id` is the run whose verdict was applied, never the `_id`.
 */
export interface AlertDecisionRecord {
  /** The last write; it ages `queued` and `running` decisions out. */
  '@timestamp': string;
  'detonate.doc_kind': 'alert_decision';
  'detonate.alert_id': string;
  'detonate.decision.state': DetonateDecisionState;
  'detonate.decision.reason'?: string;
  'detonate.verdict'?: DetonateVerdictName;
  'detonate.task_id'?: string;
  'file.hash.sha256'?: string;
  'detonate.workflow.execution_id'?: string;
  'detonate.space_id'?: string;
}

/**
 * Worker handoff state on a run document. Only the handoff update writes it, so
 * a late run write (a partial merge) can never clobber it and vice versa.
 */
export interface DetonationHandoffFields {
  /** Subset of `requested`, `done`. */
  'detonate.handoff.hunt'?: string[];
  /** Subset of `requested`, `reviewed`, `in_progress`. */
  'detonate.handoff.coverage'?: string[];
}

/** Every field either kind of document can carry. */
type ResultsDocFields = DetonationRecord & AlertDecisionRecord & DetonationHandoffFields;

export type DetonationRecordFieldType = 'keyword' | 'date' | 'long' | 'boolean';

/** Every results-index field and its Elasticsearch type; the index mapping is built from it. */
export const DETONATION_RECORD_FIELDS: Readonly<
  Record<keyof ResultsDocFields, DetonationRecordFieldType>
> = {
  '@timestamp': 'date',
  'detonate.doc_kind': 'keyword',
  'detonate.decision.state': 'keyword',
  'detonate.decision.reason': 'keyword',
  'detonate.handoff.hunt': 'keyword',
  'detonate.handoff.coverage': 'keyword',
  'event.start': 'date',
  'event.end': 'date',
  'event.duration': 'long',
  'detonate.task_id': 'keyword',
  'detonate.alert_id': 'keyword',
  'detonate.state': 'keyword',
  'detonate.verdict': 'keyword',
  'detonate.confidence': 'keyword',
  'detonate.evidence': 'keyword',
  'detonate.step.number': 'long',
  'detonate.step.of': 'long',
  'detonate.step.label': 'keyword',
  'detonate.step.worker': 'keyword',
  'detonate.step.status': 'keyword',
  'detonate.step.details': 'keyword',
  'file.hash.sha256': 'keyword',
  'file.name': 'keyword',
  'detonate.sample.source': 'keyword',
  'detonate.vm.os_family': 'keyword',
  'detonate.vm.has_internet': 'boolean',
  'detonate.alerts.total': 'long',
  'detonate.alerts.production_endpoint': 'long',
  'detonate.alerts.diagnostic_endpoint': 'long',
  'detonate.alerts.production_detection': 'long',
  'detonate.endpoint_event_codes': 'keyword',
  'detonate.detection_rule_names': 'keyword',
  'detonate.detections_to_review': 'keyword',
  'detonate.iocs.domains': 'keyword',
  'detonate.iocs.ips': 'keyword',
  'detonate.iocs.file_hashes': 'keyword',
  'detonate.space_id': 'keyword',
  'detonate.source': 'keyword',
  'detonate.submitter': 'keyword',
  'detonate.origin.alert_ids': 'keyword',
  'host.name': 'keyword',
  'user.name': 'keyword',
  'file.path': 'keyword',
  'file.size': 'long',
  'file.mime_type': 'keyword',
  'detonate.workflow.execution_id': 'keyword',
  'detonate.conversation_id': 'keyword',
  tags: 'keyword',
};

/** What only the submit knows; it is written once and never re-derived from the task. */
export interface DetonationOrigin extends DetonateSubmitOrigin {
  submitter?: string;
  file?: { size: number; mime_type?: string };
}

/** When the run reached its last update, if it has finished. */
const finishedAt = (task: DetonateTask, updates: readonly DetonateTaskUpdate[]) => {
  if (!isDetonationComplete(task)) return undefined;
  const times = updates.map(({ timestamp }) => Date.parse(timestamp)).filter(Number.isFinite);
  return times.length > 0 ? Math.max(...times) : undefined;
};

const originFields = (
  origin: DetonationOrigin,
  taggedAlertId: string | undefined
): Partial<DetonationRecord> => {
  const alertIds = [
    ...new Set([...(taggedAlertId ? [taggedAlertId] : []), ...(origin.alert_ids ?? [])]),
  ];
  return {
    ...(origin.source ? { 'detonate.source': origin.source } : {}),
    ...(origin.submitter ? { 'detonate.submitter': origin.submitter } : {}),
    ...(alertIds.length > 0 ? { 'detonate.origin.alert_ids': alertIds } : {}),
    ...(origin.host_name ? { 'host.name': origin.host_name } : {}),
    ...(origin.user_name ? { 'user.name': origin.user_name } : {}),
    ...(origin.file_path ? { 'file.path': origin.file_path } : {}),
    ...(origin.workflow_execution_id
      ? { 'detonate.workflow.execution_id': origin.workflow_execution_id }
      : {}),
    ...(origin.conversation_id ? { 'detonate.conversation_id': origin.conversation_id } : {}),
    ...(origin.file
      ? {
          'file.size': origin.file.size,
          ...(origin.file.mime_type ? { 'file.mime_type': origin.file.mime_type } : {}),
        }
      : {}),
  };
};

export const toDetonationRecord = (
  task: DetonateTask,
  {
    iocs,
    updates = [],
    spaceId,
    origin,
  }: {
    iocs?: DetonateExtractedIocs;
    updates?: readonly DetonateTaskUpdate[];
    /** Adds the space and the run's tags without its space tags. */
    spaceId?: string;
    /** Passed on the submit write only, so later writes never overwrite it. */
    origin?: DetonationOrigin;
  } = {}
): DetonationRecord => {
  const derived = deriveDetonateVerdict(task);
  const state = derived.status;
  const step = detonationStep(task);
  const alertId = parseAlertTag(task.tags);
  const started = Date.parse(task.created_at);
  const ended = finishedAt(task, updates);
  const hasDuration = ended !== undefined && Number.isFinite(started) && ended >= started;

  return {
    '@timestamp': task.created_at,
    'detonate.doc_kind': 'run',
    'event.start': task.created_at,
    ...(hasDuration
      ? {
          'event.end': new Date(ended).toISOString(),
          'event.duration': (ended - started) * 1_000_000,
        }
      : {}),
    'detonate.task_id': task.id,
    ...(alertId ? { 'detonate.alert_id': alertId } : {}),
    'detonate.state': state,
    ...(derived.status === 'complete'
      ? {
          'detonate.verdict': derived.verdict,
          'detonate.confidence': detonationConfidence(derived.verdict),
        }
      : {}),
    // A failed run's evidence says what happened; a running run has nothing to say yet.
    ...(derived.status === 'complete' || derived.status === 'failed'
      ? { 'detonate.evidence': derived.evidence }
      : {}),
    'detonate.step.number': step.step,
    'detonate.step.of': step.of,
    'detonate.step.label': step.label,
    'detonate.step.worker': step.worker,
    'detonate.step.status': task.last_worker_status,
    ...(task.last_worker_status_details
      ? { 'detonate.step.details': task.last_worker_status_details }
      : {}),
    ...(task.sample_hash ? { 'file.hash.sha256': task.sample_hash.toLowerCase() } : {}),
    ...(task.sample_filename ? { 'file.name': task.sample_filename } : {}),
    ...(task.sample_source ? { 'detonate.sample.source': task.sample_source } : {}),
    ...(task.vm_os_family ? { 'detonate.vm.os_family': task.vm_os_family } : {}),
    'detonate.vm.has_internet': task.vm_has_internet === true,
    'detonate.alerts.total': totalDetonationAlerts(task),
    'detonate.alerts.production_endpoint': task.production_endpoint_alerts_count ?? 0,
    'detonate.alerts.diagnostic_endpoint': task.diagnostic_endpoint_alerts_count ?? 0,
    'detonate.alerts.production_detection': task.production_detection_alerts_count ?? 0,
    'detonate.endpoint_event_codes': derived.endpoint_alert_event_codes,
    'detonate.detection_rule_names': derived.detection_rule_names,
    'detonate.detections_to_review': diagnosticOnlyEventCodes(task),
    ...(iocs
      ? {
          'detonate.iocs.domains': iocs.domains,
          'detonate.iocs.ips': iocs.ips,
          'detonate.iocs.file_hashes': iocs.file_hashes,
        }
      : {}),
    ...(spaceId
      ? {
          'detonate.space_id': spaceId,
          tags: task.tags.filter((tag) => !tag.startsWith(SPACE_TAG_PREFIX)),
        }
      : {}),
    ...(origin ? originFields(origin, alertId) : {}),
  };
};

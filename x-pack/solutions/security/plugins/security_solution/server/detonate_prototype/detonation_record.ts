/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DetonateDecisionState,
  DetonateExtractedIocs,
  DetonateSubmitOrigin,
  DetonateTask,
  DetonateTaskUpdate,
  DetonateVerdictName,
  DetonationRecord,
  DetonationRecordFieldType,
} from '../../common/detonate_prototype';
import {
  DETONATION_RUN_FIELDS,
  deriveDetonateVerdict,
  detonationConfidence,
  detonationStep,
  diagnosticOnlyEventCodes,
  isDetonationComplete,
  SPACE_TAG_PREFIX,
  parseAlertTag,
  totalDetonationAlerts,
} from '../../common/detonate_prototype';

// The shape moved to common so the browser can read the record route's body.
export type { DetonationRecord };

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

/**
 * A union of key sets, not an intersection of the shapes: the two `doc_kind`
 * literals are disjoint, so the intersection is `never` and its `keyof` accepts any key.
 */
type ResultsDocField =
  | keyof DetonationRecord
  | keyof AlertDecisionRecord
  | keyof DetonationHandoffFields;

export type { DetonationRecordFieldType };

/** Every results-index field and its Elasticsearch type; the index mapping is built from it. */
export const DETONATION_RECORD_FIELDS: Readonly<
  Record<ResultsDocField, DetonationRecordFieldType>
> = {
  ...DETONATION_RUN_FIELDS,
  'detonate.decision.state': 'keyword',
  'detonate.decision.reason': 'keyword',
  'detonate.handoff.hunt': 'keyword',
  'detonate.handoff.coverage': 'keyword',
};

/** What only the submit knows; it is written once and never re-derived from the task. */
export interface DetonationOrigin extends DetonateSubmitOrigin {
  submitter?: string;
  file?: { size: number; mime_type?: string };
}

/**
 * When the run finished, if it has: the first update (the service lists them oldest first) that
 * shows it complete. Later updates must not stretch the duration; with no such update, the
 * latest timestamp stands in.
 */
const finishedAt = (task: DetonateTask, updates: readonly DetonateTaskUpdate[]) => {
  if (!isDetonationComplete(task)) return undefined;
  const timed = updates
    .map((update) => ({ task: update.task, time: Date.parse(update.timestamp) }))
    .filter(({ time }) => Number.isFinite(time));
  const completing = timed.find(({ task: updateTask }) => isDetonationComplete(updateTask));
  if (completing) return completing.time;
  return timed.length > 0 ? Math.max(...timed.map(({ time }) => time)) : undefined;
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
    ...(task.vm_architecture ? { 'detonate.vm.architecture': task.vm_architecture } : {}),
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

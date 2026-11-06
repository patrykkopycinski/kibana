/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DetonateConfidence,
  DetonateExtractedIocs,
  DetonateTask,
  DetonateTaskUpdate,
  DetonateVerdictName,
  DetonationRunState,
} from '../../common/detonate_prototype';
import {
  deriveDetonateVerdict,
  deriveDetonationRunState,
  detonationConfidence,
  detonationStep,
  diagnosticOnlyEventCodes,
  isDetonationComplete,
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
  'event.start': string;
  'event.end'?: string;
  /** Nanoseconds, as in ECS. */
  'event.duration'?: number;
  'detonate.task_id': string;
  'detonate.alert_id'?: string;
  'detonate.state': DetonationRunState;
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
}

/** When the run reached its last update, if it has finished. */
const finishedAt = (task: DetonateTask, updates: readonly DetonateTaskUpdate[]) => {
  if (!isDetonationComplete(task)) return undefined;
  const times = updates.map(({ timestamp }) => Date.parse(timestamp)).filter(Number.isFinite);
  return times.length > 0 ? Math.max(...times) : undefined;
};

export const toDetonationRecord = (
  task: DetonateTask,
  {
    iocs,
    updates = [],
  }: { iocs?: DetonateExtractedIocs; updates?: readonly DetonateTaskUpdate[] } = {}
): DetonationRecord => {
  const derived = deriveDetonateVerdict(task);
  const state = deriveDetonationRunState(task);
  // A running run has no verdict yet, only the placeholder the derivation returns.
  const verdict = state === 'running' ? undefined : derived.verdict;
  const step = detonationStep(task);
  const alertId = parseAlertTag(task.tags);
  const started = Date.parse(task.created_at);
  const ended = finishedAt(task, updates);
  const hasDuration = ended !== undefined && Number.isFinite(started) && ended >= started;

  return {
    '@timestamp': task.created_at,
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
    ...(verdict
      ? {
          'detonate.verdict': verdict,
          'detonate.confidence': detonationConfidence(verdict),
          'detonate.evidence': derived.evidence,
        }
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
  };
};

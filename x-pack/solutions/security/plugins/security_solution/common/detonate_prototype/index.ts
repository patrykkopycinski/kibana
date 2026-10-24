/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — shared contract.
 *
 * Everything in this folder is namespaced `detonate.prototype.*` so it can be
 * removed in one commit, and so nothing here can be mistaken for the shipped
 * detonation service. This module is the single definition of the detonation
 * API that all four analyst surfaces (page, alert action, Agent Builder skill,
 * workflow step) agree on.
 *
 * FIDELITY: field names, enum spellings and worker strings are copied verbatim
 * from the real `/v1/detonate` service — including the misspelled
 * `virtustotal` sample source. A surface that "fixes" a name stops working
 * against the real service, which is the one thing this prototype exists to
 * prove it does. A parity check in the simulator repo diffs these declarations
 * against the service's schema, so drift fails rather than rots.
 */

/** Everything this prototype adds is prefixed with this. */
export const DETONATE_PROTOTYPE_NAMESPACE = 'detonate.prototype' as const;

/** Kibana route prefix for the prototype's proxy to the detonation service. */
export const DETONATE_PROTOTYPE_API = '/internal/detonate_prototype' as const;

export const DETONATE_SUBMIT_FILE_PATH = `${DETONATE_PROTOTYPE_API}/submit_file` as const;
export const DETONATE_SUBMIT_HASH_PATH = `${DETONATE_PROTOTYPE_API}/submit_hash` as const;
export const DETONATE_TASKS_PATH = `${DETONATE_PROTOTYPE_API}/tasks` as const;
export const DETONATE_HEALTHCHECK_PATH = `${DETONATE_PROTOTYPE_API}/healthcheck` as const;

/** The prototype's app route, registered as a deep link under Security. */
export const DETONATE_PROTOTYPE_APP_PATH = '/detonate_prototype' as const;

/* -------------------------------------------------------------------------- */
/* Worker state machine                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The four workers the detonation service runs, in order. Copied verbatim,
 * including the `detonate.workers.` prefix and `prepare_task_data` (not
 * `prepare`).
 */
export const DETONATE_WORKERS = [
  'detonate.workers.prepare_task_data',
  'detonate.workers.start_vm',
  'detonate.workers.stop_vm',
  'detonate.workers.make_summary',
] as const;

export type DetonateWorkerName = (typeof DETONATE_WORKERS)[number];

/** Worker outcomes, verbatim from the service. */
export const DETONATE_WORKER_STATUSES = ['started', 'success', 'failure'] as const;
export type DetonateWorkerStatus = (typeof DETONATE_WORKER_STATUSES)[number];

/** The last worker that must succeed for a run to be complete. */
export const DETONATE_TERMINAL_WORKER: DetonateWorkerName = 'detonate.workers.make_summary';

/**
 * The one completion predicate. There is no `status: "done"` field on a task —
 * completion is derived from the worker pair, and any poller that invents an
 * elapsed-time or status-field rule reports completion at the wrong moment, or
 * polls forever on a failed run.
 */
export const isDetonationComplete = (
  task: Pick<DetonateTask, 'last_worker_name' | 'last_worker_status'>
): boolean =>
  task.last_worker_status === 'failure' ||
  (task.last_worker_name === DETONATE_TERMINAL_WORKER && task.last_worker_status === 'success');

/** A run finished, but not the way the analyst wanted. */
export const isDetonationFailed = (task: Pick<DetonateTask, 'last_worker_status'>): boolean =>
  task.last_worker_status === 'failure';

/** Human-readable progress, for a surface that wants to show a stage. */
export const detonationProgress = (
  task: Pick<DetonateTask, 'last_worker_name' | 'last_worker_status'>
): { step: number; of: number; label: string } => {
  const index = DETONATE_WORKERS.indexOf(task.last_worker_name);
  return {
    step: index < 0 ? 0 : index + 1,
    of: DETONATE_WORKERS.length,
    label: task.last_worker_name.replace('detonate.workers.', ''),
  };
};

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Where a sample came from.
 *
 * FIDELITY: `virtustotal` is misspelled in the real service's enum and is
 * reproduced verbatim. Do not fix it.
 */
export const DETONATE_SAMPLE_SOURCES = ['virtustotal', 'malwarebazaar', 'provided-url'] as const;
export type DetonateSampleSource = (typeof DETONATE_SAMPLE_SOURCES)[number];

export const DETONATE_VM_OS_FAMILIES = ['linux', 'windows', 'macos'] as const;
export type DetonateVmOsFamily = (typeof DETONATE_VM_OS_FAMILIES)[number];

export const DETONATE_VM_ARCHITECTURES = ['x86_64', 'aarch64'] as const;
export type DetonateVmArchitecture = (typeof DETONATE_VM_ARCHITECTURES)[number];

export const DETONATE_DETECTION_SEVERITIES = ['low', 'medium', 'high'] as const;
export type DetonateDetectionSeverity = (typeof DETONATE_DETECTION_SEVERITIES)[number];

/* -------------------------------------------------------------------------- */
/* Alert groups                                                                */
/* -------------------------------------------------------------------------- */

/** Raw alert documents are ES documents; the contract does not narrow them. */
export type DetonateAlertDoc = Record<string, unknown>;

/**
 * Endpoint alerts (production and diagnostic) group by `event.code`.
 * `alert_docs` is only present on the per-task alert reads, not on the task.
 */
export interface DetonateEndpointAlertsGroup {
  alerts_count: number;
  alert_docs?: DetonateAlertDoc[];
  event_code: string;
  rule_id?: string;
  rule_name?: string;
  message?: string;
}

/**
 * Detection alerts group by rule, under their ES field names flattened with
 * underscores — `kibana_alert_rule_name`, not `rule_name`. The two group
 * shapes are genuinely different and must not be merged into one type.
 */
export interface DetonateDetectionAlertsGroup {
  alerts_count: number;
  alert_docs?: DetonateAlertDoc[];
  kibana_alert_rule_name: string;
  kibana_alert_rule_uuid?: string;
  kibana_alert_rule_parameters_severity: DetonateDetectionSeverity;
}

/* -------------------------------------------------------------------------- */
/* DetonateTask                                                                */
/* -------------------------------------------------------------------------- */

/** A detonation task, as the service returns it. */
export interface DetonateTask {
  id: string;
  created_at: string;
  tags: string[];

  sample_hash?: string;
  sample_url?: string;
  sample_filename?: string;
  sample_ext?: string;
  sample_source?: DetonateSampleSource;

  agent_version: string;
  agent_dist_base_url?: string;
  telemetry_cluster_version: string;

  last_worker_name: DetonateWorkerName;
  last_worker_status: DetonateWorkerStatus;
  last_worker_status_details?: string;

  exec_wait_secs: number;
  pre_exec_commands: string[];
  exec_commands: string[];
  exec_sample_arguments?: string;

  vm_os_family?: DetonateVmOsFamily;
  vm_architecture?: DetonateVmArchitecture;
  vm_disk_image?: string;
  vm_has_internet: boolean;
  vm_instance_name?: string;
  vm_zone?: string;
  vm_termination_time?: string;

  elastic_agent_id?: string;
  elastic_endpoint_id?: string;

  production_endpoint_alerts_count?: number;
  production_endpoint_alert_groups: DetonateEndpointAlertsGroup[];
  diagnostic_endpoint_alerts_count?: number;
  diagnostic_endpoint_alert_groups: DetonateEndpointAlertsGroup[];
  production_detection_alerts_count?: number;
  production_detection_alert_groups: DetonateDetectionAlertsGroup[];
}

/** One point on the timeline, from `/tasks/{id}/updates`. */
export interface DetonateTaskUpdate {
  task: DetonateTask;
  timestamp: string;
}

/* -------------------------------------------------------------------------- */
/* Requests and responses                                                      */
/* -------------------------------------------------------------------------- */

/** Fields every submit-* request carries. */
export interface DetonateBaseRequest {
  tags?: string[];
  agent_version?: string;
  agent_dist_base_url?: string;
  exec_wait_secs?: number;
  pre_exec_commands?: string[];
  exec_commands?: string[];
  exec_sample_arguments?: string;
  vm_os_family?: DetonateVmOsFamily;
  vm_architecture?: DetonateVmArchitecture;
  vm_disk_image?: string;
  vm_has_internet?: boolean;
}

export interface DetonateHashRequest extends DetonateBaseRequest {
  sample_hash: string;
}

/**
 * `POST /submit-file` is multipart: a `request_json` form field holding this,
 * plus a `sample_file` file part.
 */
export interface DetonateFileRequest extends DetonateBaseRequest {
  sample_filename?: string;
  sample_ext?: string;
}

/** Both submits answer with the created task. */
export type DetonateSubmitResponse = DetonateTask;

/** A page of tasks. */
export interface DetonateTaskSearchResponse {
  total: number;
  offset: number;
  size: number;
  tasks: DetonateTask[];
}

/** Deep links back into the telemetry cluster for one task. */
export interface DetonateTaskMeta {
  task_id: string;
  telemetry_cluster_version: string;
  production_endpoint_alerts_url?: string;
  diagnostic_endpoint_alerts_url?: string;
  production_detection_alerts_url?: string;
  events_url?: string;
}

/* -------------------------------------------------------------------------- */
/* Derived helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Total alerts a run produced, across all three telemetry groups. */
export const totalDetonationAlerts = (task: DetonateTask): number =>
  (task.production_endpoint_alerts_count ?? 0) +
  (task.diagnostic_endpoint_alerts_count ?? 0) +
  (task.production_detection_alerts_count ?? 0);

/**
 * Whether a detonation saw anything at all. A run that completes with zero
 * alerts is a real and meaningful result (a benign sample, or a detection
 * gap) — it is not an error, and surfaces must not present it as one.
 */
export const detonationWasQuiet = (task: DetonateTask): boolean =>
  isDetonationComplete(task) && !isDetonationFailed(task) && totalDetonationAlerts(task) === 0;

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
/** Kibana-shaped views of a run, as opposed to the service's raw task. */
export const DETONATE_RUNS_PATH = `${DETONATE_PROTOTYPE_API}/runs` as const;

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

/**
 * What each worker is doing, in words an analyst reads on a step chip. The raw
 * worker name stays available beside it (tooltip, JSON) for anyone debugging
 * the service.
 */
export const DETONATE_WORKER_LABELS: Readonly<Record<DetonateWorkerName, string>> = {
  'detonate.workers.prepare_task_data': 'Preparing the sample',
  'detonate.workers.start_vm': 'Running in the sandbox',
  'detonate.workers.stop_vm': 'Stopping the sandbox',
  'detonate.workers.make_summary': 'Writing the summary',
};

export interface DetonationStep {
  step: number;
  of: number;
  label: string;
  worker: string;
}

/** The step a run is on, with both its plain label and the raw worker name. */
export const detonationStep = (
  task: Pick<DetonateTask, 'last_worker_name' | 'last_worker_status'>
): DetonationStep => {
  const { step, of } = detonationProgress(task);
  return {
    step,
    of,
    label: DETONATE_WORKER_LABELS[task.last_worker_name] ?? task.last_worker_name,
    worker: task.last_worker_name,
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

/** FIDELITY: the service spells macOS `darwin`. */
export const DETONATE_VM_OS_FAMILIES = ['linux', 'windows', 'darwin'] as const;
export type DetonateVmOsFamily = (typeof DETONATE_VM_OS_FAMILIES)[number];

export const DETONATE_DETECTION_SEVERITIES = ['low', 'medium', 'high'] as const;
export type DetonateDetectionSeverity = (typeof DETONATE_DETECTION_SEVERITIES)[number];

/* -------------------------------------------------------------------------- */
/* Alert groups                                                                */
/* -------------------------------------------------------------------------- */

/** Raw alert documents are ES documents; the contract does not narrow them. */
export type DetonateAlertDoc = Record<string, unknown>;

/**
 * A process (or other behavioral) event recorded in the sandbox, as ECS docs.
 * Kept as a loose record like `DetonateAlertDoc`: the mapper projects a
 * bounded field set into the sandbox stream, and Session View's server route
 * queries it through its own typed pipeline.
 */
export type DetonateSandboxEventDoc = Record<string, unknown>;

/** The service's per-task alert reads. Each 404s until the sandbox agent enrolls. */
export const DETONATE_ALERT_KINDS = [
  'production-endpoint-alerts',
  'diagnostic-endpoint-alerts',
  'production-detection-alerts',
] as const;
export type DetonateAlertKind = (typeof DETONATE_ALERT_KINDS)[number];

/**
 * The service's per-task process-event read: the sandbox's behavioral
 * telemetry (`event.kind: 'event'` docs), Session View's raw material. Same
 * read shape as the alert kinds — count on the task, docs through the route —
 * but not an alert kind: it must never reach IOC extraction, which reads only
 * {@link DETONATE_ALERT_KINDS}.
 */
export const DETONATE_PROCESS_EVENTS_KIND = 'process-events' as const;
export type DetonateProcessEventsKind = typeof DETONATE_PROCESS_EVENTS_KIND;

/** The service defaults an alert read to 5000 documents; nothing here needs that many. */
export const DETONATE_MAX_ALERT_DOCS = 1000;

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

/** Indicators extracted from a detonation's own telemetry — DNS questions,
 *  non-private IPs, and file hashes other than the sample's own. */
export interface DetonateExtractedIocs {
  domains: string[];
  ips: string[];
  file_hashes: string[];
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
  vm_disk_image?: string;
  vm_has_internet: boolean;
  vm_instance_name?: string;

  elastic_agent_id?: string;
  elastic_endpoint_id?: string;
  /**
   * SECURITY: the service returns the sandbox's Fleet enrollment token in
   * clear. Declared only so `redactDetonateTask` can strip it; nothing in
   * Kibana may read or forward it.
   */
  agent_fleet_enrollment_token?: string;

  production_endpoint_alerts_count?: number;
  production_endpoint_alert_groups: DetonateEndpointAlertsGroup[];
  diagnostic_endpoint_alerts_count?: number;
  diagnostic_endpoint_alert_groups: DetonateEndpointAlertsGroup[];
  production_detection_alerts_count?: number;
  production_detection_alert_groups: DetonateDetectionAlertsGroup[];

  /**
   * Process events recorded for the run (`event.kind: 'event'` docs), the raw
   * material Session View renders in the detonation flyout. Detail-read only:
   * the service strips this array from list responses, where the count below
   * is what the list rows show.
   */
  process_events?: DetonateSandboxEventDoc[];
  process_events_count?: number;
}

/** The task without fields Kibana must never surface. */
export const redactDetonateTask = (task: DetonateTask): DetonateTask => {
  const { agent_fleet_enrollment_token: _token, ...rest } = task;
  return rest;
};

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

/** A page of tasks. The service reports no total; a short page is the last. */
export interface DetonateTaskSearchResponse {
  tasks: DetonateTask[];
  query_string?: string | null;
  offset: number;
  size: number;
  order: 'asc' | 'desc';
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
 * alerts is a real and meaningful result (no malicious behavior was observed —
 * not proof the sample is benign; possibly a detection gap) — it is not an
 * error, and surfaces must not present it as one.
 */
export const detonationWasQuiet = (task: DetonateTask): boolean =>
  isDetonationComplete(task) && !isDetonationFailed(task) && totalDetonationAlerts(task) === 0;

/**
 * Diagnostic-only event codes: behaviors the diagnostic (unblocklisted) side
 * of the run saw that production Defend never fired on. This is the coverage
 * gap the diagnostic telemetry exists to expose — each entry is behavior a
 * blocklist entry suppressed or a rule missed, and the FP-validation tier's
 * exception proposals target exactly this set.
 *
 * Keyed by event_code: the codes are what a rule or exception entry would
 * target, and the same code can fire from several groups (the set, not the
 * multiset).
 */
export const diagnosticOnlyEventCodes = (task: DetonateTask): string[] => {
  const productionCodes = new Set(
    task.production_endpoint_alert_groups.map((group) => group.event_code)
  );
  return [...new Set(task.diagnostic_endpoint_alert_groups.map((group) => group.event_code))]
    .filter((code) => !productionCodes.has(code))
    .sort();
};

/* -------------------------------------------------------------------------- */
/* Learning tier (F7)                                                          */
/* -------------------------------------------------------------------------- */

/**
 * How many consecutive runs — newest first — were quiet. The proposal
 * threshold reads this, so the derivation lives here where it is unit-tested,
 * not in the component that renders the button.
 */
export const quietRunStreak = (runs: readonly DetonateTask[]): number => {
  let streak = 0;
  for (const run of runs) {
    if (!detonationWasQuiet(run)) break;
    streak += 1;
  }
  return streak;
};

/**
 * The runs a streak counts when one run is being viewed: its completed
 * siblings plus the viewed run itself, newest first. The viewed run is merged
 * in rather than trusted to be in `history`, which can predate its completion.
 */
export const runHistoryIncluding = (
  current: DetonateTask,
  history: readonly DetonateTask[]
): DetonateTask[] => {
  const siblings = history.filter((run) => run.id !== current.id);
  const counted =
    isDetonationComplete(current) && !isDetonationFailed(current)
      ? [current, ...siblings]
      : siblings;
  return counted.sort((a, b) => b.created_at.localeCompare(a.created_at));
};

/** The evidence bar an exception/trusted-app proposal must clear. */
export const PROPOSAL_QUIET_STREAK_THRESHOLD = 3;

/**
 * The proposal text an analyst pastes into an exception or trusted-app
 * request. Comment-and-link only by design: the proposal carries the evidence,
 * never the write — creating the exception stays an analyst action in the
 * Artifacts UI, where its authz and audit trail live.
 */
export const exceptionProposalComment = (
  hash: string,
  runs: readonly DetonateTask[],
  appPath: string = DETONATE_PROTOTYPE_APP_PATH
): string =>
  [
    `Detonate proposal: ${quietRunStreak(
      runs
    )} consecutive detonation(s) of this sample completed quiet (no alerts, no malicious behavior observed).`,
    `Sample: ${hash}`,
    `Runs (newest first): ${runs
      .slice(0, PROPOSAL_QUIET_STREAK_THRESHOLD)
      .map((run) => `${run.created_at} — ${run.id} (${appPath}/${run.id})`)
      .join('; ')}`,
    'A quiet detonation is not proof the sample is benign — treat this as evidence toward an exception or trusted-application entry, to be reviewed before anything is enforced.',
  ].join('\n');

/* -------------------------------------------------------------------------- */
/* Verdict                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What a finished detonation says about the sample. `malicious` (production
 * endpoint alerts or detection rule hits) and `quiet` (no alerts) are
 * statements about the sample's behaviour in the sandbox; `inconclusive` means
 * the run cannot support either (it failed, has not finished, or raised only
 * diagnostic alerts) and must never be read as "benign".
 */
export const DETONATE_VERDICTS = ['malicious', 'quiet', 'inconclusive'] as const;
export type DetonateVerdictName = (typeof DETONATE_VERDICTS)[number];

/** Prefix the prototype uses on the tags it writes to alerts and runs. */
export const DETONATE_TAG_PREFIX = 'detonate:' as const;

/** Tag an alert carries once a detonation verdict has been applied to it. */
export const detonateVerdictTag = (verdict: DetonateVerdictName): string =>
  `${DETONATE_TAG_PREFIX}${verdict}`;

/** Prefix of the tag that ties a run back to the alert it was started from
 * (`alert:<alert_id>`). Written by the alert action; read by the verdict
 * derivation and by run-list filters.
 */
export const ALERT_TAG_PREFIX = 'alert:' as const;

/**
 * Tags a validated detection-rule draft carries, on top of its drafted tags:
 * the trial marker, the run it was drafted for, and a per-draft candidate id
 * that later steps use to find the created rule back. Written only by the
 * `validate_draft` guard; read by proposal comments and `_find` filters.
 */
export const DETONATE_TRIAL_TAG = `${DETONATE_TAG_PREFIX}trial` as const;
export const detonateTaskTag = (taskId: string): string => `${DETONATE_TAG_PREFIX}${taskId}`;
export const detonateCandidateTag = (candidateId: string): string =>
  `${DETONATE_TAG_PREFIX}candidate:${candidateId}`;

/** The `alert:<id>` tag for one alert. */
export const alertRunTag = (alertId: string): string => `${ALERT_TAG_PREFIX}${alertId}`;

/** The alert id a run's `alert:<id>` tag points at, when it has one. */
export const parseAlertTag = (tags: string[]): string | undefined => {
  const alertTag = tags.find((tag) => tag.startsWith(ALERT_TAG_PREFIX));
  const alertId = alertTag?.slice(ALERT_TAG_PREFIX.length);
  return alertId ? alertId : undefined;
};

/** Every alert id a run's `alert:<id>` tags point at, deduplicated. */
export const parseAlertTags = (tags: readonly string[]): string[] => [
  ...new Set(
    tags
      .filter((tag) => tag.startsWith(ALERT_TAG_PREFIX))
      .map((tag) => tag.slice(ALERT_TAG_PREFIX.length))
      .filter((alertId) => alertId.length > 0)
  ),
];

/**
 * Prefix of the tag that records the Kibana space a run was submitted from
 * (`space:<space_id>`). The detonation service has no notion of spaces, so
 * Kibana writes this tag on submit and filters on it on every read.
 */
export const SPACE_TAG_PREFIX = 'space:' as const;

/** The `space:<id>` tag for one space. */
export const spaceRunTag = (spaceId: string): string => `${SPACE_TAG_PREFIX}${spaceId}`;

/** Whether a run is visible from `spaceId`. A run without a space tag is visible from none. */
export const runBelongsToSpace = (tags: string[], spaceId: string): boolean =>
  tags.includes(spaceRunTag(spaceId));

/**
 * The sample the demo seeds a guaranteed-quiet run for. Its digest matches
 * no recording, so the replay executor resolves it to the negative control —
 * a real run that raised nothing — which makes `detonate:quiet` reproducible
 * on camera. The simulator's contract-parity suite pins this exact value.
 */
export const DETONATE_QUIET_SEED_SHA256 =
  '9e098f5b65ccb4ecfc0b3a2c790b3f6c3b41fbf561e6bd2d7782d0b8c7f2cf1e' as const;

/** Prefix every detonate-written alert note carries, so it can be found. */
export const DETONATE_NOTE_MARKER = '[detonate] ' as const;

/* -------------------------------------------------------------------------- */
/* Prior-run lookup                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Prior-run lookup route. The service has no reputation endpoint, so "have we
 * seen this sample" is answered from this space's own earlier detonations.
 */
export const DETONATE_PRIOR_RUNS_PATH = `${DETONATE_PROTOTYPE_API}/prior_runs` as const;

/** How many of a hash's newest runs the lookup reads. */
export const DETONATE_PRIOR_RUNS_LOOKBACK = 20;

/** Monthly allowance route: this space's submissions in the current UTC month. */
export const DETONATE_USAGE_PATH = `${DETONATE_PROTOTYPE_API}/usage` as const;

export const DETONATE_DEFAULT_MONTHLY_ALLOWANCE = 500;

/** The service's `GET /tasks` page ceiling. */
export const DETONATE_USAGE_PAGE_SIZE = 200;

/**
 * The count reads at most this many pages. The allowance is capped at the same
 * number of runs, so a count that stops here is already at or over it.
 */
export const DETONATE_USAGE_MAX_PAGES = 50;
export const DETONATE_MAX_MONTHLY_ALLOWANCE = DETONATE_USAGE_PAGE_SIZE * DETONATE_USAGE_MAX_PAGES;

/* -------------------------------------------------------------------------- */
/* Worker handoffs                                                             */
/* -------------------------------------------------------------------------- */

/** Where the Hunt and Detection Workers pick up detonated alerts (server `handoffs.ts`). */
export const DETONATE_HANDOFFS_PATH = `${DETONATE_PROTOTYPE_API}/handoffs` as const;

export const detonateRunHandoffPath = (taskId: string) =>
  `${DETONATE_RUNS_PATH}/${encodeURIComponent(taskId)}/handoff` as const;

export const DETONATE_HANDOFF_MARKERS = [
  'detonate:hunt-requested',
  'detonate:hunt-done',
  'detonate:coverage-requested',
  'detonate:coverage-reviewed',
  'detonate:coverage-in-progress',
] as const;
export type DetonateHandoffMarker = (typeof DETONATE_HANDOFF_MARKERS)[number];

/**
 * The fifth marker is coverage-only: it spans the window between a sweep
 * dispatching the rule-creation copy and that copy's always-run terminal
 * step clearing it. While it is set, the coverage sweep leaves the run
 * alone — a parked copy owns it, and its per-task drop key would silently
 * discard any second copy anyway. A re-request that lands inside the window
 * stays queued (`coverage-requested` remains set) and is picked up by the
 * first sweep after the copy finishes.
 */
export const DETONATE_COVERAGE_IN_PROGRESS_MARKER: DetonateHandoffMarker =
  'detonate:coverage-in-progress';

export const DETONATE_HANDOFF_KINDS = ['hunt', 'coverage'] as const;
export type DetonateHandoffKind = (typeof DETONATE_HANDOFF_KINDS)[number];

/** Runs returned per list call; a Worker tick handles at most this many. */
export const DETONATE_HANDOFF_MAX_TASKS = 5;

export const detonateHandoffMarkers = (
  kind: DetonateHandoffKind
): { requested: DetonateHandoffMarker; done: DetonateHandoffMarker } =>
  kind === 'hunt'
    ? { requested: 'detonate:hunt-requested', done: 'detonate:hunt-done' }
    : { requested: 'detonate:coverage-requested', done: 'detonate:coverage-reviewed' };

/**
 * An alert is waiting for a Worker when the Worker was asked for explicitly,
 * or when the alert is malicious and the Worker has not marked it done. An
 * explicit request wins over an earlier done marker. A coverage copy parked
 * on the run suspends the coverage handoff for as long as the copy lives:
 * the sweep must not dispatch a second copy the parked one's drop key would
 * silently discard, and a re-request that lands meanwhile stays queued.
 */
export const needsDetonateHandoff = (
  kind: DetonateHandoffKind,
  workflowTags: readonly string[]
): boolean => {
  if (kind === 'coverage' && workflowTags.includes(DETONATE_COVERAGE_IN_PROGRESS_MARKER)) {
    return false;
  }
  const { requested, done } = detonateHandoffMarkers(kind);
  return (
    workflowTags.includes(requested) ||
    (workflowTags.includes(detonateVerdictTag('malicious')) && !workflowTags.includes(done))
  );
};

export interface DetonateHandoff {
  task_id: string;
  sha256: string;
  /** This space's alerts whose newest run is this one, oldest first. */
  alert_ids: string[];
}

export interface DetonateHandoffList {
  handoffs: DetonateHandoff[];
}

export interface DetonateHandoffUpdate {
  /** Alerts whose markers were rewritten. */
  updated: number;
}

/* -------------------------------------------------------------------------- */
/* Sandbox telemetry                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Sandbox alerts are copied into one hidden data stream per space, kept apart
 * from production alerts. The `.kibana-` prefix is what lets Kibana's internal
 * user create and write the stream; analysts need an explicit grant on the
 * exact name, because wildcards do not expand to hidden streams.
 */
export const DETONATE_SANDBOX_STREAM_PREFIX = '.kibana-detonate-sandbox-' as const;
export const DETONATE_SANDBOX_TEMPLATE_NAME = 'kibana-detonate-sandbox' as const;
export const DETONATE_SANDBOX_RETENTION = '30d' as const;

/** Kibana space ids are already lowercase `[a-z0-9_-]`; anything else cannot name a stream. */
const SANDBOX_SPACE_ID_PATTERN = /^[a-z0-9_-]{1,128}$/;

export const detonateSandboxStreamName = (spaceId: string): string => {
  if (!SANDBOX_SPACE_ID_PATTERN.test(spaceId)) {
    throw new Error(`Space id "${spaceId}" cannot name a sandbox data stream.`);
  }
  return `${DETONATE_SANDBOX_STREAM_PREFIX}${spaceId}`;
};

/** Copy a run's sandbox alerts into this space's sandbox stream. */
export const detonateRunIngestPath = (taskId: string) =>
  `${DETONATE_RUNS_PATH}/${encodeURIComponent(taskId)}/ingest` as const;

/** Copy a run's process events into the stream and get the Session View config. */
export const detonateRunSessionPath = (taskId: string) =>
  `${DETONATE_RUNS_PATH}/${encodeURIComponent(taskId)}/session` as const;

/**
 * Everything the Session View tab needs for one run. Null-shaped (no
 * `session_entity_id`) when the run recorded no process events: the tab
 * renders its empty state rather than an error, because a run with no
 * recorded behavior is a fact about the run, not a failure.
 */
export interface DetonateRunSessionResult {
  task_id: string;
  /** The space's sandbox stream — the index Session View queries. */
  index: string;
  /** The run's entry leader: Session View's tree root. Absent when no events. */
  session_entity_id?: string;
  /** Earliest recorded event; lower-bounds Session View's time range. */
  session_start_time?: string;
  /** Process events copied into the stream by this call (idempotent re-copy). */
  ingested: number;
  duplicates: number;
  dropped: number;
  failed: number;
}

export interface DetonateSandboxIngestResult {
  task_id: string;
  stream: string;
  ingested: number;
  /** Already copied by an earlier call; the copy is idempotent. */
  duplicates: number;
  /** No `@timestamp`, so the doc cannot be placed on a timeline. */
  dropped: number;
  failed: number;
  /** Alert kinds whose read failed; their docs are missing from the counts. */
  unread_kinds: DetonateAlertKind[];
}

/** Sandbox-match count for one run, run by the route as the internal user. */
export interface DetonateSandboxCountResult {
  count: number;
}

/* -------------------------------------------------------------------------- */
/* Behavior diff between two runs of the same sample (N2)                      */
/* -------------------------------------------------------------------------- */

/** Copy a run's alerts and events, then answer how its behavior differs from a prior run's. */
export const detonateRunDiffPath = (taskId: string) =>
  `${DETONATE_RUNS_PATH}/${encodeURIComponent(taskId)}/diff` as const;

/**
 * ES|QL groups docs without an `event.category` under null; the diff keeps
 * them as an explicit class rather than dropping them, because diagnostic
 * telemetry legitimately carries no category.
 */
export const DETONATE_UNCATEGORIZED = 'uncategorized' as const;

export interface DetonateCategoryCount {
  category: string;
  count: number;
}

/** One run's side of the diff: what was measured, not how it compares. */
export interface DetonateRunDiffSide {
  task_id: string;
  verdict: DetonateVerdictName;
  /** Per-category doc counts, sorted by category name. */
  categories: DetonateCategoryCount[];
}

/** One category's comparison, current run against the prior one. */
export interface DetonateCategoryDelta {
  category: string;
  current: number;
  prior: number;
  /** current - prior; a category present on one side only diffs its whole count. */
  delta: number;
}

export interface DetonateRunDiffResult {
  task_id: string;
  /** The run `current` was compared against. */
  against_task_id: string;
  /**
   * False when `against` was caller-chosen but is not an earlier completed
   * run of the same sample in this space; the diff still answers (against an
   * unrelated run is a valid question) but the UI must not present it as
   * "previous run of this sample".
   */
  comparable: boolean;
  current: DetonateRunDiffSide;
  prior: DetonateRunDiffSide;
  /** Union of both sides' categories, largest absolute delta first. */
  delta: DetonateCategoryDelta[];
}

/**
 * A first run of a sample has no earlier run to diff against. The shape says
 * exactly that, so the card renders its empty state instead of a zero-delta
 * table that would read as "behavior unchanged".
 */
export interface DetonateRunDiffEmpty {
  task_id: string;
  reason: 'no-prior-run';
}

/**
 * Union diff of two per-category count maps, sorted most-changed first. Pure:
 * the route computes it once server-side, and the tests pin the ordering and
 * the null-category naming (`uncategorized`) here.
 */
export const diffCategoryCounts = (
  current: Readonly<Record<string, number>>,
  prior: Readonly<Record<string, number>>
): DetonateCategoryDelta[] => {
  const categories = new Set([...Object.keys(current), ...Object.keys(prior)]);
  return [...categories]
    .map((category) => {
      const c = current[category] ?? 0;
      const p = prior[category] ?? 0;
      return { category, current: c, prior: p, delta: c - p };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.category.localeCompare(b.category));
};

export interface DetonateUsage {
  /** Runs submitted from this space since `since`. Every submission counts. */
  used: number;
  allowance: number;
  /** 00:00 UTC on the 1st of the current month. */
  since: string;
  /** 00:00 UTC on the 1st of the next month. */
  resetsAt: string;
  /** The count stopped at the page cap, so `used` is a lower bound. */
  truncated: boolean;
}

/** The allowance window that contains `now`: this UTC month. */
export const detonateAllowanceWindow = (now: Date): { since: string; resetsAt: string } => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    since: new Date(Date.UTC(year, month, 1)).toISOString(),
    // Date.UTC rolls month 12 over into January of the next year.
    resetsAt: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  };
};

export const isAllowanceExhausted = ({
  used,
  allowance,
}: Pick<DetonateUsage, 'used' | 'allowance'>) => used >= allowance;

/**
 * `known-malicious` means the newest completed run of this sample in this
 * space was malicious. `unknown` is honest uncertainty — no run, or no
 * malicious one — and must route the sample to a detonation, never be read as
 * benign.
 */
export const DETONATE_PRIOR_RUN_STATUSES = ['known-malicious', 'unknown'] as const;
export type DetonatePriorRunStatus = (typeof DETONATE_PRIOR_RUN_STATUSES)[number];

export const DETONATE_PRIOR_RUN_SOURCE = 'prior-detonation' as const;

/** The lookup's answer for one digest. */
export interface DetonatePriorRunResponse {
  sha256: string;
  status: DetonatePriorRunStatus;
  source: typeof DETONATE_PRIOR_RUN_SOURCE;
  /** The newest completed run the status was read from, when there is one. */
  last_task_id?: string;
  last_verdict?: DetonateVerdictName;
  last_seen?: string;
}

/** A value quoted for an ES `query_string` phrase. */
export const quoteQueryValue = (value: string): string =>
  `"${value.replace(/[\\"]/g, (char) => `\\${char}`)}"`;

/** The service-side search for one space's runs, optionally narrowed. */
export const spaceTaskQuery = (
  spaceId: string,
  filters: { sampleHash?: string; alertId?: string } = {}
): string =>
  [
    `tags:${quoteQueryValue(spaceRunTag(spaceId))}`,
    ...(filters.sampleHash ? [`sample_hash:${quoteQueryValue(filters.sampleHash)}`] : []),
    ...(filters.alertId ? [`tags:${quoteQueryValue(alertRunTag(filters.alertId))}`] : []),
  ].join(' AND ');

/** One detonation's conclusion, shaped for workflows, notes and tags. */
export interface DetonateVerdict {
  verdict: DetonateVerdictName;
  task_id: string;
  /** The alert this run was started from, parsed off its `alert:<id>` tag. */
  alert_id?: string;
  total_alerts_count: number;
  endpoint_alert_event_codes: string[];
  detection_rule_names: string[];
  /**
   * The one-line human summary. This is the body of the alert note the apply
   * step writes, so it must stand alone without the surrounding UI.
   */
  evidence: string;
  /** The tag the apply step puts on the alert — `detonate:<verdict>`. */
  suggested_tag: string;
  /** The sandbox OS this verdict's artifacts target, when the task recorded one. */
  vm_os_family?: DetonateVmOsFamily;
}

/**
 * Derive the verdict from a task. Pure: no IO, no clock, no randomness —
 * the same task always yields the same verdict, which is what makes the
 * derivation unit-testable and the apply step a dumb writer.
 */
export const deriveDetonateVerdict = (task: DetonateTask): DetonateVerdict => {
  const eventCodes = [
    ...new Set(
      [...task.production_endpoint_alert_groups, ...task.diagnostic_endpoint_alert_groups].map(
        (group) => group.event_code
      )
    ),
  ];
  const ruleNames = [
    ...new Set(task.production_detection_alert_groups.map((group) => group.kibana_alert_rule_name)),
  ];
  const total = totalDetonationAlerts(task);
  const hardEvidence =
    (task.production_endpoint_alerts_count ?? 0) + (task.production_detection_alerts_count ?? 0);

  let verdict: DetonateVerdictName;
  let evidence: string;

  if (isDetonationFailed(task)) {
    verdict = 'inconclusive';
    evidence = `Detonation failed at ${task.last_worker_name}${
      task.last_worker_status_details
        ? ` (${task.last_worker_status_details})`
        : ' — the sandbox never finished, so this says nothing about the sample.'
    }`;
  } else if (!isDetonationComplete(task)) {
    verdict = 'inconclusive';
    evidence = `Detonation has not completed (last: ${task.last_worker_name}/${task.last_worker_status}).`;
  } else if (total === 0) {
    verdict = 'quiet';
    evidence =
      'Detonation completed and raised no alerts — no malicious behavior was observed in the ' +
      'sandbox, which is not proof the sample is benign (nothing may have detected it). ' +
      'Suggest reviewing before closing the alert.';
  } else if (hardEvidence === 0) {
    // Diagnostic alerts alone show Defend observed the behavior, not that a
    // customer's Defend or any rule would have flagged it — not enough to
    // close alerts as true positives or blocklist the sample.
    verdict = 'inconclusive';
    const codes = eventCodes.length > 0 ? eventCodes.join(', ') : 'none';
    evidence =
      `Detonation raised ${total} diagnostic alert(s) only: ${codes}. No production endpoint ` +
      'alerts and no detection rule hits, so the behavior is suspicious but unconfirmed — ' +
      'review the diagnostic events before acting on the alert.';
  } else {
    verdict = 'malicious';
    const codes = eventCodes.length > 0 ? eventCodes.join(', ') : 'none';
    const rules = ruleNames.length > 0 ? ruleNames.join(', ') : 'none';
    evidence = `Detonation raised ${total} alert(s): ${codes} (detection rules: ${rules}).`;
  }

  return {
    verdict,
    task_id: task.id,
    ...(parseAlertTag(task.tags) ? { alert_id: parseAlertTag(task.tags) } : {}),
    // Passed through for consumers that need the sandbox OS — e.g. an
    // endpoint blocklist artifact is compiled per OS and accepts exactly one.
    ...(task.vm_os_family ? { vm_os_family: task.vm_os_family } : {}),
    total_alerts_count: total,
    endpoint_alert_event_codes: eventCodes,
    detection_rule_names: ruleNames,
    evidence,
    suggested_tag: detonateVerdictTag(verdict),
  };
};

export const DETONATE_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type DetonateConfidence = (typeof DETONATE_CONFIDENCE_LEVELS)[number];

/**
 * How much weight a verdict carries. `malicious` rests on production alerts or
 * rule hits, so it is high; `quiet` is a real observation that proves nothing
 * about what was not detected, so it is medium; `inconclusive` is low.
 */
export const detonationConfidence = (verdict: DetonateVerdictName): DetonateConfidence => {
  switch (verdict) {
    case 'malicious':
      return 'high';
    case 'quiet':
      return 'medium';
    default:
      return 'low';
  }
};

/* -------------------------------------------------------------------------- */
/* State                                                                       */
/* -------------------------------------------------------------------------- */

/** States read off a run. */
export const DETONATION_RUN_STATES = [
  'running',
  'complete',
  'failed',
  'inconclusive',
  'escalated',
] as const;
export type DetonationRunState = (typeof DETONATION_RUN_STATES)[number];

/** States of an alert that has no run to read them from. */
export const DETONATION_ALERT_STATES = [
  'queued',
  'not_analyzed',
  'allowance_reached',
  'unsupported_os',
] as const;
export type DetonationAlertState = (typeof DETONATION_ALERT_STATES)[number];

export const DETONATION_STATES = [...DETONATION_RUN_STATES, ...DETONATION_ALERT_STATES] as const;
export type DetonationState = (typeof DETONATION_STATES)[number];

/**
 * Run tag for a run handed to a partner sandbox. No partner integration exists,
 * so only fixtures carry it.
 */
export const DETONATE_ESCALATED_TAG = `${DETONATE_TAG_PREFIX}escalated` as const;

/** Alert tag a Worker writes when it chose to detonate an alert but has not submitted it yet. */
export const DETONATE_QUEUED_TAG = `${DETONATE_TAG_PREFIX}queued` as const;

export const deriveDetonationRunState = (task: DetonateTask): DetonationRunState => {
  if (!isDetonationComplete(task)) return 'running';
  if (task.tags.includes(DETONATE_ESCALATED_TAG)) return 'escalated';
  if (isDetonationFailed(task)) return 'failed';
  return deriveDetonateVerdict(task).verdict === 'inconclusive' ? 'inconclusive' : 'complete';
};

/** ECS `host.os.type` to the service's OS family; `undefined` for one it has no VM for. */
export const detonateOsFamilyFromHostOsType = (
  hostOsType: string
): DetonateVmOsFamily | undefined => {
  switch (hostOsType.toLowerCase()) {
    case 'linux':
      return 'linux';
    case 'windows':
      return 'windows';
    case 'macos':
      return 'darwin';
    default:
      return undefined;
  }
};

export interface DetonationStateInput {
  /** The alert's latest run, if it has one. */
  run?: DetonateTask;
  alertTags?: readonly string[];
  /** ECS `host.os.type` of the alert. Missing means "cannot tell", not "unsupported". */
  hostOsType?: string;
  allowanceExhausted?: boolean;
  supportedOsFamilies?: readonly DetonateVmOsFamily[];
}

/**
 * The one state every surface shows for a run or an alert. A run always wins;
 * without one, an OS the sandbox cannot run blocks everything else, then the
 * monthly allowance, then a Worker's queue marker.
 */
export const deriveDetonationState = ({
  run,
  alertTags = [],
  hostOsType,
  allowanceExhausted = false,
  supportedOsFamilies = DETONATE_VM_OS_FAMILIES,
}: DetonationStateInput): DetonationState => {
  if (run) return deriveDetonationRunState(run);
  if (hostOsType) {
    const family = detonateOsFamilyFromHostOsType(hostOsType);
    if (!family || !supportedOsFamilies.includes(family)) return 'unsupported_os';
  }
  if (allowanceExhausted) return 'allowance_reached';
  if (alertTags.includes(DETONATE_QUEUED_TAG)) return 'queued';
  return 'not_analyzed';
};

/**
 * Read a prior-run status off a hash's runs, newest first. Runs from other
 * spaces are dropped again here even though the query already filtered them:
 * the service's search is not the isolation boundary.
 */
export const derivePriorRunLookup = (
  sha256: string,
  tasks: readonly DetonateTask[],
  spaceId: string
): DetonatePriorRunResponse => {
  const lastCompleted = tasks.find(
    (task) =>
      runBelongsToSpace(task.tags, spaceId) &&
      task.sample_hash?.toLowerCase() === sha256 &&
      isDetonationComplete(task)
  );
  if (!lastCompleted) {
    return { sha256, status: 'unknown', source: DETONATE_PRIOR_RUN_SOURCE };
  }
  const { verdict } = deriveDetonateVerdict(lastCompleted);
  return {
    sha256,
    status: verdict === 'malicious' ? 'known-malicious' : 'unknown',
    source: DETONATE_PRIOR_RUN_SOURCE,
    last_task_id: lastCompleted.id,
    last_verdict: verdict,
    last_seen: lastCompleted.created_at,
  };
};

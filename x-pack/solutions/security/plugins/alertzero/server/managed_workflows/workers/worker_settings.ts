/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  SYSTEM_SECURITY_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_ID,
  SYSTEM_SECURITY_WORKER_DETECTION_RULE_COVERAGE_ID,
  SYSTEM_SECURITY_WORKER_DETECTION_RULE_TUNING_ID,
  SYSTEM_SECURITY_WORKER_FLOOR_ALERT_TRIAGE_ID,
  SYSTEM_SECURITY_WORKER_FLOOR_ATTACK_DISCOVERY_ID,
  SYSTEM_SECURITY_WORKER_FORENSICS_DETONATE_SAMPLE_ID,
  SYSTEM_SECURITY_WORKER_FORENSICS_ENDPOINT_ANALYSIS_ID,
  applyWorkerSettingsWrite,
  createDefaultWorkerSettings,
  formatCrossFieldIssues,
  formatWorkerSettingsIssues,
  getCompleteWorkerSettingsSchema,
  getWorkerSettingsDeclaration,
  upgradeStoredWorkerSettings,
  type WorkerSettings,
} from '@kbn/alertzero-common';
import type { ManagedWorkflowTemplateValues } from '@kbn/workflows/managed';
import type { WorkerSettingsRegistration } from './types';

type RegisteredWorkerId =
  | typeof SYSTEM_SECURITY_WORKER_FLOOR_ALERT_TRIAGE_ID
  | typeof SYSTEM_SECURITY_WORKER_FLOOR_ATTACK_DISCOVERY_ID
  | typeof SYSTEM_SECURITY_WORKER_FORENSICS_DETONATE_SAMPLE_ID
  | typeof SYSTEM_SECURITY_WORKER_FORENSICS_ENDPOINT_ANALYSIS_ID
  | typeof SYSTEM_SECURITY_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_ID
  | typeof SYSTEM_SECURITY_WORKER_DETECTION_RULE_TUNING_ID
  | typeof SYSTEM_SECURITY_WORKER_DETECTION_RULE_COVERAGE_ID;

const WORKER_SETTINGS_VERSIONS: Record<RegisteredWorkerId, number> = {
  // A bump makes `parseWorkerValues` reject every document stored at the previous version, even
  // after `upgradeStoredWorkerSettings`.
  [SYSTEM_SECURITY_WORKER_FLOOR_ALERT_TRIAGE_ID]: 1,
  [SYSTEM_SECURITY_WORKER_FLOOR_ATTACK_DISCOVERY_ID]: 1,
  // v1 introduces the worker; the retired Floor sweep never shipped beyond
  // this prototype branch, so there is no stored-document migration path.
  [SYSTEM_SECURITY_WORKER_FORENSICS_DETONATE_SAMPLE_ID]: 1,
  [SYSTEM_SECURITY_WORKER_FORENSICS_ENDPOINT_ANALYSIS_ID]: 1,
  [SYSTEM_SECURITY_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_ID]: 1,
  [SYSTEM_SECURITY_WORKER_DETECTION_RULE_TUNING_ID]: 1,
  [SYSTEM_SECURITY_WORKER_DETECTION_RULE_COVERAGE_ID]: 1,
};

/**
 * Live `xpack.alertzero.detonatePrototypeDev`, set once at plugin start. Held here rather
 * than threaded through every caller because every template-values build in this plugin
 * goes through `toTemplateValues`. The rendered Detonate entry steps read it through the
 * `detonatePrototypeDev` template value; the platform persists template values verbatim, so
 * a stored copy is stripped on read below and re-injected from this value on every write.
 */
let detonatePrototypeDev = false;

export const setDetonatePrototypeDev = (enabled: boolean): void => {
  detonatePrototypeDev = enabled;
};

/**
 * The only Workers whose YAML carries the Detonate prototype entry gate. The value is
 * injected for these alone so every other Worker's template values keep their exact shape.
 */
const DETONATE_ENTRY_WORKER_IDS: ReadonlySet<string> = new Set([
  SYSTEM_SECURITY_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_ID,
  SYSTEM_SECURITY_WORKER_DETECTION_RULE_COVERAGE_ID,
]);

/**
 * Template values mirror the settings API: shared fields flat (with the legacy `autonomyLevel`
 * key the YAML templates read), Worker-specific fields nested under `extras`.
 */
export const toTemplateValues = (
  workerId: RegisteredWorkerId,
  settings: WorkerSettings
): ManagedWorkflowTemplateValues => ({
  settingsVersion: WORKER_SETTINGS_VERSIONS[workerId],
  autonomyLevel: settings.autonomy,
  ...(settings.scheduleInterval === undefined
    ? {}
    : { scheduleInterval: settings.scheduleInterval }),
  ...(settings.serviceAccountId === undefined
    ? {}
    : { serviceAccountId: settings.serviceAccountId }),
  ...(settings.extras === undefined ? {} : { extras: settings.extras }),
  // Render-time only: the live `xpack.alertzero.detonatePrototypeDev` value, so the
  // Detonate entry steps render per the current boot. A stored copy is stripped on
  // read below; a settings write can never carry it (the PUT schema is strict).
  ...(DETONATE_ENTRY_WORKER_IDS.has(workerId) ? { detonatePrototypeDev } : {}),
});

/**
 * Reads persisted template values after the same upgrade the Worker's renderer applies, so the
 * settings page and the running workflow see the same values. Anything else present is left as
 * stored, so an out-of-range value still fails here and the Worker projects as unavailable.
 */
const parseWorkerValues = (
  workerId: RegisteredWorkerId,
  stored: Record<string, unknown>
): WorkerSettings => {
  const raw = upgradeStoredWorkerSettings(getWorkerSettingsDeclaration(workerId), stored);
  const currentVersion = WORKER_SETTINGS_VERSIONS[workerId];
  const {
    settingsVersion,
    autonomyLevel,
    scheduleInterval,
    serviceAccountId,
    extras,
    // Render-time value: a stored copy is leftover from an install-time write, not
    // user data. Stripped rather than rejected so the platform's verbatim persist
    // cannot brick the read; the live value is re-injected by `toTemplateValues`.
    detonatePrototypeDev: _detonatePrototypeDev,
    ...unsupported
  } = raw;
  if (settingsVersion !== undefined && settingsVersion !== currentVersion) {
    throw new Error(
      `Unsupported settings version for AlertZero worker "${workerId}": ${String(settingsVersion)}`
    );
  }
  const unsupportedKeys = Object.keys(unsupported);
  if (unsupportedKeys.length > 0) {
    throw new Error(
      `AlertZero worker "${workerId}" settings contain unsupported fields: ${unsupportedKeys.join(
        ', '
      )}`
    );
  }

  const candidate = {
    workerId,
    autonomy: autonomyLevel,
    ...(scheduleInterval === undefined ? {} : { scheduleInterval }),
    ...(typeof serviceAccountId === 'string' && serviceAccountId.length > 0
      ? { serviceAccountId }
      : {}),
    ...(extras === undefined ? {} : { extras }),
  };
  const parsed = getCompleteWorkerSettingsSchema(workerId).safeParse(candidate);
  if (!parsed.success) {
    throw new Error(
      `AlertZero worker "${workerId}" settings are invalid: ${formatWorkerSettingsIssues(
        parsed.error
      )}`
    );
  }
  return parsed.data;
};

export const createWorkerSettingsRegistration = (
  workerId: RegisteredWorkerId
): WorkerSettingsRegistration => ({
  createDefaultValues: () => toTemplateValues(workerId, createDefaultWorkerSettings(workerId)),
  applyPatch: (raw, patch) => {
    const declaration = getWorkerSettingsDeclaration(workerId);
    if (declaration.scheduleInterval?.readOnly && patch.scheduleInterval !== undefined) {
      return { invalid: 'scheduleInterval: is read-only for this worker' };
    }
    const next = applyWorkerSettingsWrite(parseWorkerValues(workerId, raw), patch);
    const result = getCompleteWorkerSettingsSchema(workerId).safeParse(next);
    if (!result.success) {
      return { invalid: formatWorkerSettingsIssues(result.error) };
    }
    // Checked on write only: a stored combination the rule would refuse still has to be readable.
    const crossFieldIssues = declaration.crossFieldIssues?.(result.data) ?? [];
    if (crossFieldIssues.length > 0) {
      return { invalid: formatCrossFieldIssues(crossFieldIssues) };
    }
    return { values: toTemplateValues(workerId, result.data) };
  },
  toSettings: (raw) => parseWorkerValues(workerId, raw),
});

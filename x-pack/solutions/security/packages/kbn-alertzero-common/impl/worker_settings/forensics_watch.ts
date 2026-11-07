/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DETONATE_SAMPLE_WORKER_SETTINGS_DEFAULTS,
  ENDPOINT_ANALYSIS_WORKER_SETTINGS_DEFAULTS,
} from '@kbn/workflows/managed/definitions/alertzero/worker_settings_defaults';
import {
  SYSTEM_SECURITY_WORKER_FORENSICS_DETONATE_SAMPLE_ID,
  SYSTEM_SECURITY_WORKER_FORENSICS_ENDPOINT_ANALYSIS_ID,
} from '../../constants';
import type { WorkerSettingsDeclaration } from './types';

export const ENDPOINT_ANALYSIS_SETTINGS: WorkerSettingsDeclaration = {
  workerId: SYSTEM_SECURITY_WORKER_FORENSICS_ENDPOINT_ANALYSIS_ID,
  allowedAutonomyLevels: ENDPOINT_ANALYSIS_WORKER_SETTINGS_DEFAULTS.allowedAutonomyLevels,
};

/**
 * Detonate sample. Manual keeps every detonation behind a person; Supervised
 * auto-detonates high/critical file alerts with no verdict yet, under the
 * monthly allowance.
 */
export const DETONATE_SAMPLE_SETTINGS: WorkerSettingsDeclaration = {
  workerId: SYSTEM_SECURITY_WORKER_FORENSICS_DETONATE_SAMPLE_ID,
  allowedAutonomyLevels: DETONATE_SAMPLE_WORKER_SETTINGS_DEFAULTS.allowedAutonomyLevels,
  scheduleInterval: DETONATE_SAMPLE_WORKER_SETTINGS_DEFAULTS.scheduleInterval,
};

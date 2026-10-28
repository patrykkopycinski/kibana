/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID, ALERTZERO_WORKER_MANAGEMENT } from './constants';
import FLOOR_DETONATE_SWEEP_YAML from './floor_detonate_sweep.yaml';
import {
  DETONATE_SWEEP_WORKER_SETTINGS_DEFAULTS,
  upgradeStoredWorkerSettings,
} from './worker_settings_defaults';
import {
  renderScheduledWorkerYaml,
  type ScheduledWorkerTemplateValues,
} from './worker_template_values';
import type { ManagedWorkflowDefinition } from '../../types';

export const ALERTZERO_WORKER_FLOOR_DETONATE_SWEEP_WORKFLOW_ID =
  'system-security-floor-detonate-sweep';

/**
 * File Detonation sweep worker (detonate prototype). Shares the detonate
 * triage workflow's contract — reputation gate, verdict write-back — and adds
 * the sweep tier: candidate discovery over alerts, a per-sweep Investigation
 * for the evidence trail, and async fan-out per untriaged hash.
 */
export const ALERTZERO_WORKER_FLOOR_DETONATE_SWEEP_WORKFLOW = {
  billable: false,
  id: ALERTZERO_WORKER_FLOOR_DETONATE_SWEEP_WORKFLOW_ID,
  management: ALERTZERO_WORKER_MANAGEMENT,
  pluginId: ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 3,
  yamlTemplate: (values: ScheduledWorkerTemplateValues): string =>
    renderScheduledWorkerYaml(
      FLOOR_DETONATE_SWEEP_YAML,
      upgradeStoredWorkerSettings(DETONATE_SWEEP_WORKER_SETTINGS_DEFAULTS, values)
    ),
} as const satisfies ManagedWorkflowDefinition<ScheduledWorkerTemplateValues>;

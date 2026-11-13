/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License, v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0".
 */

import { ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID, ALERTZERO_WORKER_MANAGEMENT } from './constants';
import FORENSICS_DETONATE_SAMPLE_YAML from './forensics_detonate_sample.yaml';
import {
  DETONATE_SAMPLE_WORKER_SETTINGS_DEFAULTS,
  upgradeStoredWorkerSettings,
} from './worker_settings_defaults';
import {
  renderScheduledWorkerYaml,
  type ScheduledWorkerTemplateValues,
} from './worker_template_values';
import type { ManagedWorkflowDefinition } from '../../types';

export const ALERTZERO_WORKER_FORENSICS_DETONATE_SAMPLE_WORKFLOW_ID =
  'system-security-forensics-detonate-sample';

/**
 * File Detonation worker (detonate prototype) on the Forensics Watch. Owns
 * the sweep cadence and the per-run detonation chain behind one definition:
 * the sweep mode reports untriaged hashes and, on Supervised autonomy under
 * the monthly allowance, dispatches the high/critical ones through the
 * detonate triage relay, which hands back to this worker's per-run mode.
 */
export const ALERTZERO_WORKER_FORENSICS_DETONATE_SAMPLE_WORKFLOW = {
  billable: false,
  id: ALERTZERO_WORKER_FORENSICS_DETONATE_SAMPLE_WORKFLOW_ID,
  management: ALERTZERO_WORKER_MANAGEMENT,
  pluginId: ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 7,
  yamlTemplate: (values: ScheduledWorkerTemplateValues): string =>
    renderScheduledWorkerYaml(
      FORENSICS_DETONATE_SAMPLE_YAML,
      upgradeStoredWorkerSettings(DETONATE_SAMPLE_WORKER_SETTINGS_DEFAULTS, values)
    ),
} as const satisfies ManagedWorkflowDefinition<ScheduledWorkerTemplateValues>;

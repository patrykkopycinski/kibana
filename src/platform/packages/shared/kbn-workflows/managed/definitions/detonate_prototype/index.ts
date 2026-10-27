/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import DETONATE_FP_VALIDATION_YAML from './detonate_fp_validation.yaml';
import type { ManagedWorkflowDefinition } from '../../types';

export const DETONATE_FP_VALIDATION_WORKFLOW_ID = 'system-security-detonate-fp-validation';

/**
 * Detonate prototype: the F1 round trip as one stored workflow. Detonate the
 * sample a hash names, derive the verdict, write it back to the alert (tag +
 * note, never status). Manual-trigger only: the automated tier (Wave 3) needs
 * an alert trigger that does not exist in the registry yet.
 */
export const DETONATE_FP_VALIDATION_WORKFLOW = {
  id: DETONATE_FP_VALIDATION_WORKFLOW_ID,
  pluginId: 'securitySolution',
  version: 1,
  billable: false,
  yaml: DETONATE_FP_VALIDATION_YAML,
  management: {
    lifecycle: 'static',
    versionStrategy: 'auto',
    enablement: 'enforced',
  },
} as const satisfies ManagedWorkflowDefinition;

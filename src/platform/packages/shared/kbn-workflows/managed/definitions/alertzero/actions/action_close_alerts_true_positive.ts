/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ManagedWorkflowDefinition } from '../../../types';
import {
  ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID,
  ALERTZERO_RULE_WORKFLOW_MANAGEMENT,
} from '../constants';
import { readManagedWorkflowYaml } from '../../read_managed_workflow_yaml';

export const ALERTZERO_ACTION_CLOSE_ALERTS_TP_WORKFLOW_ID =
  'system-alertzero-action-close-alerts-tp';

export const ALERTZERO_ACTION_CLOSE_ALERTS_TP_WORKFLOW = {
  billable: false,
  id: ALERTZERO_ACTION_CLOSE_ALERTS_TP_WORKFLOW_ID,
  management: ALERTZERO_RULE_WORKFLOW_MANAGEMENT,
  pluginId: ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 2,
  get yaml() {
    return readManagedWorkflowYaml(__dirname, 'action_close_alerts_true_positive.yaml');
  },
} as const satisfies ManagedWorkflowDefinition;

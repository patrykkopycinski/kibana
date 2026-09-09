/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { PND_MANAGED_WORKFLOW_PLUGIN_ID, PND_RULE_WORKFLOW_MANAGEMENT } from './constants';
import RULE_CREATION_YAML from './rule_creation.yaml';
import RULE_PREVIEW_YAML from './rule_preview.yaml';
import RULE_TUNING_YAML from './rule_tuning.yaml';
import type { ManagedWorkflowDefinition } from '../../types';

export const PND_RULE_PREVIEW_WORKFLOW_ID = 'system-security-rule-preview';
export const PND_RULE_TUNING_WORKFLOW_ID = 'system-security-rule-tuning';
export const PND_RULE_CREATION_WORKFLOW_ID = 'system-security-rule-creation';

export const PND_RULE_PREVIEW_WORKFLOW = {
  billable: false,
  id: PND_RULE_PREVIEW_WORKFLOW_ID,
  management: PND_RULE_WORKFLOW_MANAGEMENT,
  pluginId: PND_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 1,
  yaml: RULE_PREVIEW_YAML,
} as const satisfies ManagedWorkflowDefinition;

export const PND_RULE_TUNING_WORKFLOW = {
  billable: false,
  id: PND_RULE_TUNING_WORKFLOW_ID,
  management: PND_RULE_WORKFLOW_MANAGEMENT,
  pluginId: PND_MANAGED_WORKFLOW_PLUGIN_ID,
  // 4: diagnose_rule pins connector_id and receives the fetch_fp_entities breakdown.
  // 5: diagnose_rule states the change_types in no priority order, stops delegating to
  //    the advisory investigate-rule skill, and is shown the rule's own query and scoring.
  // 6: diagnose_rule states that rule type gates exception/query, and no longer offers
  //    suppression for a concentrated entity cluster (not a change_type it can emit).
  // 7: the risk_score criterion is tied to the rule's current scoring and to
  //    entity-spread, instead of a subjective "low-priority noise" judgement.
  // 8: diagnose_rule invokes skill://investigate-rule again (restoring the shared chat/worker
  //    investigation path) while binding the answer to this workflow's schema and criteria.
  version: 8,
  yaml: RULE_TUNING_YAML,
} as const satisfies ManagedWorkflowDefinition;

export const PND_RULE_CREATION_WORKFLOW = {
  billable: false,
  id: PND_RULE_CREATION_WORKFLOW_ID,
  management: PND_RULE_WORKFLOW_MANAGEMENT,
  pluginId: PND_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 2,
  yaml: RULE_CREATION_YAML,
} as const satisfies ManagedWorkflowDefinition;

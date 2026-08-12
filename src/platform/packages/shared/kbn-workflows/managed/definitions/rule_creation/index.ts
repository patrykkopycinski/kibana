/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import RULE_CREATION_WORKFLOW_YAML from './rule_creation_workflow.yaml';
import type { ManagedWorkflowDefinition } from '../../types';

export const SECURITY_RULE_CREATION_WORKFLOW_ID = 'system-security-rule-creation';

// Installed once in the global space by the security_solution plugin. The eval
// suite (@kbn/evals-suite-detection-watch-rule-creation) drives this exact
// document by id — it does not carry its own copy of the YAML, so the eval and
// production cannot drift.
export const SECURITY_RULE_CREATION_WORKFLOW = {
  billable: false,
  id: SECURITY_RULE_CREATION_WORKFLOW_ID,
  management: {
    lifecycle: 'static',
    versionStrategy: 'auto',
    enablement: 'restorable',
  },
  pluginId: 'securitySolution',
  version: 1,
  visibility: {
    // No `selectors`: the only selector is `rule_action`, and this workflow is not surfaced as a
    // rule action — it is triggered manually / by a Watch orchestrator.
    solutions: ['security'],
  },
  yaml: RULE_CREATION_WORKFLOW_YAML,
} as const satisfies ManagedWorkflowDefinition;

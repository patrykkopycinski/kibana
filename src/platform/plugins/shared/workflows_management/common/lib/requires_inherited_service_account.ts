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
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1.0"; you may not use this file except in compliance with the
 * Elastic License 2.0 OR (at your option) any later version.
 */

import { visitNestedSteps } from '@kbn/workflows';
import type { WorkflowYaml } from '@kbn/workflows';

const EXECUTE_STEP_TYPES = new Set(['workflow.execute', 'workflow.executeAsync']);

interface InheritanceCapableWorkflow {
  managed?: boolean;
  definition?: Pick<WorkflowYaml, 'steps' | 'settings'> | null;
}

type MaybeInheritanceCapableWorkflow = InheritanceCapableWorkflow | undefined;

/**
 * A managed workflow that dispatches children with `run-as-mode: inherit` and carries no
 * `settings.run_as` of its own can only execute as the delegated service account of a
 * parent run. A top-level run of such a workflow always fails at the first inherited step
 * ("Service account inheritance requires a parent executing as a service account"), and —
 * because workflow-level `settings.concurrency` keys the space — starting it by hand can
 * cancel the space's in-flight scheduled run. Manual runs must be rejected up front instead.
 */
export const requiresInheritedServiceAccount = (
  workflow: MaybeInheritanceCapableWorkflow
): boolean => {
  if (!workflow?.managed || workflow.definition?.settings?.run_as) return false;
  let found = false;
  visitNestedSteps(workflow.definition?.steps ?? [], ({ step }) => {
    if (found || !EXECUTE_STEP_TYPES.has(step.type)) return;
    if ('with' in step && (step.with as Record<string, unknown>)?.['run-as-mode'] === 'inherit') {
      found = true;
    }
  });
  return found;
};

export const MANAGED_INHERITANCE_MANUAL_RUN_MESSAGE =
  'This managed workflow runs with the service account of the workflow that calls it, so it cannot be started manually. Run the worker that owns its schedule instead.';

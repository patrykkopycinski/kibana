/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SECURITY_RULE_CREATION_WORKFLOW_ID } from '@kbn/workflows/managed';
import { GLOBAL_WORKFLOW_SPACE_ID } from '@kbn/workflows/server';
import type { SecurityManagedWorkflowsClient } from '../managed_workflows';

/**
 * Installs the detection rule creation worker once in the global space, on the same terms as the
 * alert analysis workflow: a global workflow is visible from, and executable in, every space
 * (including spaces created later), so there is no per-space install or self-heal to manage.
 *
 * The workflow gates its detection-engine write on a `waitForApproval` step, so installing it does
 * not create any capability to write rules without an analyst explicitly approving.
 */
export const installSecurityRuleCreationWorkflow = async ({
  managedWorkflowsClient,
}: {
  managedWorkflowsClient: SecurityManagedWorkflowsClient;
}): Promise<void> => {
  await managedWorkflowsClient.install(SECURITY_RULE_CREATION_WORKFLOW_ID, {
    spaceId: GLOBAL_WORKFLOW_SPACE_ID,
  });
};

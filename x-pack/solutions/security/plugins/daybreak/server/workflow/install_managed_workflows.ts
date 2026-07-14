/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { Logger } from '@kbn/core/server';
import type { WorkflowsExtensionsServerPluginStart } from '@kbn/workflows-extensions/server';
import {
  DAYBREAK_MANAGED_WORKFLOW_IDS,
  DAYBREAK_MANAGED_WORKFLOW_PLUGIN_ID,
} from '@kbn/workflows/managed/definitions/daybreak';

import { getManagedInstallWorkerIds } from './worker_registry';

export const installDaybreakManagedWorkflows = async ({
  workflowsExtensions,
  logger,
}: {
  workflowsExtensions: WorkflowsExtensionsServerPluginStart;
  logger: Logger;
}): Promise<void> => {
  try {
    const client = await workflowsExtensions.initManagedWorkflowsClient(
      DAYBREAK_MANAGED_WORKFLOW_PLUGIN_ID
    );

    const installIds = new Set(getManagedInstallWorkerIds());
    const workflowIds = DAYBREAK_MANAGED_WORKFLOW_IDS.filter((id) => installIds.has(id));

    for (const workflowId of workflowIds) {
      await client.install(workflowId, { spaceId: DEFAULT_SPACE_ID });
    }

    await client.ready();
    logger.info(
      `daybreak: installed ${workflowIds.length} managed worker workflow(s) for /app/workflows`
    );
  } catch (error) {
    logger.warn(
      `daybreak: failed to install managed worker workflows: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

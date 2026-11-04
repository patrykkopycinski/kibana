/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart, Logger, SavedObjectsClientContract } from '@kbn/core/server';
import {
  DETONATE_COMPLETION_SWEEP_WORKFLOW_ID,
  DETONATE_FP_VALIDATION_WORKFLOW_ID,
  DETONATE_TRIAGE_WORKFLOW_ID,
} from '@kbn/workflows/managed';
import { GLOBAL_WORKFLOW_SPACE_ID } from '@kbn/workflows/server';
import type { WorkflowsExtensionsServerPluginStart } from '@kbn/workflows-extensions/server';
import { installSecurityAlertAnalysisWorkflow } from './alert_analysis_workflow/install';
import {
  initSecurityManagedWorkflowsClient,
  type SecurityManagedWorkflowsClient,
} from './managed_workflows';
import {
  installThreatIntelManagedWorkflows,
  reconcileThreatIntelAttributeWorkflows,
  uninstallThreatIntelManagedWorkflows,
} from './threat_intel_workflow/install';
import { enumerateSpaceIds } from './lib/enumerate_space_ids';

/**
 * Single plugin-start entry for securitySolution managed workflows: install alert
 * analysis (always), install or uninstall threat-intel workflows when AlertZero
 * is on/off, then call `ready()` exactly once. Replaces the two prior
 * AndMarkReady helpers that each called `ready()` and raced each other.
 */
export const installSecurityManagedWorkflowsAndMarkReady = async ({
  workflowsExtensions,
  logger,
  threatIntelSupplyEnabled,
  bootstrapReady,
  core,
  detonatePrototypeEnabled = false,
}: {
  workflowsExtensions: WorkflowsExtensionsServerPluginStart;
  logger: Logger;
  /**
   * True when `xpack.alertzero.enabled` is on (captured from the optional
   * alertzero setup contract). When false, any previously installed TI
   * managed workflows are uninstalled.
   */
  threatIntelSupplyEnabled: boolean;
  /**
   * Resolves after TI bootstrap (templates, migrations, seed). Only awaited when
   * supply is enabled; ignored otherwise.
   */
  bootstrapReady: Promise<void>;
  core: Pick<CoreStart, 'savedObjects'>;
  /**
   * Installs the detonate workflows when the prototype flag is on: triage and
   * FP-validation globally, the completion sweep per space. When off, previously
   * installed copies are uninstalled, so toggling the flag cleanly adds/removes them.
   */
  detonatePrototypeEnabled?: boolean;
}): Promise<void> => {
  let managedWorkflowsClient: SecurityManagedWorkflowsClient;
  try {
    managedWorkflowsClient = await initSecurityManagedWorkflowsClient(workflowsExtensions);
  } catch (error) {
    logger.warn('Failed to initialize the securitySolution managed-workflows client', { error });
    return;
  }

  try {
    await installSecurityAlertAnalysisWorkflow({ managedWorkflowsClient });
  } catch (error) {
    logger.warn('Failed to install the alert analysis workflow', { error });
  }

  try {
    // Prototype workflows: install/uninstall is flag-driven like threat intel,
    // but unconditional within the flag (no bootstrap dependency).
    if (detonatePrototypeEnabled) {
      await managedWorkflowsClient.install(DETONATE_FP_VALIDATION_WORKFLOW_ID, {
        spaceId: GLOBAL_WORKFLOW_SPACE_ID,
      });
      await managedWorkflowsClient.install(DETONATE_TRIAGE_WORKFLOW_ID, {
        spaceId: GLOBAL_WORKFLOW_SPACE_ID,
      });
    } else {
      await managedWorkflowsClient.uninstall(DETONATE_FP_VALIDATION_WORKFLOW_ID, {
        spaceId: GLOBAL_WORKFLOW_SPACE_ID,
      });
      await managedWorkflowsClient.uninstall(DETONATE_TRIAGE_WORKFLOW_ID, {
        spaceId: GLOBAL_WORKFLOW_SPACE_ID,
      });
    }
  } catch (error) {
    logger.warn('Failed to install or uninstall the detonate prototype workflows', { error });
  }

  try {
    if (detonatePrototypeEnabled) {
      await installDetonateCompletionSweep({
        managedWorkflowsClient,
        spaceIds: await enumerateSpaceIds(createSpaceRepository(core)),
        logger,
      });
    } else {
      await uninstallDetonateCompletionSweep({ managedWorkflowsClient, logger });
    }
  } catch (error) {
    logger.warn('Failed to install or uninstall the detonate completion sweep', { error });
  }

  try {
    if (threatIntelSupplyEnabled) {
      await bootstrapReady;
      const spaceIds = await enumerateSpaceIds(createSpaceRepository(core));
      await installThreatIntelManagedWorkflows({
        managedWorkflowsClient,
        spaceIds,
        logger,
      });
    } else {
      await uninstallThreatIntelManagedWorkflows({
        managedWorkflowsClient,
        getSpaceIds: () => enumerateSpaceIds(createSpaceRepository(core)),
        logger,
      });
    }
  } catch (error) {
    logger.warn('Failed to install or uninstall threat intelligence managed workflows', {
      error,
    });
  }

  try {
    await managedWorkflowsClient.ready();
  } catch (error) {
    logger.warn('Failed to mark securitySolution managed workflows ready', { error });
  }
};

/**
 * Periodic catch-up for spaces created after boot. Installs only
 * `attribute_alerts_to_reports` per missing space (ingest/enrich live in the default space).
 * Intended to ride the promote_threat_indicators task every 15m.
 */
export const reconcileThreatIntelAttributeWorkflowsForSpaces = async ({
  workflowsExtensions,
  core,
  logger,
}: {
  workflowsExtensions: WorkflowsExtensionsServerPluginStart;
  core: Pick<CoreStart, 'savedObjects'>;
  logger: Logger;
}): Promise<void> => {
  try {
    const managedWorkflowsClient = await initSecurityManagedWorkflowsClient(workflowsExtensions);
    const spaceIds = await enumerateSpaceIds(createSpaceRepository(core));
    await reconcileThreatIntelAttributeWorkflows({
      managedWorkflowsClient,
      spaceIds,
      logger,
    });
  } catch (error) {
    logger.warn('Failed to reconcile per-space threat intel attribute workflows', { error });
  }
};

/**
 * Full TI managed-workflow install (default-space supply workflows + per-space attribute) for every
 * current space. Used when bootstrap recovers after the boot-time installer
 * skipped TI because `bootstrapReady` had rejected.
 */
export const installThreatIntelManagedWorkflowsForSpaces = async ({
  workflowsExtensions,
  core,
  logger,
}: {
  workflowsExtensions: WorkflowsExtensionsServerPluginStart;
  core: Pick<CoreStart, 'savedObjects'>;
  logger: Logger;
}): Promise<void> => {
  try {
    const managedWorkflowsClient = await initSecurityManagedWorkflowsClient(workflowsExtensions);
    const spaceIds = await enumerateSpaceIds(createSpaceRepository(core));
    await installThreatIntelManagedWorkflows({
      managedWorkflowsClient,
      spaceIds,
      logger,
    });
  } catch (error) {
    logger.warn(
      'Failed to install threat intelligence managed workflows after bootstrap recovery',
      {
        error,
      }
    );
    // Rethrow so the background recovery loop can retry. Swallowing here left TI
    // workflows missing until restart after a transient install failure.
    throw error;
  }
};

/**
 * The sweep is scheduled, and the scheduler skips workflows stored in the
 * global space, so it is installed once per space instead. Spaces created
 * after boot get their copy on the next restart. One failing space does not
 * stop the others.
 */
const installDetonateCompletionSweep = async ({
  managedWorkflowsClient,
  spaceIds,
  logger,
}: {
  managedWorkflowsClient: SecurityManagedWorkflowsClient;
  spaceIds: readonly string[];
  logger: Logger;
}): Promise<void> => {
  for (const spaceId of spaceIds) {
    try {
      await managedWorkflowsClient.install(DETONATE_COMPLETION_SWEEP_WORKFLOW_ID, {
        spaceId,
        workflowIdSuffix: spaceId,
      });
    } catch (error) {
      logger.warn(`Failed to install the detonate completion sweep in space '${spaceId}'`, {
        error,
      });
    }
  }
};

/** Removes every installed per-space sweep, including copies in since-deleted spaces. */
const uninstallDetonateCompletionSweep = async ({
  managedWorkflowsClient,
  logger,
}: {
  managedWorkflowsClient: SecurityManagedWorkflowsClient;
  logger: Logger;
}): Promise<void> => {
  const sweeps = (await managedWorkflowsClient.listInstalledWorkflowStates()).filter(
    ({ definitionId }) => definitionId === DETONATE_COMPLETION_SWEEP_WORKFLOW_ID
  );
  for (const { spaceId, workflowId } of sweeps) {
    try {
      await managedWorkflowsClient.uninstall(DETONATE_COMPLETION_SWEEP_WORKFLOW_ID, {
        spaceId,
        workflowId,
      });
    } catch (error) {
      logger.warn(`Failed to uninstall the detonate completion sweep in space ${spaceId}`, {
        error,
      });
    }
  }
};

const createSpaceRepository = (
  core: Pick<CoreStart, 'savedObjects'>
): Pick<SavedObjectsClientContract, 'find'> =>
  core.savedObjects.createInternalRepository(['space']);

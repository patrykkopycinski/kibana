/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  SECURITY_ALERT_ANALYSIS_WORKFLOW_ID,
  DETONATE_COMPLETION_SWEEP_WORKFLOW_ID,
  DETONATE_FP_VALIDATION_WORKFLOW_ID,
  DETONATE_TRIAGE_WORKFLOW_ID,
} from '@kbn/workflows/managed';
import { GLOBAL_WORKFLOW_SPACE_ID } from '@kbn/workflows/server';
import { workflowsExtensionsMock } from '@kbn/workflows-extensions/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { coreMock } from '@kbn/core/server/mocks';
import {
  installSecurityManagedWorkflowsAndMarkReady,
  installThreatIntelManagedWorkflowsForSpaces,
} from './security_managed_workflows';
import * as threatIntelInstall from './threat_intel_workflow/install';
import * as alertAnalysisInstall from './alert_analysis_workflow/install';
import * as enumerate from './lib/enumerate_space_ids';

jest.mock('./threat_intel_workflow/install');
jest.mock('./alert_analysis_workflow/install');
jest.mock('./lib/enumerate_space_ids');

describe('installSecurityManagedWorkflowsAndMarkReady', () => {
  const createManagedClient = () => ({
    install: jest.fn().mockResolvedValue(undefined),
    uninstall: jest.fn().mockResolvedValue(undefined),
    ready: jest.fn().mockResolvedValue(undefined),
    execute: jest.fn().mockResolvedValue('mock-execution-id'),
    getInstalledWorkflowState: jest.fn().mockResolvedValue(null),
    listInstalledWorkflowStates: jest.fn().mockResolvedValue([]),
    getWorkflowStatus: jest.fn().mockResolvedValue({
      status: 'intact',
      workflowId: SECURITY_ALERT_ANALYSIS_WORKFLOW_ID,
      definitionId: SECURITY_ALERT_ANALYSIS_WORKFLOW_ID,
      spaceId: 'default',
      installed: true,
      enabled: true,
      valid: true,
      managedBy: 'securitySolution',
      storedVersion: 1,
      registryVersion: 1,
      storedHash: 'mock-hash',
      registryHash: 'mock-hash',
    }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (enumerate.enumerateSpaceIds as jest.Mock).mockResolvedValue(['default']);
    (alertAnalysisInstall.installSecurityAlertAnalysisWorkflow as jest.Mock).mockResolvedValue(
      undefined
    );
    (threatIntelInstall.installThreatIntelManagedWorkflows as jest.Mock).mockResolvedValue(
      undefined
    );
    (threatIntelInstall.uninstallThreatIntelManagedWorkflows as jest.Mock).mockResolvedValue(
      undefined
    );
  });

  it('calls ready exactly once after alert analysis and threat intel install when the flag is on', async () => {
    const managed = createManagedClient();
    const order: string[] = [];
    managed.ready.mockImplementation(async () => {
      order.push('ready');
    });
    (alertAnalysisInstall.installSecurityAlertAnalysisWorkflow as jest.Mock).mockImplementation(
      async () => {
        order.push('alert');
      }
    );
    (threatIntelInstall.installThreatIntelManagedWorkflows as jest.Mock).mockImplementation(
      async () => {
        order.push('ti');
      }
    );

    const workflowsExtensions = workflowsExtensionsMock.createStart();
    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managed);

    await installSecurityManagedWorkflowsAndMarkReady({
      workflowsExtensions,
      logger: loggerMock.create(),
      threatIntelSupplyEnabled: true,
      bootstrapReady: Promise.resolve(),
      core: coreMock.createStart(),
    });

    expect(order).toEqual(['alert', 'ti', 'ready']);
    expect(managed.ready).toHaveBeenCalledTimes(1);
    expect(threatIntelInstall.installThreatIntelManagedWorkflows).toHaveBeenCalled();
    expect(threatIntelInstall.uninstallThreatIntelManagedWorkflows).not.toHaveBeenCalled();
  });

  it('uninstalls threat intel workflows and still calls ready once when the flag is off', async () => {
    const managed = createManagedClient();
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managed);

    await installSecurityManagedWorkflowsAndMarkReady({
      workflowsExtensions,
      logger: loggerMock.create(),
      threatIntelSupplyEnabled: false,
      bootstrapReady: Promise.resolve(),
      core: coreMock.createStart(),
    });

    expect(alertAnalysisInstall.installSecurityAlertAnalysisWorkflow).toHaveBeenCalledWith({
      managedWorkflowsClient: managed,
    });
    expect(threatIntelInstall.uninstallThreatIntelManagedWorkflows).toHaveBeenCalled();
    expect(threatIntelInstall.installThreatIntelManagedWorkflows).not.toHaveBeenCalled();
    expect(managed.ready).toHaveBeenCalledTimes(1);
  });

  it('still calls ready when threat intel install fails', async () => {
    const managed = createManagedClient();
    (threatIntelInstall.installThreatIntelManagedWorkflows as jest.Mock).mockRejectedValue(
      new Error('boom')
    );
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managed);

    await installSecurityManagedWorkflowsAndMarkReady({
      workflowsExtensions,
      logger: loggerMock.create(),
      threatIntelSupplyEnabled: true,
      bootstrapReady: Promise.resolve(),
      core: coreMock.createStart(),
    });

    expect(managed.ready).toHaveBeenCalledTimes(1);
  });

  it('installs the detonate workflows in the global space when the prototype flag is on', async () => {
    const managed = createManagedClient();
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managed);

    await installSecurityManagedWorkflowsAndMarkReady({
      workflowsExtensions,
      logger: loggerMock.create(),
      threatIntelSupplyEnabled: false,
      bootstrapReady: Promise.resolve(),
      core: coreMock.createStart(),
      detonatePrototypeEnabled: true,
    });

    expect(managed.install).toHaveBeenCalledWith(DETONATE_FP_VALIDATION_WORKFLOW_ID, {
      spaceId: GLOBAL_WORKFLOW_SPACE_ID,
    });
    expect(managed.install).toHaveBeenCalledWith(DETONATE_TRIAGE_WORKFLOW_ID, {
      spaceId: GLOBAL_WORKFLOW_SPACE_ID,
    });
    expect(managed.ready).toHaveBeenCalledTimes(1);
  });

  it('uninstalls previously installed detonate workflows when the prototype flag is off', async () => {
    const managed = createManagedClient();
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managed);

    await installSecurityManagedWorkflowsAndMarkReady({
      workflowsExtensions,
      logger: loggerMock.create(),
      threatIntelSupplyEnabled: false,
      bootstrapReady: Promise.resolve(),
      core: coreMock.createStart(),
      detonatePrototypeEnabled: false,
    });

    expect(managed.install).not.toHaveBeenCalledWith(
      DETONATE_FP_VALIDATION_WORKFLOW_ID,
      expect.anything()
    );
    expect(managed.install).not.toHaveBeenCalledWith(
      DETONATE_TRIAGE_WORKFLOW_ID,
      expect.anything()
    );
    expect(managed.uninstall).toHaveBeenCalledWith(DETONATE_FP_VALIDATION_WORKFLOW_ID, {
      spaceId: GLOBAL_WORKFLOW_SPACE_ID,
    });
    expect(managed.uninstall).toHaveBeenCalledWith(DETONATE_TRIAGE_WORKFLOW_ID, {
      spaceId: GLOBAL_WORKFLOW_SPACE_ID,
    });
  });

  it('installs the completion sweep once per space, since the scheduler skips global-space workflows', async () => {
    (enumerate.enumerateSpaceIds as jest.Mock).mockResolvedValue(['default', 'another']);
    const managed = createManagedClient();
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managed);

    await installSecurityManagedWorkflowsAndMarkReady({
      workflowsExtensions,
      logger: loggerMock.create(),
      threatIntelSupplyEnabled: false,
      bootstrapReady: Promise.resolve(),
      core: coreMock.createStart(),
      detonatePrototypeEnabled: true,
    });

    const sweepInstalls = managed.install.mock.calls.filter(
      ([id]) => id === DETONATE_COMPLETION_SWEEP_WORKFLOW_ID
    );
    expect(sweepInstalls).toEqual([
      [DETONATE_COMPLETION_SWEEP_WORKFLOW_ID, { spaceId: 'default', workflowIdSuffix: 'default' }],
      [DETONATE_COMPLETION_SWEEP_WORKFLOW_ID, { spaceId: 'another', workflowIdSuffix: 'another' }],
    ]);
    expect(managed.install.mock.invocationCallOrder.at(-1)).toBeLessThan(
      managed.ready.mock.invocationCallOrder[0]
    );
  });

  it('keeps installing the sweep in other spaces when one space fails', async () => {
    (enumerate.enumerateSpaceIds as jest.Mock).mockResolvedValue(['default', 'broken', 'another']);
    const managed = createManagedClient();
    managed.install.mockImplementation(async (id: string, { spaceId }: { spaceId: string }) => {
      if (id === DETONATE_COMPLETION_SWEEP_WORKFLOW_ID && spaceId === 'broken') {
        throw new Error('boom');
      }
    });
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managed);
    const logger = loggerMock.create();

    await installSecurityManagedWorkflowsAndMarkReady({
      workflowsExtensions,
      logger,
      threatIntelSupplyEnabled: false,
      bootstrapReady: Promise.resolve(),
      core: coreMock.createStart(),
      detonatePrototypeEnabled: true,
    });

    expect(managed.install).toHaveBeenCalledWith(DETONATE_COMPLETION_SWEEP_WORKFLOW_ID, {
      spaceId: 'another',
      workflowIdSuffix: 'another',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("space 'broken'"),
      expect.anything()
    );
    expect(managed.ready).toHaveBeenCalledTimes(1);
  });

  it('uninstalls every installed sweep copy when the prototype flag is off', async () => {
    const managed = createManagedClient();
    managed.listInstalledWorkflowStates.mockResolvedValue([
      {
        workflowId: `${DETONATE_COMPLETION_SWEEP_WORKFLOW_ID}-default`,
        spaceId: 'default',
        definitionId: DETONATE_COMPLETION_SWEEP_WORKFLOW_ID,
        templateValues: null,
        documentVersion: 1,
      },
      {
        workflowId: `${DETONATE_COMPLETION_SWEEP_WORKFLOW_ID}-gone`,
        spaceId: 'gone',
        definitionId: DETONATE_COMPLETION_SWEEP_WORKFLOW_ID,
        templateValues: null,
        documentVersion: 1,
      },
      {
        workflowId: SECURITY_ALERT_ANALYSIS_WORKFLOW_ID,
        spaceId: 'default',
        definitionId: SECURITY_ALERT_ANALYSIS_WORKFLOW_ID,
        templateValues: null,
        documentVersion: 1,
      },
    ]);
    managed.uninstall.mockImplementation(async (id: string, { spaceId }: { spaceId: string }) => {
      if (id === DETONATE_COMPLETION_SWEEP_WORKFLOW_ID && spaceId === 'default') {
        throw new Error('boom');
      }
    });
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managed);

    await installSecurityManagedWorkflowsAndMarkReady({
      workflowsExtensions,
      logger: loggerMock.create(),
      threatIntelSupplyEnabled: false,
      bootstrapReady: Promise.resolve(),
      core: coreMock.createStart(),
      detonatePrototypeEnabled: false,
    });

    const sweepUninstalls = managed.uninstall.mock.calls.filter(
      ([id]) => id === DETONATE_COMPLETION_SWEEP_WORKFLOW_ID
    );
    expect(sweepUninstalls).toEqual([
      [
        DETONATE_COMPLETION_SWEEP_WORKFLOW_ID,
        { spaceId: 'default', workflowId: `${DETONATE_COMPLETION_SWEEP_WORKFLOW_ID}-default` },
      ],
      [
        DETONATE_COMPLETION_SWEEP_WORKFLOW_ID,
        { spaceId: 'gone', workflowId: `${DETONATE_COMPLETION_SWEEP_WORKFLOW_ID}-gone` },
      ],
    ]);
    expect(managed.uninstall).not.toHaveBeenCalledWith(
      SECURITY_ALERT_ANALYSIS_WORKFLOW_ID,
      expect.anything()
    );
    expect(managed.ready).toHaveBeenCalledTimes(1);
  });

  it('still calls ready when the detonate workflow install fails', async () => {
    const managed = createManagedClient();
    managed.install.mockRejectedValue(new Error('boom'));
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managed);

    await installSecurityManagedWorkflowsAndMarkReady({
      workflowsExtensions,
      logger: loggerMock.create(),
      threatIntelSupplyEnabled: false,
      bootstrapReady: Promise.resolve(),
      core: coreMock.createStart(),
      detonatePrototypeEnabled: true,
    });

    expect(managed.ready).toHaveBeenCalledTimes(1);
  });

  it('still calls ready when alert analysis install fails', async () => {
    const managed = createManagedClient();
    (alertAnalysisInstall.installSecurityAlertAnalysisWorkflow as jest.Mock).mockRejectedValue(
      new Error('boom')
    );
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managed);

    await installSecurityManagedWorkflowsAndMarkReady({
      workflowsExtensions,
      logger: loggerMock.create(),
      threatIntelSupplyEnabled: false,
      bootstrapReady: Promise.resolve(),
      core: coreMock.createStart(),
    });

    expect(managed.ready).toHaveBeenCalledTimes(1);
  });

  it('awaits bootstrap before installing threat intel workflows', async () => {
    let resolveBootstrap!: () => void;
    const bootstrapReady = new Promise<void>((resolve) => {
      resolveBootstrap = resolve;
    });
    const managed = createManagedClient();
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managed);

    const pending = installSecurityManagedWorkflowsAndMarkReady({
      workflowsExtensions,
      logger: loggerMock.create(),
      threatIntelSupplyEnabled: true,
      bootstrapReady,
      core: coreMock.createStart(),
    });

    await new Promise(process.nextTick);
    expect(threatIntelInstall.installThreatIntelManagedWorkflows).not.toHaveBeenCalled();
    resolveBootstrap();
    await pending;
    expect(threatIntelInstall.installThreatIntelManagedWorkflows).toHaveBeenCalled();
  });

  it('installThreatIntelManagedWorkflowsForSpaces installs TI for enumerated spaces', async () => {
    const managed = createManagedClient();
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managed);
    (enumerate.enumerateSpaceIds as jest.Mock).mockResolvedValue(['default', 'another']);

    await installThreatIntelManagedWorkflowsForSpaces({
      workflowsExtensions,
      logger: loggerMock.create(),
      core: coreMock.createStart(),
    });

    expect(threatIntelInstall.installThreatIntelManagedWorkflows).toHaveBeenCalledWith({
      managedWorkflowsClient: managed,
      spaceIds: ['default', 'another'],
      logger: expect.anything(),
    });
  });

  it('installThreatIntelManagedWorkflowsForSpaces rethrows after logging so recovery can retry', async () => {
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    workflowsExtensions.initManagedWorkflowsClient.mockRejectedValue(new Error('no client'));
    const logger = loggerMock.create();

    await expect(
      installThreatIntelManagedWorkflowsForSpaces({
        workflowsExtensions,
        logger,
        core: coreMock.createStart(),
      })
    ).rejects.toThrow('no client');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('installs alert analysis in the global space via the shared client', async () => {
    const managed = createManagedClient();
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    workflowsExtensions.initManagedWorkflowsClient.mockResolvedValue(managed);
    (alertAnalysisInstall.installSecurityAlertAnalysisWorkflow as jest.Mock).mockImplementation(
      async ({ managedWorkflowsClient }) => {
        await managedWorkflowsClient.install(SECURITY_ALERT_ANALYSIS_WORKFLOW_ID, {
          spaceId: GLOBAL_WORKFLOW_SPACE_ID,
        });
      }
    );

    await installSecurityManagedWorkflowsAndMarkReady({
      workflowsExtensions,
      logger: loggerMock.create(),
      threatIntelSupplyEnabled: false,
      bootstrapReady: Promise.resolve(),
      core: coreMock.createStart(),
    });

    expect(alertAnalysisInstall.installSecurityAlertAnalysisWorkflow).toHaveBeenCalled();
  });
});

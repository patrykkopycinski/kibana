/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/server/mocks';
import { workflowsExecutionEngineMock } from '@kbn/workflows-execution-engine/server/mocks';
import { workflowsExtensionsMock } from '@kbn/workflows-extensions/server/mocks';

import { DaybreakPlugin } from './plugin';
import type { DaybreakPluginStartDeps } from './types';
import { registerDaybreakWorker } from './workflow/worker_registry';

describe('DaybreakPlugin', () => {
  const createEnabledPlugin = () => {
    const initializerContext = coreMock.createPluginInitializerContext({ enabled: true });
    return new DaybreakPlugin(initializerContext);
  };

  describe('setup()', () => {
    it('exposes registerDaybreakWorker as the same function as the module export', () => {
      const plugin = createEnabledPlugin();
      const setup = plugin.setup(coreMock.createSetup(), {
        workflowsExtensions: workflowsExtensionsMock.createSetup(),
      });

      expect(setup.registerDaybreakWorker).toBe(registerDaybreakWorker);
    });
  });

  describe('start()', () => {
    it('exposes executeDaybreakWorker when workflowsExecutionEngine is available', () => {
      const plugin = createEnabledPlugin();
      plugin.setup(coreMock.createSetup(), {
        workflowsExtensions: workflowsExtensionsMock.createSetup(),
      });

      const engine = workflowsExecutionEngineMock.createStart();
      engine.executeWorkflow.mockResolvedValue({ workflowExecutionId: 'exec-test-1' });

      const startDeps: DaybreakPluginStartDeps = {
        workflowsExecutionEngine: engine,
        workflowsExtensions: workflowsExtensionsMock.createStart(),
      };

      const start = plugin.start(coreMock.createStart(), startDeps);

      expect(start.executeDaybreakWorker).toEqual(expect.any(Function));
    });
  });
});

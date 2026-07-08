/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
  KibanaRequest,
} from '@kbn/core/server';

import type { ConfigType } from '../common/config';
import type { DaybreakPluginSetup, DaybreakPluginStart, DaybreakPluginStartDeps } from './types';
import { runSpikeWorkflow } from './workflow/run_spike_workflow';

export class DaybreakPlugin
  implements Plugin<DaybreakPluginSetup, DaybreakPluginStart, never, DaybreakPluginStartDeps>
{
  private readonly logger: Logger;
  private readonly config: ConfigType;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
    this.config = initializerContext.config.get<ConfigType>();
  }

  public setup(core: CoreSetup): DaybreakPluginSetup {
    if (!this.config.enabled) {
      this.logger.debug('daybreak: plugin disabled, skipping setup');
      return {};
    }

    this.logger.debug('daybreak: Setup');
    return {};
  }

  public start(core: CoreStart, deps: DaybreakPluginStartDeps): DaybreakPluginStart {
    if (!this.config.enabled) {
      return {};
    }

    this.logger.debug('daybreak: Started');

    const engine = deps.workflowsExecutionEngine;
    if (!engine) {
      this.logger.warn('daybreak: workflowsExecutionEngine not available — runner disabled');
      return {};
    }

    return {
      runSpikeWorkflow: (request: KibanaRequest) =>
        runSpikeWorkflow({
          executeWorkflow: engine.executeWorkflow,
          logger: this.logger,
          request,
        }).then(() => undefined),
    };
  }

  public stop() {
    this.logger.debug('daybreak: Stopped');
  }
}

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
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';

import type { ConfigType } from '../common/config';
import type {
  DaybreakPluginSetup,
  DaybreakPluginSetupDeps,
  DaybreakPluginStart,
  DaybreakPluginStartDeps,
} from './types';
import { runSpikeWorkflow } from './workflow/run_spike_workflow';
import { registerRoutes } from './http_routes';

export class DaybreakPlugin
  implements
    Plugin<
      DaybreakPluginSetup,
      DaybreakPluginStart,
      DaybreakPluginSetupDeps,
      DaybreakPluginStartDeps
    >
{
  private readonly logger: Logger;
  private readonly config: ConfigType;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
    this.config = initializerContext.config.get<ConfigType>();
  }

  public setup(core: CoreSetup, plugins: DaybreakPluginSetupDeps): DaybreakPluginSetup {
    if (!this.config.enabled) {
      this.logger.debug('daybreak: plugin disabled, skipping setup');
      return {};
    }

    this.logger.debug('daybreak: Setup');

    const router = core.http.createRouter();
    const getSpaceId = (request: KibanaRequest) =>
      plugins.spaces?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;
    registerRoutes({ router, logger: this.logger, getSpaceId });

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

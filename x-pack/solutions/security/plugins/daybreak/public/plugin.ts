/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AppUpdater,
  CoreSetup,
  CoreStart,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/public';
import { BehaviorSubject } from 'rxjs';
import { registerApp } from './register';
import type {
  DaybreakPublicPluginSetup,
  DaybreakPublicPluginStart,
  DaybreakPublicPluginSetupDeps,
  DaybreakPublicPluginStartDeps,
} from './types';

interface DaybreakBrowserConfig {
  enabled: boolean;
}

/**
 * Public-side plugin for Daybreak (FR-008, FR-009, FR-010).
 *
 * Registers the top-level application route only when the server-side
 * `xpack.daybreak.enabled` flag is on (FR-009, NFR-2). The flag is exposed to
 * the browser via `exposeToBrowser` in `server/index.ts`. When disabled, no
 * daybreak UI renders — `registerApp` is never called, so `core.application`
 * has no `daybreak` entry at all.
 *
 * The app is additionally registered with an `appUpdater$` (mirroring the
 * `agent_builder` pattern in `public/plugin.tsx`) so the app's `status` can be
 * toggled to `inaccessible` at runtime without a full page reload — e.g. if a
 * future capability/license check needs to hide the nav entry after initial
 * registration.
 */
export class DaybreakPublicPlugin
  implements
    Plugin<
      DaybreakPublicPluginSetup,
      DaybreakPublicPluginStart,
      DaybreakPublicPluginSetupDeps,
      DaybreakPublicPluginStartDeps
    >
{
  private readonly config: DaybreakBrowserConfig;
  private readonly appUpdater$ = new BehaviorSubject<AppUpdater>(() => ({}));

  constructor(initializerContext: PluginInitializerContext) {
    this.config = initializerContext.config.get<DaybreakBrowserConfig>();
  }

  public setup(core: CoreSetup): DaybreakPublicPluginSetup {
    if (!this.config.enabled) {
      return {};
    }

    registerApp({ core, appUpdater$: this.appUpdater$ });

    return {};
  }

  public start(_core: CoreStart): DaybreakPublicPluginStart {
    return {};
  }

  public stop() {}
}

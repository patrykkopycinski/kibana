/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AppMountParameters,
  AppUpdater,
  CoreSetup,
  CoreStart,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/public';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { BehaviorSubject } from 'rxjs';
import type {
  DaybreakPublicPluginSetup,
  DaybreakPublicPluginStart,
  DaybreakPublicPluginSetupDeps,
  DaybreakPublicPluginStartDeps,
} from './types';

interface DaybreakBrowserConfig {
  enabled: boolean;
}

export const DAYBREAK_APP_ID = 'daybreak';
export const DAYBREAK_APP_ROUTE = '/app/daybreak';

/**
 * Public-side plugin for Daybreak (FR-008, FR-009, FR-010).
 *
 * Registers the top-level application route only when the server-side
 * `xpack.daybreak.enabled` flag is on (FR-009, NFR-2). The flag is exposed to
 * the browser via `exposeToBrowser` in `server/index.ts`. When disabled, no
 * daybreak UI renders — `core.application.register` is never called, so
 * `core.application` has no `daybreak` entry at all.
 *
 * `mount` lazy-loads `public/application`'s `mountApp`, which renders
 * `DaybreakApp` (`public/application/components/shell.tsx`) — the top-level
 * route component, named to match the `<PluginName>App` convention used by
 * sibling plugins (`IngestHubApp`, `EvalsApp`). It is imported lazily rather
 * than eagerly here so the application bundle stays code-split from `plugin.ts`.
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

    core.application.register({
      id: DAYBREAK_APP_ID,
      appRoute: DAYBREAK_APP_ROUTE,
      category: DEFAULT_APP_CATEGORIES.security,
      title: i18n.translate('xpack.daybreak.appTitle', { defaultMessage: 'Daybreak' }),
      euiIconType: 'logoSecurity',
      visibleIn: [],
      updater$: this.appUpdater$,
      async mount({ element, history }: AppMountParameters) {
        const { mountApp } = await import('./application');
        const [coreStart] = await core.getStartServices();
        return mountApp({ core: coreStart, element, history });
      },
    });

    return {};
  }

  public start(_core: CoreStart): DaybreakPublicPluginStart {
    return {};
  }

  public stop() {}
}

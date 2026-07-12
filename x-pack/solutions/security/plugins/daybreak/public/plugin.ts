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
      visibleIn: ['classicSideNav', 'projectSideNav'],
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

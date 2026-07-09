/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppMountParameters, AppUpdater, CoreSetup } from '@kbn/core/public';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import type { BehaviorSubject } from 'rxjs';

export const DAYBREAK_APP_ID = 'daybreak';
export const DAYBREAK_APP_ROUTE = '/app/daybreak';

/**
 * Registers the Daybreak top-level Kibana application (FR-008). Only called
 * from `plugin.ts` `setup()` when the server-side `xpack.daybreak.enabled`
 * flag is on (FR-009) — see `DaybreakPublicPlugin.setup`.
 *
 * `appUpdater$` (mirroring `agent_builder/public/register.ts`) lets the
 * plugin push runtime app-status/deep-link updates after registration
 * without re-registering the app.
 */
export const registerApp = ({
  core,
  appUpdater$,
}: {
  core: CoreSetup;
  appUpdater$: BehaviorSubject<AppUpdater>;
}) => {
  core.application.register({
    id: DAYBREAK_APP_ID,
    appRoute: DAYBREAK_APP_ROUTE,
    category: DEFAULT_APP_CATEGORIES.security,
    title: i18n.translate('xpack.daybreak.appTitle', { defaultMessage: 'Daybreak' }),
    euiIconType: 'logoSecurity',
    visibleIn: [],
    updater$: appUpdater$,
    async mount({ element, history }: AppMountParameters) {
      const { mountApp } = await import('./application');
      const [coreStart] = await core.getStartServices();
      return mountApp({ core: coreStart, element, history });
    },
  });
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { History } from 'history';
import type { ThemeServiceStart } from '@kbn/core-theme-browser';
import type { InternalHttpSetup, InternalHttpStart } from '@kbn/core-http-browser-internal';
import type { OverlayStart } from '@kbn/core-overlays-browser';
import type { AnalyticsServiceSetup, AnalyticsServiceStart } from '@kbn/core-analytics-browser';
import type { CustomBrandingStart } from '@kbn/core-custom-branding-browser';
import type { InternalApplicationSetup, InternalApplicationStart } from './types';
export interface SetupDeps {
  http: InternalHttpSetup;
  analytics: AnalyticsServiceSetup;
  history?: History<any>;
  /** Used to redirect to external urls */
  redirectTo?: (path: string) => void;
}
export interface StartDeps {
  http: InternalHttpStart;
  analytics: AnalyticsServiceStart;
  theme: ThemeServiceStart;
  overlays: OverlayStart;
  customBranding: CustomBrandingStart;
}
/**
 * Service that is responsible for registering new applications.
 * @internal
 */
export declare class ApplicationService {
  private readonly apps;
  private readonly appOwners;
  private readonly mounters;
  private readonly capabilities;
  private readonly appInternalStates;
  private currentAppId$;
  private currentActionMenu$;
  private readonly statusUpdaters$;
  private readonly appNotFoundSubject;
  private readonly subscriptions;
  private stop$;
  private registrationClosed;
  private history?;
  private location$?;
  private navigate?;
  private openInNewTab?;
  private redirectTo?;
  private overlayStart$;
  private hasCustomBranding$;
  setup({
    http: { basePath },
    analytics,
    redirectTo,
    history,
  }: SetupDeps): InternalApplicationSetup;
  start({
    analytics,
    http,
    overlays,
    theme,
    customBranding,
  }: StartDeps): Promise<InternalApplicationStart>;
  private setAppLeaveHandler;
  private setAppActionMenu;
  private refreshCurrentActionMenu;
  private shouldNavigate;
  private setAppNotFoundState;
  private onBeforeUnload;
  stop(): void;
}

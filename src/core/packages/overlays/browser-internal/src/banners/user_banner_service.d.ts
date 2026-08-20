/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AnalyticsServiceStart } from '@kbn/core-analytics-browser';
import type { ThemeServiceStart } from '@kbn/core-theme-browser';
import type { UserProfileService } from '@kbn/core-user-profile-browser';
import type { I18nStart } from '@kbn/core-i18n-browser';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import type { OverlayBannersStart } from '@kbn/core-overlays-browser';
interface StartServices {
  analytics: AnalyticsServiceStart;
  i18n: I18nStart;
  theme: ThemeServiceStart;
  userProfile: UserProfileService;
}
interface StartDeps extends StartServices {
  banners: OverlayBannersStart;
  uiSettings: IUiSettingsClient;
}
/**
 * Sets up the custom banner that can be specified in advanced settings.
 * @internal
 */
export declare class UserBannerService {
  private settingsSubscription?;
  start({ banners, uiSettings, ...startServices }: StartDeps): void;
  stop(): void;
}
export {};

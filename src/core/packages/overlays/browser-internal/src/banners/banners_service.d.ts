/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { type Observable } from 'rxjs';
import type { AnalyticsServiceStart } from '@kbn/core-analytics-browser';
import type { I18nStart } from '@kbn/core-i18n-browser';
import type { ThemeServiceStart } from '@kbn/core-theme-browser';
import type { UserProfileService } from '@kbn/core-user-profile-browser';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import type { MountPoint } from '@kbn/core-mount-utils-browser';
import type { OverlayBannersStart } from '@kbn/core-overlays-browser';
interface StartServices {
  analytics: AnalyticsServiceStart;
  i18n: I18nStart;
  theme: ThemeServiceStart;
  userProfile: UserProfileService;
}
interface StartDeps extends StartServices {
  uiSettings: IUiSettingsClient;
}
export interface InternalOverlayBannersStart extends OverlayBannersStart {
  /** @internal */
  get$(): Observable<OverlayBanner[]>;
}
/** @internal */
export interface OverlayBanner {
  readonly id: string;
  readonly mount: MountPoint;
  readonly priority: number;
}
/** @internal */
export declare class OverlayBannersService {
  private readonly userBanner;
  start({ uiSettings, ...startServices }: StartDeps): InternalOverlayBannersStart;
  stop(): void;
}
export {};

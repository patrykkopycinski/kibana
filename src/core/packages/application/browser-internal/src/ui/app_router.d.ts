/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FunctionComponent } from 'react';
import type { History } from 'history';
import type { Observable } from 'rxjs';
import type { CoreTheme } from '@kbn/core-theme-browser';
import type { MountPoint } from '@kbn/core-mount-utils-browser';
import type { AppStatus } from '@kbn/core-application-browser';
import { type AppLeaveHandler } from '@kbn/core-application-browser';
import type { AnalyticsServiceStart } from '@kbn/core-analytics-browser';
import type { Mounter } from '../types';
interface Props {
  analytics: AnalyticsServiceStart;
  mounters: Map<string, Mounter>;
  history: History;
  theme$: Observable<CoreTheme>;
  appStatuses$: Observable<Map<string, AppStatus>>;
  setAppLeaveHandler: (appId: string, handler: AppLeaveHandler) => void;
  setAppActionMenu: (appId: string, mount: MountPoint | undefined) => void;
  setIsMounting: (isMounting: boolean) => void;
  setAppNotFoundState: (active: boolean) => void;
  hasCustomBranding$?: Observable<boolean>;
}
export declare const AppRouter: FunctionComponent<Props>;
export {};

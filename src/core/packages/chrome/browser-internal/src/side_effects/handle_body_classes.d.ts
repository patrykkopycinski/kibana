/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { type Observable } from 'rxjs';
import type { MountPoint } from '@kbn/core-mount-utils-browser';
import type { ChromeStyle, ChromeUserBanner } from '@kbn/core-chrome-browser';
export interface BodyClassesSideEffectDeps {
  kibanaVersion: string;
  headerBanner$: Observable<ChromeUserBanner | undefined>;
  isVisible$: Observable<boolean>;
  chromeStyle$: Observable<ChromeStyle | undefined>;
  actionMenu$: Observable<MountPoint | undefined>;
  stop$: Observable<void>;
}
/** Updates body CSS classes based on chrome state changes. */
export declare const handleBodyClasses: ({
  kibanaVersion,
  headerBanner$,
  isVisible$,
  chromeStyle$,
  actionMenu$,
  stop$,
}: BodyClassesSideEffectDeps) => void;

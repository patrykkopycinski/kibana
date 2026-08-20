/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { InternalInjectedMetadataSetup } from '@kbn/core-injected-metadata-browser-internal';
import type { InternalThemeServiceStart } from '@kbn/core-theme-browser-internal-types';
/** @internal */
export interface ThemeServiceSetupDeps {
  injectedMetadata: InternalInjectedMetadataSetup;
}
/** @internal */
export declare class ThemeService {
  private contract?;
  private themeMetadata?;
  private stylesheets;
  private theme$?;
  setup({ injectedMetadata }: ThemeServiceSetupDeps): InternalThemeServiceStart;
  start(): InternalThemeServiceStart;
  stop(): void;
  private applyTheme;
}

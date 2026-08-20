/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import { type ReactNode } from 'react';
import type { InternalChromeStart } from '@kbn/core-chrome-browser-internal-types';
interface ChromeContextValue {
  chrome: InternalChromeStart;
}
export interface ChromeServiceProviderProps {
  children: ReactNode;
  value: ChromeContextValue;
}
export declare function ChromeServiceProvider({
  children,
  value,
}: ChromeServiceProviderProps): React.FunctionComponentElement<
  React.ProviderProps<ChromeContextValue | null>
>;
export declare function useChromeService(): InternalChromeStart;
export {};

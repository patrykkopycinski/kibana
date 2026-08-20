/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactNode } from 'react';
import type React from 'react';
import type { ChromeLayoutSlots, LayoutState } from './layout.types';
export interface LayoutStateProps extends ChromeLayoutSlots {
  children: ReactNode;
}
/**
 * The layout state provider component.
 * Wires up the LayoutConfig to the layout state.
 *
 * @param props - Props for the LayoutStateProvider component.
 * @returns The rendered LayoutStateProvider component.
 */
export declare const LayoutStateProvider: ({
  children,
  ...props
}: LayoutStateProps) => React.JSX.Element;
export declare const useLayoutState: () => LayoutState;

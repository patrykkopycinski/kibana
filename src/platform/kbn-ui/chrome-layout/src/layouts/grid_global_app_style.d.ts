/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import { type UseEuiTheme } from '@elastic/eui';
import type { LayoutAppearance } from '../layout.types';
export declare const globalLayoutStyles: () => import('@emotion/utils').SerializedStyles;
/**
 * Framed appearance background styles with gradient.
 * Only applied when appearance is 'framed'.
 */
export declare const framedAppearanceBackgroundStyles: (
  euiThemeContext: UseEuiTheme
) => import('@emotion/utils').SerializedStyles;
export interface GridLayoutGlobalStylesProps {
  appearance?: LayoutAppearance;
}
export declare const GridLayoutGlobalStyles: ({
  appearance,
}: GridLayoutGlobalStylesProps) => React.JSX.Element;

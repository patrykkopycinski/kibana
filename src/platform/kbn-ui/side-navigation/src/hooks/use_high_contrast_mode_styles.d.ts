/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UseEuiTheme } from '@elastic/eui';
export {
  type HighContrastSeparatorOptions,
  getHighContrastBorder,
  getHighContrastSeparator,
} from '@kbn/ui-chrome-layout-utils';
export declare const highContrastHoverStyle: ({ euiTheme }: UseEuiTheme) => string;
/**
 * Hook to get the high contrast mode hover styles for buttons.
 *
 * @param selector - the selector to apply the high contrast mode hover styles to.
 * @returns the high contrast mode hover styles.
 */
export declare const useHighContrastModeStyles: (
  selector?: string
) => import('@emotion/utils').SerializedStyles | undefined;

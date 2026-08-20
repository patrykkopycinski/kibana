/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { layoutVar, layoutVarName } from './src/css_variables';
export type {
  LayoutVarName,
  CSSVarName,
  LayoutComponent,
  LayoutProperty,
  ApplicationComponent,
  ApplicationVarName,
} from './src/css_variables';
export { layoutLevels } from './src/levels';
export declare const APP_MAIN_SCROLL_CONTAINER_ID = 'app-main-scroll';
export declare const FLYOUT_SELECTOR = '.euiFlyout[role="dialog"]';
export declare const MAIN_CONTENT_SELECTORS: string[];
export declare const SIDE_PANEL_CONTENT_GAP = 8;
export declare const euiIncludeSelectorInFocusTrap: {
  prop: {
    'data-eui-includes-in-flyout-focus-trap': boolean;
  };
  selector: string;
};

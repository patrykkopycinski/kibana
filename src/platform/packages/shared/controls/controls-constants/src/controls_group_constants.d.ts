/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/** Controls group state */
export declare const CONTROLS_GROUP_TYPE = 'control_group';
export declare const DEFAULT_AUTO_APPLY_SELECTIONS = true;
/** This state is only relevant for sticky controls */
export declare const CONTROL_WIDTH_SMALL = 'small';
export declare const CONTROL_WIDTH_MEDIUM = 'medium';
export declare const CONTROL_WIDTH_LARGE = 'large';
type ControlWidth =
  | typeof CONTROL_WIDTH_SMALL
  | typeof CONTROL_WIDTH_MEDIUM
  | typeof CONTROL_WIDTH_LARGE;
export declare const DEFAULT_PINNED_CONTROL_STATE: {
  width: ControlWidth;
  grow: boolean;
};
export {};

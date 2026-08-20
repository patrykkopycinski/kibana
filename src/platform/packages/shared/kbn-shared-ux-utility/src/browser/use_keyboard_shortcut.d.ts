/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface KeyboardShortcut {
  key: string;
  /** Cmd on Mac, Ctrl on other platforms. */
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Literal Ctrl on all platforms (distinct from meta on Mac). */
  ctrl?: boolean;
}
export declare function useKeyboardShortcut(
  shortcut: KeyboardShortcut | undefined,
  callback: (() => void) | undefined
): void;

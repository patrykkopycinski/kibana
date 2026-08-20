/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Manages the last active item state for navigation panel openers.
 * Provides persistence across browser sessions using sessionStorage.
 */
export declare class PanelStateManager {
  private readonly basePath;
  private readonly key;
  private state;
  constructor(basePath?: string);
  getPanelLastActive(panelId: string): string | undefined;
  setPanelLastActive(panelId: string, itemId: string): void;
  clear(): void;
  private load;
  private save;
}

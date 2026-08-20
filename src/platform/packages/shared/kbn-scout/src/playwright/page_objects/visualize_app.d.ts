/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '..';
import type { SavedObjectSaveModal } from './saved_object_save_modal';
type VisType = 'lens' | 'vega' | 'metrics' | 'aggbased' | 'maps';
export declare class VisualizeApp {
  private readonly page;
  private readonly landingPage;
  private readonly newItemButton;
  private readonly visNewDialogGroups;
  private readonly visNewDialogTypes;
  private readonly legacyTab;
  private readonly visualizeSaveButton;
  private readonly visualizationLoader;
  private readonly editInLensButton;
  /** Save modal locators/actions, shared with other apps (e.g. Maps) via `SavedObjectSaveModal`. */
  readonly saveModal: SavedObjectSaveModal;
  constructor(page: ScoutPage);
  goto(): Promise<void>;
  openNewVisualizationWizard(): Promise<void>;
  clickLegacyTab(): Promise<void>;
  clickVisType(type: VisType): Promise<void>;
  clickAggBasedType(subType: string): Promise<void>;
  selectDataSource(name: string): Promise<void>;
  waitForVisualizationLoaded(): Promise<void>;
  clickSavedVisualization(title: string): Promise<void>;
  openSavedVisualization(
    title: string,
    options?: {
      waitFor?: 'agg' | 'lens';
    }
  ): Promise<void>;
  openSaveModal(): Promise<void>;
  saveToExistingDashboard(visName: string, dashboardTitle: string): Promise<void>;
  saveToNewDashboard(visName: string): Promise<void>;
  saveToLibrary(visName: string): Promise<void>;
  createAggBasedVisualization(subType: string, dataSource: string): Promise<void>;
  createVegaVisualization(): Promise<void>;
  createMapVisualization(): Promise<void>;
  createTSVBVisualization(): Promise<void>;
  clickEditInLensButton(): Promise<void>;
  getEditInLensButton(): import('playwright-core').Locator;
}
export {};

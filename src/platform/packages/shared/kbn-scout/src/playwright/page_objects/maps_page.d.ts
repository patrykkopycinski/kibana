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
export declare class MapsPage {
  private readonly page;
  readonly mapContainer: import('playwright-core').Locator;
  readonly mapRenderComplete: import('playwright-core').Locator;
  readonly saveAndReturnButton: import('playwright-core').Locator;
  readonly saveButton: import('playwright-core').Locator;
  readonly addLayerButton: import('playwright-core').Locator;
  readonly layerAddForm: import('playwright-core').Locator;
  readonly importFileButton: import('playwright-core').Locator;
  readonly returnToOriginSwitch: import('playwright-core').Locator;
  readonly documentsItem: import('playwright-core').Locator;
  private readonly mapLayerToc;
  private readonly layerTocTooltip;
  /** Save modal locators/actions, shared with other apps (e.g. Visualize) via `SavedObjectSaveModal`. */
  readonly saveModal: SavedObjectSaveModal;
  constructor(page: ScoutPage);
  gotoNewMap(): Promise<void>;
  waitForRenderComplete(): Promise<void>;
  selectLayerWizardByTitle(title: string): Promise<void>;
  saveFromModal(
    title: string,
    {
      redirectToOrigin,
    }: {
      redirectToOrigin?: boolean;
    }
  ): Promise<void>;
  getLayerToggleButton(displayName: string): import('playwright-core').Locator;
  addDocumentsLayer(documentSelector: string): Promise<void>;
  /** Waits until Map layer TOC has entries and loading indicators are gone (FTR parity). */
  waitForLayersToLoad(): Promise<void>;
  getLayerTocTooltipMsg(layerName: string): Promise<string>;
  /** Reloads the page and dismisses the unsaved-changes browser dialog if present. */
  refreshAndClearUnsavedChangesWarning(): Promise<void>;
}

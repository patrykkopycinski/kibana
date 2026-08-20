/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '..';
/**
 * Page object for the shared `SavedObjectSaveModal` (and its `SaveModalDashboardSelector`
 * add-to-dashboard controls), used when saving visualizations, maps, and other saved objects.
 * Assumes the modal is already open; each app opens it differently (e.g. Visualize's
 * `visualizeSaveButton`, Maps' `saveButton`).
 */
export declare class SavedObjectSaveModal {
  private readonly page;
  /** The modal container itself, exposed so callers can wait for it to open (e.g. after clicking an app-specific save button). */
  readonly modal: import('playwright-core').Locator;
  private readonly titleInput;
  private readonly descriptionInput;
  private readonly confirmSaveButton;
  private readonly dashboardPicker;
  private readonly tagSelector;
  private readonly tagForm;
  private readonly tagColorInput;
  private readonly tagSaturationPopover;
  constructor(page: ScoutPage);
  fillTitle(name: string): Promise<void>;
  fillDescription(description: string): Promise<void>;
  /**
   * Opens the tag selector's "Create a new tag" option and fills/submits the tag-creation
   * form. The color field opens a saturation-picker popover on click; pressing Enter commits
   * the typed hex value and closes it so it doesn't intercept later clicks (e.g. the confirm
   * button below the description field).
   */
  createAndSelectTag(fields: { name: string; color: string; description?: string }): Promise<void>;
  selectExistingDashboard(dashboardTitle: string): Promise<void>;
  selectNewDashboard(): Promise<void>;
  selectNoDashboard(): Promise<void>;
  confirm(): Promise<void>;
  saveToExistingDashboard(name: string, dashboardTitle: string): Promise<void>;
  saveToNewDashboard(name: string): Promise<void>;
  saveToLibrary(name: string): Promise<void>;
}

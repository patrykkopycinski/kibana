/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Download } from 'playwright-core';
import type { Locator } from '../../..';
import type { ScoutPage } from '..';
import type { KibanaCodeEditorWrapper } from '../ui_components';
export type DiscoverQueryMode = 'esql' | 'classic';
export interface DiscoverGotoOptions {
  queryMode: DiscoverQueryMode;
  /** Open a Discover session by id (`#/view/{id}`) instead of a blank Discover page. */
  savedSearchId?: string;
}
export interface DataViewOptions {
  /** Data view title; `*` is appended automatically by the editor. */
  name: string;
  /** Create a temporary ("ad hoc") data view via "Explore" instead of saving. */
  adHoc?: boolean;
}
export declare class DiscoverApp {
  private readonly page;
  readonly codeEditor: KibanaCodeEditorWrapper;
  private readonly dataGrid;
  constructor(page: ScoutPage);
  goto(options: DiscoverGotoOptions): Promise<void>;
  private waitForDiscoverPage;
  private getVisibleDataViewSwitch;
  private hideTabPreview;
  private openDataViewSwitcher;
  selectDataView(
    name: string,
    {
      createAdHocIfMissing,
      waitForFieldList,
    }?: {
      createAdHocIfMissing?: boolean;
      waitForFieldList?: boolean;
    }
  ): Promise<void>;
  getSelectedDataView(): Locator;
  /**
   * Returns the trimmed display name of the currently selected data view.
   */
  getSelectedDataViewName(): Promise<string>;
  private fillAndSubmitDataViewEditor;
  /**
   * Creates a new data view from the Discover search bar data-view switcher
   * (classic mode only). The editor appends `*` to the title automatically.
   */
  createDataViewFromSearchBar(options: DataViewOptions): Promise<void>;
  createDataViewFromNoDataPrompt(options: DataViewOptions): Promise<void>;
  getAvailableDataViewsFromSearchBar(): Promise<string[]>;
  isCurrentDataViewAdHoc(): Promise<boolean>;
  editCurrentDataViewName(
    name: string,
    {
      withConfirmation,
    }?: {
      withConfirmation?: boolean;
    }
  ): Promise<void>;
  editDataViewFromSearchBar({
    newIndexPattern,
    newTimeField,
  }: {
    newIndexPattern?: string;
    newTimeField?: string;
  }): Promise<void>;
  createRuntimeField({
    fieldName,
    script,
    popularity,
  }: {
    fieldName: string;
    script: string;
    popularity?: number;
  }): Promise<void>;
  getCurrentDataViewId(): Promise<string>;
  deleteRuntimeField(fieldName: string): Promise<void>;
  renameRuntimeField(newFieldName: string): Promise<void>;
  setPopularity(popularity: number): Promise<void>;
  setCustomLabel(
    label: string,
    {
      enableToggle,
    }?: {
      enableToggle?: boolean;
    }
  ): Promise<void>;
  setCustomDescription(
    description: string,
    {
      enableToggle,
    }?: {
      enableToggle?: boolean;
    }
  ): Promise<void>;
  getCustomDescriptionFormError(): Locator;
  saveOpenFieldEditor({ confirmChange }?: { confirmChange?: boolean }): Promise<void>;
  discardOpenFieldEditorChanges(): Promise<void>;
  clickAppMenuItem(
    testId: string,
    {
      isInOverflowMenu,
    }?: {
      isInOverflowMenu?: boolean;
    }
  ): Promise<void>;
  private dismissHoverOverlays;
  clickNewSearch({ isInOverflowMenu }?: { isInOverflowMenu?: boolean }): Promise<void>;
  private confirmSaveModal;
  openSaveSearchModal(name?: string): Promise<void>;
  private getStoreTimeWithSearchSwitch;
  saveSearch(
    name: string,
    {
      storeTimeRange,
    }?: {
      storeTimeRange?: boolean;
    }
  ): Promise<void>;
  saveSearchAsNew(name: string): Promise<void>;
  saveUnsavedChanges(): Promise<void>;
  getSharedUrl(): Promise<string>;
  closeShareModal(): Promise<void>;
  /**
   * Save the currently rendered inline visualization (e.g. an ES|QL chart) to a
   * brand-new dashboard via the "Save visualization" flow in the unified
   * histogram. Returns once the save modal has closed.
   */
  saveVisualizationToNewDashboard(visName: string): Promise<void>;
  waitUntilFieldListHasCountOfFields(): Promise<void>;
  /**
   * Returns the number of fields shown in the sidebar "Available fields" group.
   */
  getSidebarAvailableFieldCount(): Promise<number>;
  /**
   * Filters the sidebar field list by the given search term.
   */
  searchFieldInSidebar(name: string): Promise<void>;
  /**
   * Assert that the "Selected fields" sidebar group contains exactly the
   * fields named in `expected` — no more, no less. Useful for verifying ES|QL
   * `KEEP` clauses or any explicit column-selection flow.
   */
  expectSelectedSidebarFieldsToEqual(expected: readonly string[]): Promise<void>;
  waitForHistogramRendered(): Promise<void>;
  /**
   * Returns the rendered height (rounded to whole pixels) of the fixed histogram panel
   * Rounding avoids sub-pixel noise so callers can assert exact resize deltas.
   */
  getHistogramHeight(): Promise<number>;
  /**
   * Drags the histogram resize handle vertically by `distance` pixels (positive
   * grows the histogram).
   * Neither Scout nor Playwright has a drag-by-offset helper (Scout's
   * `testSubj.dragTo` only drags element-to-element), so we drive the mouse
   * manually.
   */
  resizeHistogramBy(distance: number): Promise<void>;
  getCurrentQueryName(): Promise<string>;
  loadSavedSearch(searchName: string): Promise<void>;
  getHitCountInt(): Promise<number>;
  getHitCount(): Promise<string>;
  getRefreshDataButton(): Locator;
  getQuerySubmitButton(): Locator;
  getQueryCancelButton(): Locator;
  getSearchResponseWarningsEmptyPrompt(): Locator;
  getSearchFetchCount(): Promise<number>;
  getErrorCalloutTitle(): Locator;
  getErrorCalloutMessage(): Locator;
  getChartTimespan(): Promise<string>;
  getHistogramSuggestionType(): Promise<string | null>;
  clickHistogramBar(): Promise<void>;
  waitUntilTabIsLoaded(): Promise<void>;
  waitUntilSearchingHasFinished(): Promise<void>;
  private waitUntilHitCountHasSettled;
  getDocTableIndex(index: number): Promise<string>;
  getSearchTermHighlights(): Locator;
  getDocTableField(index: number): Promise<string>;
  getChartInterval(): Promise<string>;
  /**
   * Pick a histogram chart interval (e.g. `"Day"`).
   */
  setChartInterval(intervalTitle: string): Promise<void>;
  /**
   * Click the histogram breakdown selector and pick `field` (or `"No breakdown"`).
   */
  chooseBreakdownField(field: string): Promise<void>;
  /**
   * Returns the label currently shown on the histogram breakdown selector button
   * (e.g. `"Breakdown by geo.src"` or `"No breakdown"`.
   */
  getBreakdownFieldValue(): Promise<string>;
  /**
   * Clears the histogram breakdown field by selecting the "No breakdown" option.
   */
  clearBreakdownField(): Promise<void>;
  expandTimeRangeAsSuggestedInNoResultsMessage(): Promise<void>;
  revertUnsavedChanges(): Promise<void>;
  unsavedChangesIndicator(): Locator;
  readonly controls: {
    getControlFrame: (controlId: string) => Locator;
    getControlFrameSelectedValue: (controlId: string, value: string) => Locator;
  };
  getDocHeaderLabels(): Locator;
  getDocHeader(): Promise<string[]>;
  /**
   * Returns structured row data from the data grid, excluding control columns.
   * Each inner array contains the visible text of each data cell in that row.
   * When `isAnchorRow` is true, only the highlighted anchor row (context view) is returned.
   */
  getDataGridRows(options?: { isAnchorRow?: boolean }): Promise<string[][]>;
  showChart(): Promise<void>;
  hideChart(): Promise<void>;
  showTable(): Promise<void>;
  hideTable(): Promise<void>;
  expectXYVisChartVisible(): Promise<void>;
  navigateToLensEditor(): Promise<void>;
  openLensEditFlyout(): Promise<void>;
  getLensEditFlyout(): Locator;
  openEsqlQuickReferenceFlyout(): Promise<void>;
  getEsqlQuickReferenceFlyout(): Locator;
  getTheColumnFromGrid(): Promise<string[]>;
  writeAndSubmitKqlQuery(query: string): Promise<void>;
  dragFieldToGrid(fieldName: string[]): Promise<void>;
  /**
   * Drags a sidebar field onto the grid using the keyboard, mirroring the FTR
   * `dragFieldWithKeyboardToTable` implementation.
   */
  dragFieldToGridWithKeyboard(fieldName: string): Promise<void>;
  getFirstViewLensButtonFromFieldStatistics(): Promise<Locator>;
  exportAsCsv(): Promise<Download>;
  moveColumn(fieldName: string, direction: 'left' | 'right'): Promise<void>;
  selectTextBaseLang(): Promise<void>;
  selectClassicMode(): Promise<void>;
  selectFieldStatisticsView(): Promise<void>;
  writeAndSubmitEsqlQuery(query: string): Promise<void>;
  /**
   * Submits the current query (classic search bar or ES|QL editor) by clicking
   * the query submit button. Does not wait for results — pair with
   * `waitUntilSearchingHasFinished()` or `waitUntilTabIsLoaded()` as appropriate.
   */
  submitQuery(): Promise<void>;
  getQuerySubmitButtonLabel(): Promise<string | null>;
  waitForDataGridRowWithRefresh(rowLocator: Locator, timeout?: number): Promise<void>;
  get esqlMenuPopover(): Locator;
  openRecommendedQueriesPanel(): Promise<void>;
  runRecommendedEsqlQuery(queryLabel: string): Promise<void>;
  getEsqlQueryValue(nthIndex?: number): Promise<string>;
  openSidebar(): Promise<void>;
  closeSidebar(): Promise<void>;
  isSidebarPanelOpen(): Promise<boolean>;
  getSidebarWidth(): Promise<number>;
  resizeSidebarBy(distance: number): Promise<void>;
  isEsqlHistoryPanelOpen(): Promise<boolean>;
  toggleEsqlHistoryPanel(): Promise<void>;
  getEsqlEditorHeight(): Promise<number>;
  resizeEsqlEditorBy(distance: number): Promise<void>;
  addBreakdownFieldFromSidebar(field: string, section?: 'selected' | 'available'): Promise<void>;
  private waitUntilFieldPopoverIsLoaded;
  /**
   * Scrolls through the virtualized doc table grid to assert that the given
   * text exists somewhere in the rendered rows. Necessary because virtual
   * scrolling only keeps a subset of rows in the DOM at any time.
   */
  expectDocTableToContainText(text: string): Promise<void>;
  /**
   * Seeds the persisted query mode in localStorage on the next page load. Discover
   * ignores `currentMode` unless `defaultMode` matches the resolved default (the
   * `discover.isEsqlDefault` flag), so `defaultMode` defaults to `'classic'` to
   * match today's default. When the flag is flipped to make ES|QL the default,
   * update `defaultMode` or the seed is ignored.
   *
   * Not idempotent: each call adds an `addInitScript` that reruns on every later
   * load in order, so the last write wins. Avoid calling it more than once per
   * test unless that stacking is intentional.
   */
  setQueryMode(
    currentMode: DiscoverQueryMode,
    defaultMode?: DiscoverQueryMode
  ): Promise<import('playwright-core').Disposable>;
  /**
   * Detects whether Discover is currently rendering ES|QL or classic
   * (KQL + data view) mode by racing the two mode-specific anchors:
   * the ES|QL editor and the classic KQL `queryInput`.
   */
  getCurrentQueryMode(): Promise<DiscoverQueryMode>;
  isShowingDocViewer(): Promise<boolean>;
  getCascadeLayout(): Locator;
  /**
   * Trigger for the "Group by" popover in the cascade layout toolbar. Despite
   * the `...Switch` test subject it is a popover button, not a toggle — use
   * {@link optOutOfCascadeLayout} to actually leave the cascade layout.
   */
  getCascadeLayoutSwitch(): Locator;
  /**
   * Leaves the cascade ("grouped results") layout that Discover switches to for
   * `STATS ... BY` ES|QL queries, restoring the flat doc table. Expects the
   * cascade layout to be showing — it fails rather than silently doing nothing
   * if the layout is absent, so callers notice when the trigger stops applying.
   */
  optOutOfCascadeLayout(): Promise<void>;
  isShowingCascadeLayout(): Promise<boolean>;
  private getCascadeScrollContainer;
  /**
   * Returns the ids of the top-level ("root") cascade rows currently
   * scrolled into view within the cascade scroll container.
   */
  getCascadeLayoutVisibleRowIds(): Promise<string[]>;
  /**
   * Whether the given cascade row id is currently expanded.
   */
  isCascadeLayoutRowExpanded(rowId: string): Promise<boolean>;
  /**
   * Clicks the expand/collapse toggle for the cascade row with the given id,
   * without waiting for the resulting state change. Scoped to the row: while
   * scrolled, the sticky pinned group header renders a `createPortal`
   * duplicate of this same button elsewhere in the DOM (outside the row), so
   * an unscoped page-wide testSubj locator can match two elements.
   */
  clickCascadeRowToggle(rowId: string): Promise<void>;
  /**
   * Waits until the cascade row with the given id reports the given expansion
   * state, without waiting for the data of an expanded row to load.
   */
  waitForCascadeLayoutRowExpanded(rowId: string, expanded: boolean): Promise<void>;
  /**
   * Toggles (expands/collapses) the cascade row with the given id and waits
   * for the `aria-expanded` state to flip before returning. Waits for the doc
   * table to finish rendering after an expand, since that triggers a fetch.
   */
  toggleCascadeLayoutRow(rowId: string): Promise<void>;
  /**
   * Waits for the cascade layout's virtualizer to finish
   * measuring/correcting itself (e.g. restoring a scroll anchor after a tab
   * switch). The scroll container is hidden behind a loading spinner via
   * `visibility: hidden` until the virtualizer reports itself stable.
   */
  waitForCascadeLayoutStable(): Promise<void>;
  /**
   * Current `scrollTop` of the cascade layout's scroll container.
   */
  getCascadeLayoutScrollTop(): Promise<number>;
  /**
   * Scrolls the cascade layout's scroll container by `delta` pixels.
   */
  scrollCascadeLayoutBy(delta: number): Promise<void>;
  /**
   * Waits for a just-performed scroll/expand of the cascade layout to be
   * persisted for state restoration. Persistence is debounced/throttled
   * internally with no externally observable signal, so callers must pause
   * here before triggering a remount (e.g. switching tabs) or the
   * just-performed change can be dropped and restored from stale state.
   */
  waitForCascadeStatePersisted(): Promise<void>;
}

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator } from '../../..';
import type { ScoutPage } from '..';
export type DataGridDensity = 'Compact' | 'Normal' | 'Expanded';
export type DataGridRowHeight = 'Auto' | 'Custom';
export type DataGridComparisonDiffMode = 'Full value' | 'By character' | 'By word' | 'By line';
export type DataGridPaginationScope = 'discover' | 'docViewer';
export declare class DataGrid {
  private readonly page;
  constructor(page: ScoutPage);
  private getRowSelectionCheckbox;
  private readHeaderLabels;
  private resizeColumn;
  private waitUntilFieldListHasCountOfFields;
  private getPaginationContainer;
  addFieldFromSidebar(field: string): Promise<void>;
  changeRowsPerPageTo(rowsPerPage: number, scope?: DataGridPaginationScope): Promise<void>;
  closeInTableSearch(): Promise<void>;
  expandCell({ rowIndex, columnId }: { rowIndex: number; columnId: string }): Promise<void>;
  expandMetaFieldsSection(): Promise<void>;
  getCell(rowIndex: number, columnId: string): Locator;
  /**
   * Returns all cells for a given column at a specific visible row index across all embedded grids
   * on the page (e.g. two saved-search panels on a dashboard). Use this instead of inlining the
   * multi-attribute selector when you need to count or compare cells across multiple grid instances.
   */
  getCellsAtVisibleRowIndex(columnId: string, visibleRowIndex: number): Locator;
  /**
   * Returns the leaf value node of a data-grid cell. Prefer this over
   * `getCell` when asserting on the rendered value: the gridcell wrapper's
   * text content concatenates child nodes (adding stray newlines), whereas the
   * value node holds the formatted value exactly.
   */
  getCellValue(rowIndex: number, columnId: string): Locator;
  getColumnHeader(name: string): Locator;
  getColumnTitles(scope?: Locator): Promise<string[]>;
  getColumnWidth(field: string): Promise<number>;
  getCurrentDensityValue(): Promise<DataGridDensity>;
  getPageButton(pageIndex: number, scope?: DataGridPaginationScope): Locator;
  getCurrentPageButton(scope?: DataGridPaginationScope): Locator;
  getCurrentRowHeight(scope?: 'row' | 'header'): Promise<DataGridRowHeight>;
  getCurrentRowsPerPage(scope?: DataGridPaginationScope): Promise<number>;
  getCurrentPageNumber(scope?: DataGridPaginationScope): Promise<string>;
  getCurrentSampleSize(): Promise<number>;
  getDataGridFooterText(): Promise<string>;
  getDataGridHeaderFieldTokens(limit?: number): Promise<string[]>;
  getDocTableRowCount(): Promise<number>;
  getDocumentColumnFieldValue(rowIndex: number, fieldName: string): Locator;
  getInTableSearchCellMatches(rowIndex: number, columnId: string): Locator;
  getInTableSearchInput(): Locator;
  getInTableSearchMatchesCounter(): Locator;
  getNumberOfSelectedRows(): Promise<number>;
  getNumberOfSelectedRowsOnCurrentPage(): Promise<number>;
  goToLastSamplePage(sampleSize: number, rowsPerPage: number): Promise<void>;
  goToNextInTableSearchMatch(): Promise<void>;
  getInTableSearchTerm(): Promise<string | null>;
  isSelectedRowsMenuVisible(): Promise<boolean>;
  clickCompareSelectedButton(): Promise<void>;
  isComparisonModeActive(): Promise<boolean>;
  openComparisonSettings(): Promise<void>;
  selectComparisonDiffMode(mode: 'basic' | 'chars' | 'words' | 'lines'): Promise<void>;
  getComparisonDiffMode(): Promise<DataGridComparisonDiffMode>;
  /**
   * The rendered field-name cells of the comparison table. Exposed as a `Locator` so callers
   * can assert on it with auto-retry (e.g. `expect(cells).toHaveText([...])`) while the table
   * is still catching up with newly selected columns.
   */
  getComparisonFieldNameCells(): Locator;
  getComparisonFieldNames(): Promise<string[]>;
  getComparisonFieldCount(): Promise<number>;
  compareSelectedButtonExists(): Promise<boolean>;
  getComparisonRow(rowIndex: number): Promise<{
    fieldName: string;
    values: string[];
  }>;
  getComparisonDiffSegments(
    rowIndex: number,
    colIndex: number
  ): Promise<
    Array<{
      decoration: 'removed' | 'added' | undefined;
      value: string;
    }>
  >;
  private toggleComparisonSwitch;
  toggleShowDiffSwitch(): Promise<void>;
  toggleShowAllFieldsSwitch(): Promise<void>;
  toggleShowMatchingValuesSwitch(): Promise<void>;
  toggleShowDiffDecorationsSwitch(): Promise<void>;
  exitComparisonMode(): Promise<void>;
  openColumnMenuByField(field: string): Promise<void>;
  openDocumentDetails({ rowIndex }: { rowIndex: number }): Promise<void>;
  openGridDisplaySettings(): Promise<void>;
  openInTableSearch(): Promise<void>;
  openSelectedRowsMenu(): Promise<void>;
  resetColumnWidth(field: string): Promise<void>;
  resizeColumnInDashboard(
    field: string,
    delta: number
  ): Promise<{
    originalWidth: number;
    newWidth: number;
  }>;
  resizeColumnInDiscover(
    field: string,
    delta: number
  ): Promise<{
    originalWidth: number;
    newWidth: number;
  }>;
  runInTableSearch(searchTerm: string): Promise<void>;
  setInTableSearchTerm(searchTerm: string): Promise<void>;
  selectRow(
    rowIndex: number,
    {
      pressShiftKey,
    }?: {
      pressShiftKey?: boolean;
    }
  ): Promise<void>;
  setDensityValue(newValue: DataGridDensity): Promise<void>;
  setRowHeight(newValue: DataGridRowHeight, scope?: 'row' | 'header'): Promise<void>;
  setSampleSize(newValue: number): Promise<void>;
  waitForDocTableRendered(): Promise<void>;
  getRowActions(): Promise<Locator[]>;
  waitForLoad(): Promise<void>;
  /**
   * Sorts a column via its header menu. The direction is carried entirely by
   * `sortOption`, which is the menu entry's label and varies by field type:
   * `Sort A-Z` / `Sort Z-A` for strings, `Sort Old-New` / `Sort New-Old` for
   * dates, `Sort Low-High` / `Sort High-Low` for numbers.
   */
  sortColumn(field: string, sortOption: string): Promise<void>;
}

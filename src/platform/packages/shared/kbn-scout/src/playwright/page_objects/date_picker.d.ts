/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '..';
import type { Locator } from '../../..';
export declare enum DateUnitSelector {
  Seconds = 's',
  Minutes = 'm',
  Hours = 'h',
}
export interface RefreshConfig {
  interval: string;
  units: string;
  isPaused: boolean;
}
export declare class DatePicker {
  private readonly page;
  private readonly quickMenuButton;
  private readonly toggleRefreshButton;
  private readonly refreshIntervalInput;
  private readonly refreshIntervalUnitSelect;
  constructor(page: ScoutPage);
  /**
   * Detects whether the page is using the new DateRangePicker or the legacy
   * EuiSuperDatePicker. Not cached because the lazy page object proxy lacks a
   * `set` trap, so instance property writes through the proxy are lost.
   *
   * When a containerLocator is provided, the detection is scoped to that
   * container (useful when the only DateRangePicker lives inside a panel).
   */
  private isNewDateRangePicker;
  private getTestSubjLocator;
  private getDateRangePresetTestSubject;
  private showStartEndTimes;
  private openAbsoluteTab;
  private typeAbsoluteRangeLegacy;
  private ensurePickerVisible;
  openDateRangePickerPresetsPanel(): Promise<void>;
  closeDateRangePickerPresetsPanel(): Promise<void>;
  private openCustomRangePanel;
  private setDatePart;
  private typeAbsoluteRangeNewPicker;
  private openDateRangePickerSettingsPanel;
  private closeDateRangePickerSettingsPanel;
  private openLegacyQuickMenu;
  setCommonlyUsedTime(option: string): Promise<void>;
  setTextRange(value: string): Promise<void>;
  saveCurrentRangeAsPreset(): Promise<void>;
  getDateRangePreset(label: string): Locator;
  /**
   * Delete action for a preset. Only user-saved presets expose one; presets
   * coming from the `timepicker:quickRanges` uiSetting are locked.
   */
  getDateRangePresetDeleteButton(label: string): Locator;
  deleteDateRangePreset(label: string): Promise<void>;
  setAbsoluteRange({ from, to }: { from: string; to: string }): Promise<void>;
  setAbsoluteRangeInRootContainer({
    from,
    to,
    containerLocator,
  }: {
    from: string;
    to: string;
    containerLocator: Locator;
  }): Promise<void>;
  /** @deprecated Use {@link setAbsoluteRangeInRootContainer} instead. */
  typeAbsoluteRange({
    from,
    to,
    validateDates,
    containerLocator,
  }: {
    from: string;
    to: string;
    validateDates?: boolean;
    containerLocator?: Locator;
  }): Promise<void>;
  getTimeConfig(): Promise<{
    start: string;
    end: string;
  }>;
  getRefreshConfig(): Promise<RefreshConfig>;
  /**
   * Returns the human-readable time range label shown by whichever picker is
   * active.
   *
   * - New DateRangePicker: the value-display node renders the full label
   *   (e.g. "Last 24 hours", "30 days ago → 10 days ago").
   * - Legacy EuiSuperDatePicker: joins the start/end popover button labels when
   *   an explicit start/end range is shown, otherwise returns the quick-range
   *   "show dates" label.
   */
  getTimeRangeText(containerLocator?: Locator): Promise<string>;
  startAutoRefresh(interval: number, dateUnit?: DateUnitSelector): Promise<void>;
  pauseAutoRefresh(): Promise<void>;
  waitToBeHidden(): Promise<void>;
  getTimePickerControl(): Locator;
  getDisabledDatePickerIndicator(): Locator;
  timePickerExists(): Promise<boolean>;
}

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator } from '@playwright/test';
import type { ScoutPage } from '..';
/**
 * Page object that wraps common interactions with the Kibana Monaco-based code editor.
 *
 * Initially the API is intentionally aligned with the FTR `MonacoEditorService`
 * (`src/platform/test/functional/services/monaco_editor.ts`).
 */
export declare class KibanaCodeEditorWrapper {
  private readonly page;
  constructor(page: ScoutPage);
  /**
   * Waits for the Monaco textarea inside the container (visible + enabled), like FTR
   * `waitCodeEditorReady`.
   */
  waitCodeEditorReady(dataTestSubjId: string): Promise<void>;
  getCodeEditorContent(dataTestSubjId?: string): Locator;
  /**
   * Returns the current value of the Monaco editor model at the given index.
   *
   * This uses the globally registered `window.MonacoEnvironment.monaco.editor`
   * (see `src/platform/packages/shared/kbn-monaco/src/register_globals.ts`).
   *
   * @param nthIndex - Index of the Monaco text model to read. Defaults to `0`.
   * @returns The current editor value as a string. If no models are registered,
   *   an empty string is returned.
   */
  getCodeEditorValue(nthIndex?: number): Promise<string>;
  /**
   * Sets the value of the Monaco editor model at the given index using the
   * global `MonacoEnvironment`, and verifies that the value was applied.
   *
   * @param value - New value to set in the editor.
   * @param nthIndex - Optional index of the Monaco text model to update.
   *   When omitted, all models are updated (matching the FTR behavior).
   */
  setCodeEditorValue(value: string, nthIndex?: number): Promise<string>;
  /**
   * Returns a locator for the current Monaco error markers inside the given
   * editor container.
   *
   * This mirrors the FTR helper that finds `.cdr.squiggly-error` elements,
   * but exposes a Playwright `Locator` so callers can assert on count, text, etc.
   *
   * @param testSubjId - `data-test-subj` of the editor container.
   *   Defaults to `'kibanaCodeEditor'`.
   * @returns A Playwright `Locator` for the current error markers.
   */
  getCurrentMarkers(testSubjId?: string): Locator;
  getCodeEditorSuggestWidget(): Locator;
  /**
   * Returns a locator for the Monaco suggestion detail panel (the documentation pop-up
   * displayed alongside the autocomplete suggestion list).
   *
   * The detail panel has no `data-test-subj`. Monaco renders it as an *overlay widget*
   * (via `addOverlayWidget`) which is placed inside the main `.monaco-editor` element,
   * NOT inside the overflow-widgets container (which only holds content widgets).
   */
  getSuggestDetailsContainer(): Locator;
  /**
   * Positions the cursor after the given `text` in the editor model (if provided),
   * then programmatically triggers the Monaco autocomplete suggestion list.
   *
   * @param text - Optional substring to position the cursor after before triggering.
   *   When omitted the cursor stays at its current position.
   * @param nthIndex - Index of the Monaco text model to use. Defaults to `0`.
   */
  triggerSuggest(text?: string, nthIndex?: number): Promise<void>;
  /**
   * Toggles the Monaco suggestion detail panel (the documentation pop-up displayed
   * alongside the autocomplete suggestion list) for the given editor instance.
   *
   * The precondition `HasFocusedSuggestion` must already be satisfied — call
   * `triggerSuggest()` and navigate to an item with `ArrowDown` before calling this.
   *
   * @param editorIndex - Index of the editor instance to target. Defaults to `0`.
   */
  toggleSuggestDetails(editorIndex?: number): Promise<void>;
  setScrollTop(scrollTop: number, editorIndex?: number): Promise<void>;
  getScrollTop(editorIndex?: number): Promise<number>;
  /**
   * Locator for a Monaco *inline decoration* rendered via `inlineClassName`
   * (e.g. the ES|QL editor's lookup-join badges). These are plain `<span>`s
   * injected by Monaco's decoration API, not React elements, so they can't
   * carry a `data-test-subj` — a CSS class is the correct way to target them.
   */
  getDecoration(decorationClassName: string): Locator;
  private getHoverPopover;
  /**
   * Hovers a Monaco inline decoration (see {@link getDecoration}) and returns
   * the text of its `hoverMessage` tooltip once the popover has rendered.
   */
  getDecorationHoverText(decorationClassName: string): Promise<string>;
  /**
   * Hovers a Monaco inline decoration and clicks the hover-popover row whose
   * text contains `optionText` (e.g. an "Edit lookup index" action link).
   */
  selectDecorationHoverOption(decorationClassName: string, optionText: string): Promise<void>;
}

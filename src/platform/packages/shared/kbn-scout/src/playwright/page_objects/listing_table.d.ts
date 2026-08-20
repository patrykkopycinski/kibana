/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '..';
export declare class ListingTable {
  private readonly page;
  private readonly table;
  private readonly searchBox;
  constructor(page: ScoutPage);
  waitUntilTableIsLoaded(options?: { timeout?: number }): Promise<void>;
  getAllItemsNames(): Promise<string[]>;
  searchFor(text: string): Promise<void>;
  selectFilterTags(...tagNames: string[]): Promise<void>;
  /**
   * Filters the listing by the given title. Wraps `title` in quotes so that
   * names containing special characters (e.g. `"(1)"`) are matched literally rather
   * than tokenized by the saved-object search syntax.
   */
  searchForItemTitle(title: string): Promise<void>;
  clearSearchFilter(): Promise<void>;
}

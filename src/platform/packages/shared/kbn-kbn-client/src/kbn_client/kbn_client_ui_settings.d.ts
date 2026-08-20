/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { KbnClientRequester } from './kbn_client_requester';
export type UiSettingValues = Record<string, string | number | boolean | string[]>;
export declare const MAX_UI_SETTINGS_EVENTUAL_CACHE_REFRESH_WAIT_MS = 11000;
export declare class KbnClientUiSettings {
  private readonly log;
  private readonly requester;
  private readonly defaults?;
  constructor(
    log: ToolingLog,
    requester: KbnClientRequester,
    defaults?: UiSettingValues | undefined
  );
  get(
    setting: string,
    {
      space,
    }?: {
      space?: string;
    }
  ): Promise<string | number | boolean>;
  /**
   * Gets defaultIndex from the config doc.
   */
  getDefaultIndex(): Promise<string | number | boolean>;
  /**
   * Unset a uiSetting
   */
  unset(
    setting: string,
    {
      space,
    }?: {
      space?: string;
    }
  ): Promise<any>;
  /**
   * Replace all uiSettings with the `doc` values, `doc` is merged
   * with some defaults
   */
  replace(
    doc: UiSettingValues,
    {
      retries,
      space,
    }?: {
      retries?: number;
      space?: string;
    }
  ): Promise<void>;
  /**
   * Add fields to the config doc (like setting timezone and defaultIndex)
   */
  update(
    updates: UiSettingValues,
    {
      space,
    }?: {
      space?: string;
    }
  ): Promise<void>;
  /**
   * Wait for a uiSettings write to become visible on other Kibana nodes in tests.
   *
   * Deployment-agnostic stateful runs can serve the next request from a different Kibana node than
   * the one that handled the write, so server-side consumers may observe stale advanced settings
   * until the shared cache expires. See https://github.com/elastic/kibana/issues/265720.
   */
  waitForEventualCacheRefresh(): Promise<void>;
  /**
   * Update UI settings globally (like setting 'hideAnnouncements', 'theme:darkMode', etc)
   */
  updateGlobal(updates: UiSettingValues): Promise<void>;
  private getAll;
}

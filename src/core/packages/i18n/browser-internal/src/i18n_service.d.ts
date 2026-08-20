/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { I18nStart } from '@kbn/core-i18n-browser';
/**
 * Service that is responsible for i18n capabilities.
 * @internal
 */
export declare class I18nService {
  /**
   * Used exclusively to give a Context component to FatalErrorsService which
   * may render before Core successfully sets up or starts.
   *
   * Separated from `start` to disambiguate that this can be called from within
   * Core outside the lifecycle flow.
   * @internal
   */
  getContext(): I18nStart;
  start(): I18nStart;
  stop(): void;
}

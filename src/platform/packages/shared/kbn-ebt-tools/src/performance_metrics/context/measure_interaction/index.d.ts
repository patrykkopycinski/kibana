/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EventData } from '../performance_context';
export declare function measureInteraction(pathname: string): {
  /**
   * Marks the end of the page ready state and measures the performance between the start of the page change and the end of the page ready state.
   * @param pathname - The pathname of the page.
   * @param customMetrics - Custom metrics to be included in the performance measure.
   */
  pageReady(eventData?: EventData): void;
  pageRefreshStart(): void;
};

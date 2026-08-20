/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AnalyticsClient } from '@elastic/ebt/client';
export interface ViewportSize {
  viewport_width: number;
  viewport_height: number;
}
/**
 * Registers the event type "viewport_size" in the analytics client, and the context provider with the same name.
 * Then it listens to all the "resize" events in the UI and reports their size as {@link ViewportSize}
 * @param analytics
 */
export declare function trackViewportSize(analytics: AnalyticsClient): import('rxjs').Subscription;

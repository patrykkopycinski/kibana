/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AnalyticsClient } from '@elastic/ebt/client';
/**
 * Registers the event type "click" in the analytics client.
 * Then it listens to all the "click" events in the UI and reports them with the `target` property being a
 * full list of the element's and its parents' attributes. This allows
 * @param analytics
 */
export declare function trackClicks(
  analytics: AnalyticsClient,
  isDevMode: boolean
): import('rxjs').Subscription;

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AnalyticsClient } from '@elastic/ebt/client';
import { type PerformanceMetricEvent } from './schema';
/**
 * Register the `performance_metric` event type
 * @param analytics The {@link AnalyticsClient} during the setup phase (it has the method `registerEventType`)
 * @internal To be called only by core's Analytics Service
 */
export declare function registerPerformanceMetricEventType(
  analytics: Pick<AnalyticsClient, 'registerEventType'>
): void;
/**
 * Report a `performance_metric` event type.
 * @param analytics The {@link AnalyticsClient} to report the events.
 * @param eventData The data to send, conforming the structure of a {@link PerformanceMetricEvent}.
 */
export declare function reportPerformanceMetricEvent(
  analytics: Pick<AnalyticsClient, 'reportEvent'>,
  eventData: PerformanceMetricEvent
): void;

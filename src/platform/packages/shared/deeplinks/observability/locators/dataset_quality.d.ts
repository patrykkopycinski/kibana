/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SerializableRecord } from '@kbn/utility-types';
export declare const DATA_QUALITY_LOCATOR_ID = 'DATA_QUALITY_LOCATOR';
interface RefreshInterval {
  pause: boolean;
  value: number;
}
interface TimeRangeConfig {
  from: string;
  to: string;
  refresh: RefreshInterval;
}
interface Filters {
  timeRange: TimeRangeConfig;
}
export interface DataQualityLocatorParams extends SerializableRecord {
  filters?: Filters;
}
export {};

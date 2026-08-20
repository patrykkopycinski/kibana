/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CustomMetrics, Meta } from './performance_context';
interface UsePageReadyProps {
  customMetrics?: CustomMetrics;
  isReady: boolean;
  meta?: Meta;
  isRefreshing: boolean;
  customInitialLoad?: {
    value: boolean;
    onInitialLoadReported: () => void;
  };
}
export declare const usePageReady: ({
  customInitialLoad,
  isReady,
  isRefreshing,
  customMetrics,
  meta,
}: UsePageReadyProps) => void;
export {};

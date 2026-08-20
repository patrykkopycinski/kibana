/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
export { PerformanceContext, usePerformanceContext } from './context/use_performance_context';
export { perfomanceMarkers } from './performance_markers';
export { usePageReady } from './context/use_page_ready';
export { type Meta } from './context/performance_context';
export declare const PerformanceContextProvider: React.ForwardRefExoticComponent<
  {
    children: React.ReactElement;
  } & React.RefAttributes<{}>
>;

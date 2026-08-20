/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Returns the side nav collapsed state and a setter to toggle it.
 * **Internal** — used by `GridLayoutProjectSideNav`.
 */
export declare function useSideNavCollapsed(): {
  isCollapsed: boolean;
  setIsCollapsed: (isCollapsed: boolean) => void;
};

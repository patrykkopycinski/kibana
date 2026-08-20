/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Whether the sidenav should be auto-collapsed for the current window size.
 *
 * Main app width is approximated as viewport width minus expanded nav width and
 * `sidebarWidth`. Below the collapse threshold we collapse; above the expand
 * threshold we expand. Between the two thresholds we leave the nav unchanged so
 * small resizes near the edge do not keep toggling it.
 */
export declare const useAutoCollapse: (sidebarWidth: number) => boolean;

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type Platform = 'mac' | 'windows' | 'linux' | 'other';
/**
 * Checks if the current platform is macOS.
 */
export declare const isMac: boolean;
/**
 * Checks if the current platform is Windows.
 */
export declare const isWindows: boolean;
/**
 * Checks if the current platform is Linux.
 */
export declare const isLinux: boolean;
/**
 * Gets the current platform as a standardized string.
 */
export declare const getPlatform: () => Platform;

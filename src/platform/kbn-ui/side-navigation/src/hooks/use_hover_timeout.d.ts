/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Hook for managing hover timeouts.
 *
 * @returns an object containing:
 * - `setHoverTimeout` - a function to set a hover timeout.
 * - `clearHoverTimeout` - a function to clear the hover timeout.
 */
export declare const useHoverTimeout: () => {
  setHoverTimeout: (callback: () => void, delay: number) => void;
  clearHoverTimeout: () => void;
};

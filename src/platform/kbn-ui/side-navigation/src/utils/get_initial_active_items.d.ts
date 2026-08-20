/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MenuItem, NavigationStructure, SecondaryMenuItem } from '../../types';
export interface ActiveItemsState {
  primaryItem: MenuItem | null;
  secondaryItem: SecondaryMenuItem | null;
  isLogoActive: boolean;
}
/**
 * Utility function to determine the active menu items based on the `activeItemId`.
 *
 * @param items - the navigation structure.
 * @param activeItemId - the active item ID.
 * @param logoId - the logo ID.
 * @returns the active items state including: `primaryItem`, `secondaryItem`, and `isLogoActive`.
 */
export declare const getActiveItems: (
  items: NavigationStructure,
  activeItemId?: string,
  logoId?: string
) => ActiveItemsState;

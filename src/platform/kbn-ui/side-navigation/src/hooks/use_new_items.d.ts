/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MenuItem } from '../../types';
/**
 * Manages 'new' item status with a max of 2 'new' items per level:
 * - Max 2 new primary items
 * - Max 2 new secondary items per parent
 * @param menuItems - Array of menu items to check
 * @param activeItemId - Currently active item ID for auto-marking as visited
 * @returns Functions to check new item status
 */
export declare const useNewItems: (
  menuItems: MenuItem[],
  activeItemId?: string
) => {
  getIsNewPrimary: (itemId: string) => boolean;
  getIsNewSecondary: (itemId: string) => boolean;
};

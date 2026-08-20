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
 * Get a stable reference to the items array that changes only when we need to recalculate the height.
 *
 * @param items - menu items.
 * @returns the stable items reference.
 */
export declare const useStableMenuItemsReference: (items: MenuItem[]) => MenuItem[];

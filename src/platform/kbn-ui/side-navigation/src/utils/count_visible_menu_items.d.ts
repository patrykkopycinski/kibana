/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Utility function to get the number of visible menu items until we reach the menu height or the limit of menu items.
 *
 * @param heights - The heights of the menu items.
 * @param gap - The gap between the menu items.
 * @param menuHeight - The height of the menu.
 * @param hasForcedMoreButton - When true, a "More" button is rendered regardless of responsive
 * overflow (e.g. because items were explicitly hidden by the user). Its height is added to the list
 * to fit so space is reserved for it; otherwise the button has no reserved space and overlaps the
 * footer.
 *
 * @returns The number of visible menu items.
 */
export declare const countVisibleMenuItems: (
  heights: number[],
  gap: number,
  menuHeight: number,
  hasForcedMoreButton?: boolean
) => number;

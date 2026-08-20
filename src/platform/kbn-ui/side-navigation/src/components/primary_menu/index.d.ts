/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
export interface PrimaryMenuIds {
  mainNavigationInstructionsId: string;
}
export type PrimaryMenuChildren = ReactNode | ((ids: PrimaryMenuIds) => ReactNode);
export interface PrimaryMenuProps {
  children: PrimaryMenuChildren;
  isCollapsed: boolean;
}
export declare const PrimaryMenuBase: ForwardRefExoticComponent<
  PrimaryMenuProps & RefAttributes<HTMLElement>
>;
export declare const PrimaryMenu: ForwardRefExoticComponent<
  PrimaryMenuProps & RefAttributes<HTMLElement>
> & {
  Item: ForwardRefExoticComponent<
    import('./item').PrimaryMenuItemProps & RefAttributes<HTMLAnchorElement | HTMLButtonElement>
  >;
};

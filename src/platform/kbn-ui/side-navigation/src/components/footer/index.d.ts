/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
export interface FooterIds {
  footerNavigationInstructionsId: string;
}
export type FooterChildren = ReactNode | ((ids: FooterIds) => ReactNode);
export interface FooterProps {
  children: FooterChildren;
  isCollapsed: boolean;
  collapseButton?: ReactNode;
}
export declare const Footer: ForwardRefExoticComponent<FooterProps & RefAttributes<HTMLElement>> & {
  Item: ForwardRefExoticComponent<
    import('./item').FooterItemProps & RefAttributes<HTMLAnchorElement>
  >;
};

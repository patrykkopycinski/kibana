/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import type { ReactNode, AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import type { IconType } from '@elastic/eui';
interface MenuItemBaseProps {
  children: ReactNode;
  iconType: IconType;
  id?: string;
  isCurrent?: boolean;
  isHighlighted: boolean;
  isHorizontal?: boolean;
  isLabelVisible?: boolean;
  isNew?: boolean;
  isTruncated?: boolean;
}
type MenuItemAnchorRestProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  keyof MenuItemBaseProps | 'href'
>;
type MenuItemButtonRestProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  keyof MenuItemBaseProps
>;
interface MenuItemWithHref extends MenuItemBaseProps, MenuItemAnchorRestProps {
  href: string;
}
interface MenuItemWithoutHref extends MenuItemBaseProps, MenuItemButtonRestProps {
  href?: undefined;
}
export type MenuItemProps = MenuItemWithHref | MenuItemWithoutHref;
export declare const MenuItem: React.ForwardRefExoticComponent<
  MenuItemProps & React.RefAttributes<HTMLAnchorElement | HTMLButtonElement>
>;
export {};

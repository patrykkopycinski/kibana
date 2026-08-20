/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import type { ReactNode } from 'react';
import type { IconType } from '@elastic/eui';
import type { MenuItem } from '../../../types';
export interface PrimaryMenuItemProps extends Omit<MenuItem, 'href'> {
  as?: 'a' | 'button';
  children: ReactNode;
  hasContent?: boolean;
  href?: string;
  iconType: IconType;
  isCollapsed: boolean;
  isCurrent?: boolean;
  isHighlighted: boolean;
  isHorizontal?: boolean;
  isNew: boolean;
  onClick?: () => void;
  'aria-posinset'?: number;
  'aria-setsize'?: number;
}
export declare const PrimaryMenuItem: React.ForwardRefExoticComponent<
  PrimaryMenuItemProps & React.RefAttributes<HTMLAnchorElement | HTMLButtonElement>
>;

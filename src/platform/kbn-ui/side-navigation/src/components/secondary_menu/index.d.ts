/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import type { BadgeType } from '../../../types';
import type { SecondaryMenuItemComponent } from './item';
import type { SecondaryMenuSectionComponent } from './section';
export interface SecondaryMenuProps {
  badgeType?: BadgeType;
  children: ReactNode;
  isNew?: boolean;
  isPanel?: boolean;
  title: string;
}
/**
 * This menu is reused between the side nav panel and the side nav popover.
 */
export declare const SecondaryMenu: ForwardRefExoticComponent<
  SecondaryMenuProps & RefAttributes<HTMLDivElement>
> & {
  Item: typeof SecondaryMenuItemComponent;
  Section: typeof SecondaryMenuSectionComponent;
};

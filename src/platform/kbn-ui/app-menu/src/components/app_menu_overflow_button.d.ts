/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import type { AppMenuItemType, AppMenuPrimaryActionItem, AppMenuSwitch } from '../types';
interface AppMenuShowMoreButtonProps {
  items: AppMenuItemType[];
  staticItems?: AppMenuItemType[];
  isPopoverOpen: boolean;
  primaryActionItem?: AppMenuPrimaryActionItem;
  switchConfig?: AppMenuSwitch;
  onPopoverToggle: () => void;
  onPopoverClose: () => void;
}
export declare const AppMenuOverflowButton: ({
  items,
  staticItems,
  isPopoverOpen,
  primaryActionItem,
  switchConfig,
  onPopoverToggle,
  onPopoverClose,
}: AppMenuShowMoreButtonProps) => React.JSX.Element | null;
export {};

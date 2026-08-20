/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import { type ReactElement } from 'react';
import { type PopoverAnchorPosition } from '@elastic/eui';
import type {
  AppMenuItemType,
  AppMenuPopoverItem,
  AppMenuPrimaryActionItem,
  AppMenuSwitch,
} from '../types';
interface AppMenuContextMenuProps {
  tooltipContent?: string | (() => string | undefined);
  tooltipTitle?: string | (() => string | undefined);
  anchorElement: ReactElement;
  anchorDomElement?: HTMLElement;
  items: AppMenuPopoverItem[];
  staticItems?: AppMenuItemType[];
  isOpen: boolean;
  popoverWidth?: number;
  primaryActionItem?: AppMenuPrimaryActionItem;
  switchConfig?: AppMenuSwitch;
  popoverTestId?: string;
  anchorPosition?: PopoverAnchorPosition;
  repositionToCrossAxis?: boolean;
  onClose: () => void;
  onCloseOverflowButton?: () => void;
}
export declare const AppMenuPopover: ({
  items,
  staticItems,
  anchorElement,
  anchorDomElement,
  tooltipContent,
  tooltipTitle,
  isOpen,
  popoverWidth,
  primaryActionItem,
  switchConfig,
  popoverTestId,
  anchorPosition,
  repositionToCrossAxis,
  onClose,
  onCloseOverflowButton,
}: AppMenuContextMenuProps) => React.JSX.Element | null;
export {};

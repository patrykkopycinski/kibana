/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import { type ReactNode } from 'react';
import type { NavigationStructure, SideNavLogo, MenuItem, SecondaryMenuItem } from '../../types';
export interface NavigationProps {
  /**
   * The active path for the navigation, used for highlighting the current item.
   */
  activeItemId?: string;
  /**
   * Whether the navigation is collapsed. This can be controlled by the parent component.
   */
  isCollapsed: boolean;
  /**
   * The navigation structure containing primary, secondary, and footer items.
   */
  items: NavigationStructure;
  /**
   * The logo object containing the route ID, href, label, and type.
   */
  logo?: SideNavLogo;
  /**
   * Required by the grid layout to set the width of the navigation slot.
   */
  setWidth: (width: number) => void;
  /**
   * (optional) Callback fired when a navigation item is clicked.
   */
  onItemClick?: (item: MenuItem | SecondaryMenuItem | SideNavLogo) => void;
  /**
   * Callback fired when the collapse button is toggled.
   *
   * The collapsed state's source of truth lives in chrome_service.tsx as a BehaviorSubject
   * that is persisted to localStorage. External consumers rely on this state.
   */
  onToggleCollapsed?: (isCollapsed: boolean) => void;
  /**
   * (optional) Content to display inside the side panel footer.
   */
  sidePanelFooter?: ReactNode;
  /**
   * When true, renders a centered horizontal separator at the top of the side nav,
   * between the global header and the logo/primary menu.
   */
  showTopSeparator?: boolean;
  /**
   * (optional) Callback fired when the customize button is clicked.
   * When not provided, the button is hidden.
   */
  onCustomizeNavigation?: () => void;
  /**
   * (optional) data-test-subj attribute for testing purposes.
   */
  'data-test-subj'?: string;
}
export declare const Navigation: ({
  activeItemId,
  isCollapsed: isCollapsedProp,
  items,
  logo,
  onCustomizeNavigation,
  onItemClick,
  onToggleCollapsed,
  setWidth,
  showTopSeparator,
  sidePanelFooter,
  ...rest
}: NavigationProps) => React.JSX.Element;

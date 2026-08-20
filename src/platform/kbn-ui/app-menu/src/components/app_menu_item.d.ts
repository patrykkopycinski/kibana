/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import type { AppMenuItemType } from '../types';
type AppMenuItemProps = AppMenuItemType & {
  isPopoverOpen: boolean;
  onPopoverToggle: () => void;
  onPopoverClose: () => void;
};
export declare const AppMenuItem: ({
  run,
  id,
  htmlId,
  label,
  testId,
  ebt,
  iconType,
  disableButton,
  href,
  target,
  isLoading,
  isSelected,
  tooltipContent,
  tooltipTitle,
  items,
  isPopoverOpen,
  hidden,
  popoverWidth,
  popoverTestId,
  onPopoverToggle,
  onPopoverClose,
}: AppMenuItemProps) => React.JSX.Element;
export {};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import { type IconType } from '@elastic/eui';
export interface SplitButtonWithNotificationProps {
  label: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
  iconType?: IconType;
  isDisabled?: boolean;
  isLoading?: boolean;
  isMainButtonLoading?: boolean;
  isSelected?: boolean;
  href?: string;
  target?: string;
  id?: string;
  'data-test-subj'?: string;
  fullWidth?: boolean;
  'aria-haspopup'?: 'menu';
  secondaryButtonAriaLabel: string;
  onSecondaryButtonClick?: React.MouseEventHandler<HTMLButtonElement>;
  isSecondaryButtonDisabled?: boolean;
  showNotificationIndicator?: boolean;
  notificationIndicatorTooltipContent?: string;
}
export declare const SplitButtonWithNotification: ({
  isDisabled,
  isLoading,
  'data-test-subj': dataTestSubj,
  fullWidth,
  label,
  onClick,
  iconType,
  isMainButtonLoading,
  isSelected,
  href,
  target,
  id,
  'aria-haspopup': ariaHasPopup,
  secondaryButtonAriaLabel,
  onSecondaryButtonClick,
  isSecondaryButtonDisabled,
  showNotificationIndicator,
  notificationIndicatorTooltipContent,
}: SplitButtonWithNotificationProps) => React.JSX.Element;

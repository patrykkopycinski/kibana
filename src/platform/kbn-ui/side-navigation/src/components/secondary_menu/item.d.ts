/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactNode } from 'react';
import type { IconType } from '@elastic/eui';
import type { SecondaryMenuItem } from '../../../types';
export interface SecondaryMenuItemProps extends Omit<SecondaryMenuItem, 'href'> {
  children: ReactNode;
  hasSubmenu?: boolean;
  href?: string;
  iconType?: IconType;
  isCurrent?: boolean;
  isHighlighted: boolean;
  isNew?: boolean;
  onClick?: () => void;
  testSubjPrefix?: string;
}
/**
 * `EuiButton` and `EuiButtonEmpty` are used for consistency with the component library.
 * The only style overrides are making the button labels left-aligned.
 */
export declare const SecondaryMenuItemComponent: ({
  badgeType,
  children,
  hasSubmenu,
  href,
  iconType,
  id,
  isCurrent,
  isExternal,
  isHighlighted,
  isNew,
  testSubjPrefix,
  ...props
}: SecondaryMenuItemProps) => JSX.Element;

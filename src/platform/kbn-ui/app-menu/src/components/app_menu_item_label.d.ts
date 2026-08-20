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
interface AppMenuItemLabelProps {
  label: string;
  description: string;
  isDisabled?: boolean;
  isLoading?: boolean;
  testId?: string;
  labelBadgeText?: string;
  iconType?: IconType;
}
export declare const AppMenuItemLabel: ({
  label,
  description,
  isDisabled,
  isLoading,
  testId,
  labelBadgeText,
  iconType,
}: AppMenuItemLabelProps) => React.JSX.Element;
export {};

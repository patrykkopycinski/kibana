/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ComponentProps, FC, ReactNode } from 'react';
import type { IconType } from '@elastic/eui';
import type { SecondaryMenu } from '../secondary_menu';
export interface ItemProps
  extends Omit<ComponentProps<typeof SecondaryMenu.Item>, 'isHighlighted' | 'href'> {
  children: ReactNode;
  href?: string;
  iconType?: IconType;
  isHighlighted?: boolean;
  isCurrent?: boolean;
  onClick?: () => void;
}
export declare const Item: FC<ItemProps>;

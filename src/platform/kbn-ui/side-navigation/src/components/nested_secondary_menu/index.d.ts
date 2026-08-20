/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactNode, FC } from 'react';
import type { Header } from './header';
import type { Item } from './menu_item';
import type { Panel } from './menu_panel';
import type { PrimaryMenuItem } from './primary_menu_item';
import type { SecondaryMenu } from '../secondary_menu';
interface NestedSecondaryMenuProps {
  children: ReactNode;
  initialPanel?: string;
}
interface NestedSecondaryMenuComponent extends FC<NestedSecondaryMenuProps> {
  Header: typeof Header;
  Item: typeof Item;
  Panel: typeof Panel;
  PrimaryMenuItem: typeof PrimaryMenuItem;
  Section: typeof SecondaryMenu.Section;
}
export declare const NestedSecondaryMenu: NestedSecondaryMenuComponent;
export {};

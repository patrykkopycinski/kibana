/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC, ReactNode } from 'react';
export interface SidebarBodyProps {
  children: ReactNode;
  /** Makes the body keyboard-scrollable with `tabIndex={0}` and announces it as a region. Defaults to false. */
  scrollable?: boolean;
}
/** Body component for sidebar apps */
export declare const SidebarBody: FC<SidebarBodyProps>;

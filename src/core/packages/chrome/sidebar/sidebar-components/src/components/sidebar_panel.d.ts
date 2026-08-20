/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC, ReactNode } from 'react';
export interface SidebarPanelProps {
  children: ReactNode;
}
/**
 * Minimal container for sidebar app content.
 * Apps are responsible for rendering their own header using SidebarHeader component.
 *
 * Provides {@link SidebarPanelContext} so child components can access
 * the panel's heading ID for aria-labelledby via {@link useSidebarPanel}.
 */
export declare const SidebarPanel: FC<SidebarPanelProps>;

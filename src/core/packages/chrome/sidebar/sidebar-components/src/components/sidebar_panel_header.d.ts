/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC, ReactNode } from 'react';
export interface SidebarHeaderProps {
  /** Renders as heading and labels the panel via aria-labelledby. When children are provided, used only for the aria-label. */
  title: string;
  /** Custom header content. Overrides title rendering; title still labels the panel. */
  children?: ReactNode;
  /** Close handler (renders close button when provided) */
  onClose?: () => void;
  /** Action buttons before close button */
  actions?: ReactNode;
}
/** Header component for sidebar apps */
export declare const SidebarHeader: FC<SidebarHeaderProps>;

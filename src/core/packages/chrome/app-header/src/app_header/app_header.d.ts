/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactNode } from 'react';
import type React from 'react';
import type { DistributiveOmit } from '@elastic/eui';
import type { AppHeaderBack, AppHeaderConfig, AppHeaderSpacing, AppHeaderTitle } from '../types';
export type AppHeaderViewProps = DistributiveOmit<AppHeaderConfig, 'back' | 'spacing'> & {
  back?: AppHeaderBack | AppHeaderBack[];
  /**
   * Defaults to `true`. Set to `false` only when the surrounding full-page layout provides its own
   * sticky-header mechanism for the correct scrolling container.
   */
  sticky?: boolean;
  /**
   * Controls the horizontal inset. `standard` keeps the 16px symmetric gutter. When omitted it
   * defaults to `standard`, except a titleless header (only a back and/or overflow button) defaults
   * to `compact` so sparse legacy states don't look too tall. Bleed modes are compatibility options
   * for headers that cannot yet move outside a padded parent.
   */
  spacing?: AppHeaderSpacing;
  docLink?: string;
  showAddIntegrations?: boolean;
};
export declare const AppHeaderView: React.NamedExoticComponent<AppHeaderViewProps>;
export type AppHeaderProps = AppHeaderViewProps & {
  title: AppHeaderTitle;
};
export declare const AppHeader: React.NamedExoticComponent<AppHeaderProps>;
export type DiscoverAppHeaderProps = AppHeaderProps & {
  tabsBar?: ReactNode;
};
export declare const DiscoverAppHeader: React.NamedExoticComponent<DiscoverAppHeaderProps>;

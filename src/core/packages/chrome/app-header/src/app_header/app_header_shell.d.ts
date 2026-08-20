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
import type { AppHeaderSpacing } from '../types';
export interface AppHeaderShellProps {
  title?: ReactNode;
  badges?: ReactNode;
  titleActions?: ReactNode;
  titleAppend?: ReactNode;
  trailing?: ReactNode;
  secondaryContent?: ReactNode;
  secondaryContentTestSubj?: string;
  tabs?: ReactNode;
  sticky?: boolean;
  spacing?: AppHeaderSpacing;
  borderless?: boolean;
}
export declare const AppHeaderShell: React.NamedExoticComponent<AppHeaderShellProps>;

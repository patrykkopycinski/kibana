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
import type { AppHeaderBack, AppHeaderEditableTitle } from '../../types';
export interface TitleAreaProps {
  title?: string | AppHeaderEditableTitle;
  back?: AppHeaderBack | AppHeaderBack[];
  size?: 'xs' | 's';
  /**
   * Rendered in the title slot when no title is provided, so loading placeholders
   * share the same gap and offset as a real title.
   */
  placeholder?: ReactNode;
}
export declare const TitleArea: React.NamedExoticComponent<TitleAreaProps>;

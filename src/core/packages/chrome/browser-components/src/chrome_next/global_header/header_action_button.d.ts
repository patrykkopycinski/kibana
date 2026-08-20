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
export declare const HEADER_BUTTON_HEIGHT_PX = 32;
export declare const HEADER_BUTTON_SQUARE_WIDTH_PX = 32;
export declare const headerButtonBaseStyles: import('@emotion/utils').SerializedStyles;
export declare const headerButtonBorderedStyles: import('@emotion/utils').SerializedStyles;
export declare const useHeaderButtonStyleVars: () => React.CSSProperties;
export interface HeaderActionButtonProps
  extends Pick<React.AriaAttributes, 'aria-expanded' | 'aria-haspopup'> {
  variant: 'bordered' | 'plain';
  children: ReactNode;
  onClick: () => void;
  'aria-label': string;
  'data-test-subj'?: string;
}
export declare const HeaderActionButton: React.ForwardRefExoticComponent<
  HeaderActionButtonProps & React.RefAttributes<HTMLButtonElement>
>;

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Ref } from 'react';
import type React from 'react';
import type { EuiHeaderSectionItemButtonRef } from '@elastic/eui/src/components/header/header_section/header_section_item_button';
interface HeaderMenuButtonProps {
  'aria-controls': string;
  'aria-label': string;
  'aria-expanded': boolean;
  'aria-pressed': boolean;
  'data-test-subj': string;
  onClick: () => void;
  forwardRef: Ref<EuiHeaderSectionItemButtonRef> | undefined;
}
export declare const HeaderMenuButton: React.ForwardRefExoticComponent<
  HeaderMenuButtonProps &
    React.RefAttributes<
      HTMLButtonElement & {
        euiAnimate: () => void;
      }
    >
>;
export {};

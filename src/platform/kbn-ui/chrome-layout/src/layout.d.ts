/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import { type ChromeLayoutComponentProps } from './layout.component';
/**
 * Props for the ChromeLayout component.
 * @public
 */
export type ChromeLayoutProps = ChromeLayoutComponentProps;
/**
 * The main Chrome layout component.
 * Sets up the layout and required global css.
 *
 * @public
 * @param props - Props for the ChromeLayout component.
 * @returns The rendered ChromeLayout component.
 */
export declare const ChromeLayout: ({ children, ...props }: ChromeLayoutProps) => React.JSX.Element;

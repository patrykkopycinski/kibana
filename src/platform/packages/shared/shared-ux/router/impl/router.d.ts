/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import type {
  RouterProps,
  MemoryRouterProps,
  BrowserRouterProps,
  HashRouterProps,
} from 'react-router-dom';
export declare const HashRouter: ({ children, ...props }: HashRouterProps) => React.JSX.Element;
export declare const BrowserRouter: ({
  children,
  ...props
}: BrowserRouterProps) => React.JSX.Element;
export declare const MemoryRouter: ({ children, ...props }: MemoryRouterProps) => React.JSX.Element;
export declare const Router: ({ children, ...props }: RouterProps) => React.JSX.Element;

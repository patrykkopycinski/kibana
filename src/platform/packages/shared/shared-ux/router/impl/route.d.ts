/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import type { RouteProps } from 'react-router-dom';
/**
 * This is a wrapper around the react-router-dom Route component that inserts
 * MatchPropagator in every application route. It helps track all route changes
 * and send them to the execution context, later used to enrich APM
 * 'route-change' transactions.
 */
export declare const Route: <T extends {}>({
  children,
  component: Component,
  render,
  ...rest
}: RouteProps<
  string,
  {
    [K: string]: string;
  } & T
>) => React.JSX.Element;
/**
 * The match propagator that is part of the Route
 */
export declare const MatchPropagator: () => null;

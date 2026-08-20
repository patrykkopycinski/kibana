/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MouseEvent } from 'react';
/**
 * Returns true if any modifier key is active on the event, false otherwise.
 */
export declare const hasActiveModifierKey: (event: MouseEvent) => boolean;
/**
 * Returns the closest anchor (`<a>`) element in the element parents (self included) up
 * to the given container (excluded), or undefined if none is found.
 */
export declare const getClosestLink: (
  element: HTMLElement | null | undefined,
  container?: HTMLElement
) => HTMLAnchorElement | undefined;

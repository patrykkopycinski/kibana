/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
interface LayoutDebugOverlayProps {
  colors?: Partial<Record<string, string>>;
}
/**
 * A debug overlay component that visually outlines the main layout slots (banner, header, navigation, sidebar, etc.)
 * using colored rectangles. This is useful for development and debugging to understand the placement and sizing of layout regions.
 *
 * @param props - {@link LayoutDebugOverlayProps} Optional colors to override the default slot colors.
 * @returns The rendered debug overlay as a fixed-position set of rectangles.
 */
export declare const LayoutDebugOverlay: React.FC<LayoutDebugOverlayProps>;
export {};

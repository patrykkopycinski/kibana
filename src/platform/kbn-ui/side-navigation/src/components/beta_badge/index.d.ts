/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import type { BadgeType } from '../../../types';
interface BetaBadgeProps {
  type: BadgeType;
  isInverted?: boolean;
  alignment?: 'bottom' | 'text-bottom';
}
/**
 * A badge to indicate that a feature is in beta, tech preview, or new.
 * It can be aligned to the middle or bottom of the text.
 */
export declare const BetaBadge: ({
  type,
  isInverted,
  alignment,
}: BetaBadgeProps) => React.JSX.Element;
export {};

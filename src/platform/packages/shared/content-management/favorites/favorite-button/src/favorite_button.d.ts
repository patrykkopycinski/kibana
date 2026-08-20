/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import type { FavoriteButtonStatus } from './favorite_status';
export interface FavoriteButtonProps {
  status: FavoriteButtonStatus;
  onClick: () => void;
  addLabel: string;
  removeLabel: string;
  isDisabled?: boolean;
  className?: string;
  'data-test-subj'?: string;
}
export declare const FavoriteButton: ({
  status,
  onClick,
  addLabel,
  removeLabel,
  isDisabled,
  className,
  'data-test-subj': dataTestSubj,
}: FavoriteButtonProps) => React.JSX.Element;

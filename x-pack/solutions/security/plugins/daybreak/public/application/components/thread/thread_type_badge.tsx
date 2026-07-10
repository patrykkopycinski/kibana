/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge } from '@elastic/eui';
import { daybreakTheme } from '../../theme';
import { THREAD_TYPE_META, type ThreadType } from './thread_type';

/**
 * Renders a colored, iconed badge for a thread's {@link ThreadType}
 * (FR-013). Color is resolved through {@link daybreakTheme}'s
 * `threadType` token group (FR-006) rather than an inline hex value — see
 * `theme.mapping.md`'s "Thread-type tokens" table.
 */
export const ThreadTypeBadge: React.FC<{ type: ThreadType; mode?: 'light' | 'dark' }> = ({
  type,
  mode = daybreakTheme.defaultMode,
}) => {
  const meta = THREAD_TYPE_META[type];
  const color = daybreakTheme.modes[mode].threadType[meta.themeToken];

  return (
    <EuiBadge data-test-subj={`daybreakThreadTypeBadge-${type}`} iconType={meta.icon} color={color}>
      {meta.label()}
    </EuiBadge>
  );
};

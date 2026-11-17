/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { memo } from 'react';
import { EuiBadge } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { DETONATION_TOOL_SANDBOX_BADGE_TEST_ID } from './test_ids';

const SANDBOX_BADGE_LABEL = i18n.translate(
  'xpack.securitySolution.flyout.detonation.tools.sandboxBadge',
  { defaultMessage: 'sandbox' }
);

/** Marks a tool as showing sandbox data (epic #20877 §5) rather than production telemetry. */
export const SandboxBadge: FC = memo(() => (
  <EuiBadge color="hollow" data-test-subj={DETONATION_TOOL_SANDBOX_BADGE_TEST_ID}>
    {SANDBOX_BADGE_LABEL}
  </EuiBadge>
));

SandboxBadge.displayName = 'SandboxBadge';

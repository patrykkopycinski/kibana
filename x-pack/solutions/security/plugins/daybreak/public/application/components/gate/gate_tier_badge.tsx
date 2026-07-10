/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge } from '@elastic/eui';
import { GATE_TIER_META, type GateTier } from './gate_tier';

/**
 * Renders a colored, iconed badge for a Proposal's {@link GateTier}
 * (FR-016), mirroring `thread_type_badge.tsx`'s per-value badge pattern.
 */
export const GateTierBadge: React.FC<{ tier: GateTier }> = ({ tier }) => {
  const meta = GATE_TIER_META[tier];

  return (
    <EuiBadge
      data-test-subj={`daybreakGateTierBadge-${tier}`}
      iconType={meta.icon}
      color={meta.color}
    >
      {meta.label()}
    </EuiBadge>
  );
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { GateTierBadge } from './gate_tier_badge';
import { GATE_TIERS, GATE_TIER_META } from './gate_tier';

const renderBadge = (tier: (typeof GATE_TIERS)[number]) =>
  render(
    <IntlProvider locale="en">
      <GateTierBadge tier={tier} />
    </IntlProvider>
  );

describe('GateTierBadge (FR-016)', () => {
  it('renders a badge with the tier-scoped test subject and label for every gate tier', () => {
    for (const tier of GATE_TIERS) {
      const { unmount } = renderBadge(tier);

      expect(screen.getByTestId(`daybreakGateTierBadge-${tier}`)).toBeInTheDocument();
      expect(screen.getByText(GATE_TIER_META[tier].label())).toBeInTheDocument();

      unmount();
    }
  });
});

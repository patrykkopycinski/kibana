/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { useWatches } from '../hooks/use_watches';

const tierLabel: Record<string, string> = {
  'auto-run': 'Auto-run',
  'proposed-diff': 'Proposed diff',
  'approval-required': 'Approval required',
};

const tierColor: Record<string, 'success' | 'warning' | 'danger'> = {
  'auto-run': 'success',
  'proposed-diff': 'warning',
  'approval-required': 'danger',
};

export const GuardrailsConsole: React.FC = () => {
  const { watches, isLoading } = useWatches();

  const byTier = React.useMemo(() => {
    const counts: Record<string, number> = {
      'auto-run': 0,
      'proposed-diff': 0,
      'approval-required': 0,
    };
    watches.forEach((watch) => {
      counts[watch.autonomyTier] = (counts[watch.autonomyTier] ?? 0) + 1;
    });
    return counts;
  }, [watches]);

  if (isLoading) return <EuiLoadingSpinner size="m" />;

  return (
    <section data-test-subj="daybreakGuardrailsConsole">
      <EuiText className="daybreakEyebrow" size="xs">
        GUARDRAILS
      </EuiText>
      <EuiSpacer size="s" />
      <EuiTitle size="s">
        <h2>Autonomy posture</h2>
      </EuiTitle>
      <EuiSpacer size="m" />
      {watches.length === 0 ? (
        <EuiEmptyPrompt
          title={<h3>No watches configured</h3>}
          body={<p>Create watches and set their autonomy tier to see the guardrails posture.</p>}
        />
      ) : (
        <EuiFlexGroup direction="column" gutterSize="s" data-test-subj="daybreakGuardrailsList">
          {Object.entries(byTier).map(([tier, count]) => (
            <EuiFlexItem key={tier} grow={false}>
              <EuiPanel hasBorder paddingSize="s">
                <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
                  <EuiFlexItem>
                    <EuiText size="s">
                      <strong>{tierLabel[tier] ?? tier}</strong>
                    </EuiText>
                    <EuiText size="xs" color="subdued">
                      {count} watch{count === 1 ? '' : 'es'}
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color={tierColor[tier] ?? 'hollow'}>{count}</EuiBadge>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPanel>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      )}
    </section>
  );
};

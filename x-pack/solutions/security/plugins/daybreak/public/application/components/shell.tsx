/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiListGroup,
  EuiLoadingSpinner,
  EuiPanel,
  EuiText,
  EuiTitle,
  EuiSpacer,
  EuiFieldText,
  EuiButton,
  EuiHealth,
  EuiBadge,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useProposals } from '../hooks/use_proposals';
import type { DaybreakProposal } from '../../services/proposals_service';

/**
 * FR-010: the top-level route component rendering the application shell — a
 * left rail (thread/proposal list/nav), a main stage, and a composer.
 *
 * This is a design-neutral EUI implementation, not a port of the Throughline
 * (NotDaybreak) prototype: the prototype source (`Throughline.dc.html`,
 * `throughline-app.js`, `support.js`) is unavailable in this repository and
 * git history (see `.ao/blocked.md`, FR-001). Once vendored, this shell's
 * markup/structure should be replaced 1:1 with the ported prototype
 * components — the shape (rail / stage / composer) and the real-data wiring
 * below are intended to stay stable across that follow-up port.
 */
export const DaybreakShell: React.FC = () => {
  const { proposals, isLoading } = useProposals();
  const [selectedId, setSelectedId] = React.useState<string | undefined>(undefined);
  const selected = proposals.find((proposal) => proposal.id === selectedId);

  return (
    <EuiFlexGroup
      data-test-subj="daybreakAppShell"
      gutterSize="none"
      style={{ height: '100%' }}
      responsive={false}
    >
      <EuiFlexItem grow={1} data-test-subj="daybreakRail">
        <EuiPanel borderRadius="none" hasShadow={false} paddingSize="s" style={{ height: '100%' }}>
          <EuiTitle size="xs">
            <h2>
              <FormattedMessage id="xpack.daybreak.rail.title" defaultMessage="Proposals" />
            </h2>
          </EuiTitle>
          <EuiSpacer size="s" />
          {isLoading ? (
            <div data-test-subj="daybreakRailLoading">
              <EuiLoadingSpinner size="m" />
            </div>
          ) : (
            <EuiListGroup
              data-test-subj="daybreakRailList"
              bordered={false}
              listItems={proposals.map((proposal) => ({
                id: proposal.id,
                label: proposal.title,
                isActive: proposal.id === selectedId,
                onClick: () => setSelectedId(proposal.id),
                'data-test-subj': `daybreakRailItem-${proposal.id}`,
              }))}
            />
          )}
          {!isLoading && proposals.length === 0 && (
            <EuiText size="s" color="subdued" data-test-subj="daybreakRailEmpty">
              <FormattedMessage id="xpack.daybreak.rail.empty" defaultMessage="No proposals yet." />
            </EuiText>
          )}
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem grow={3} data-test-subj="daybreakStage">
        <EuiPanel
          borderRadius="none"
          hasShadow={false}
          paddingSize="l"
          style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ flexGrow: 1 }}>
            {selected ? (
              <DaybreakProposalDetail proposal={selected} />
            ) : (
              <EuiText color="subdued" data-test-subj="daybreakStageEmpty">
                <FormattedMessage
                  id="xpack.daybreak.stage.empty"
                  defaultMessage="Select a proposal from the list."
                />
              </EuiText>
            )}
          </div>

          <EuiSpacer size="m" />
          <EuiFlexGroup gutterSize="s" data-test-subj="daybreakComposer">
            <EuiFlexItem>
              <EuiFieldText
                data-test-subj="daybreakComposerInput"
                placeholder="Ask about this proposal…"
                fullWidth
                disabled
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton data-test-subj="daybreakComposerSubmit" disabled>
                <FormattedMessage id="xpack.daybreak.composer.send" defaultMessage="Send" />
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const severityColor: Record<DaybreakProposal['severity'], string> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

const DaybreakProposalDetail: React.FC<{ proposal: DaybreakProposal }> = ({ proposal }) => (
  <div data-test-subj="daybreakProposalDetail">
    <EuiFlexGroup alignItems="center" gutterSize="s">
      <EuiFlexItem grow={false}>
        <EuiHealth color={severityColor[proposal.severity]}>{proposal.severity}</EuiHealth>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBadge>{proposal.status}</EuiBadge>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="s" />
    <EuiTitle size="s">
      <h3>{proposal.title}</h3>
    </EuiTitle>
    <EuiSpacer size="s" />
    {proposal.recommendation && <EuiText size="s">{proposal.recommendation}</EuiText>}
  </div>
);

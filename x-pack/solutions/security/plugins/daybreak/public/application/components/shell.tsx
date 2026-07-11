/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiListGroup,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useProposals } from '../hooks/use_proposals';
import { useEvidence } from '../hooks/use_evidence';
import type { DaybreakEvidence } from '../../services/evidence_service';
import type { DaybreakProposal } from '../../services/proposals_service';
import { BriefDashboard } from './brief/brief_dashboard';
import { ApprovalGate } from './gate/approval_gate';
import { ProposalInspector } from './proposal/proposal_inspector';
import { deriveGateTier } from './gate/gate_tier';
import { PROPOSAL_STATUS_META } from './proposal/proposal_status';

export const DaybreakApp: React.FC = () => {
  const { proposals, isLoading } = useProposals();
  const { evidence } = useEvidence();
  const [selectedId, setSelectedId] = React.useState<string | undefined>();
  const selected = proposals.find((proposal) => proposal.id === selectedId);
  const awaitingReview = proposals.filter(
    (proposal) =>
      !['approved', 'dismissed'].includes(proposal.status) &&
      deriveGateTier(proposal) === 'approval-required'
  ).length;

  return (
    <EuiFlexGroup
      data-test-subj="daybreakAppShell"
      gutterSize="none"
      style={{ height: '100%' }}
      responsive={false}
    >
      <EuiFlexItem grow={false} style={{ width: 320 }} data-test-subj="daybreakRail">
        <EuiPanel borderRadius="none" hasShadow={false} paddingSize="m" style={{ height: '100%' }}>
          <EuiText size="xs" color="subdued">
            DAYBREAK / OPERATIONAL QUEUE
          </EuiText>
          <EuiSpacer size="xs" />
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiTitle size="s">
                <h2>Active threads</h2>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color={awaitingReview > 0 ? 'warning' : 'hollow'}>
                {awaitingReview} review
              </EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="m" />
          {isLoading ? (
            <div data-test-subj="daybreakRailLoading">
              <EuiLoadingSpinner size="m" />
            </div>
          ) : proposals.length === 0 ? (
            <EuiText size="s" color="subdued" data-test-subj="daybreakRailEmpty">
              No proposals yet.
            </EuiText>
          ) : (
            <EuiListGroup
              data-test-subj="daybreakRailList"
              bordered={false}
              listItems={proposals.map((proposal) => ({
                id: proposal.id,
                label: proposal.title,
                extraAction: {
                  iconType: proposal.severity === 'low' ? 'check' : 'alert',
                  'aria-label': `${proposal.severity} severity`,
                  alwaysShow: true,
                },
                isActive: proposal.id === selectedId,
                onClick: () => setSelectedId(proposal.id),
                'data-test-subj': `daybreakRailItem-${proposal.id}`,
              }))}
            />
          )}
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem data-test-subj="daybreakStage">
        <EuiPanel
          borderRadius="none"
          hasShadow={false}
          paddingSize="l"
          style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ flexGrow: 1, overflow: 'auto' }}>
            {selected ? (
              <DaybreakProposalDetail
                proposal={selected}
                evidence={evidence.filter((item) => selected.evidenceRefs.includes(item.id))}
                onBack={() => setSelectedId(undefined)}
              />
            ) : (
              <BriefDashboard />
            )}
          </div>
          <EuiSpacer size="m" />
          <EuiFlexGroup gutterSize="s" data-test-subj="daybreakComposer">
            <EuiFlexItem>
              <EuiFieldText
                data-test-subj="daybreakComposerInput"
                placeholder="Ask about the operational queue…"
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

const severityColor: Record<DaybreakProposal['severity'], 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

const DaybreakProposalDetail: React.FC<{
  proposal: DaybreakProposal;
  evidence: DaybreakEvidence[];
  onBack: () => void;
}> = ({ proposal, evidence, onBack }) => {
  const status = PROPOSAL_STATUS_META[proposal.status];

  return (
    <div data-test-subj="daybreakProposalDetail">
      <EuiButton iconType="arrowLeft" size="s" fill={false} onClick={onBack}>
        Back to operational brief
      </EuiButton>
      <EuiSpacer size="m" />
      <EuiText size="xs" color="subdued">
        PROPOSAL / DECISION CONTEXT
      </EuiText>
      <EuiSpacer size="xs" />
      <EuiTitle size="m">
        <h3>{proposal.title}</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiHealth color={severityColor[proposal.severity]}>{proposal.severity}</EuiHealth>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color={status.color}>{status.label()}</EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            Confidence {Math.round(proposal.confidence * 100)}%
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiPanel hasBorder paddingSize="m" color="subdued">
        <EuiText size="s">
          <strong>Recommended action</strong>
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiText size="s">
          {proposal.recommendation ?? 'Continue gathering evidence before recommending an action.'}
        </EuiText>
      </EuiPanel>
      <EuiSpacer size="m" />
      <ProposalInspector proposal={proposal} evidence={evidence} />
      <EuiSpacer size="m" />
      <ApprovalGate proposal={proposal} />
    </div>
  );
};

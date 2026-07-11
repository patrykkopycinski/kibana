/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useProposalTransition } from '../../hooks/use_proposal_transition';
import type { DaybreakProposal, MissingRequirement } from '../../../services/proposals_service';
import { GateTierBadge } from './gate_tier_badge';
import { deriveGateTier } from './gate_tier';
import { PROPOSAL_STATUS_META } from '../proposal/proposal_status';

const missingRequirementLabel = (requirement: MissingRequirement): string => {
  switch (requirement) {
    case 'evidence':
      return i18n.translate('xpack.daybreak.gate.missingRequirement.evidence', {
        defaultMessage: 'evidence',
      });
    case 'recommendation':
      return i18n.translate('xpack.daybreak.gate.missingRequirement.recommendation', {
        defaultMessage: 'recommendation',
      });
  }
};

const isTerminal = (status: DaybreakProposal['status']): boolean =>
  status === 'approved' || status === 'dismissed';

export const ApprovalGate: React.FC<{ proposal: DaybreakProposal }> = ({ proposal }) => {
  const tier = deriveGateTier(proposal);
  const statusMeta = PROPOSAL_STATUS_META[proposal.status];
  const { transition, isLoading, missingRequirements } = useProposalTransition();
  const isApprovalReady = tier === 'approval-required' && !isTerminal(proposal.status);
  const isComplete = isTerminal(proposal.status);

  const handleApprove = () => {
    void transition({ id: proposal.id, targetStatus: 'approved' });
  };

  return (
    <EuiPanel
      className="daybreakGateCard"
      data-test-subj="daybreakGateApproval"
      paddingSize="m"
      hasBorder
      color={isApprovalReady ? 'warning' : 'subdued'}
    >
      <EuiText size="xs" color="subdued">
        DECISION GATE
      </EuiText>
      <EuiSpacer size="xs" />
      <EuiFlexGroup
        alignItems="center"
        justifyContent="spaceBetween"
        responsive={false}
        gutterSize="s"
      >
        <EuiFlexItem>
          <EuiTitle size="xs">
            <h4>
              {isComplete
                ? 'Decision complete'
                : isApprovalReady
                ? 'Ready for a human decision'
                : 'Evidence still in progress'}
            </h4>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <GateTierBadge tier={tier} />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        {isComplete
          ? 'This proposal is already closed and cannot be approved again.'
          : isApprovalReady
          ? 'Evidence and a recommendation are present. Approval will be revalidated by the server.'
          : 'Approval stays unavailable until the proposal includes both evidence and a recommendation.'}
      </EuiText>
      <EuiSpacer size="m" />
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size="s" data-test-subj={`daybreakGateApprovalStatus-${proposal.status}`}>
            <strong>{statusMeta.label()}</strong>
          </EuiText>
        </EuiFlexItem>
        {isApprovalReady && (
          <EuiFlexItem grow={false}>
            <EuiButton
              data-test-subj="daybreakGateApproveButton"
              size="s"
              fill
              isLoading={isLoading}
              onClick={handleApprove}
            >
              <FormattedMessage id="xpack.daybreak.gate.approve" defaultMessage="Approve" />
            </EuiButton>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      {missingRequirements && missingRequirements.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            data-test-subj="daybreakGateApprovalFailure"
            color="danger"
            size="s"
            title={
              <FormattedMessage
                id="xpack.daybreak.gate.approvalFailedTitle"
                defaultMessage="Cannot approve: missing {requirements}"
                values={{
                  requirements: missingRequirements.map(missingRequirementLabel).join(', '),
                }}
              />
            }
          />
        </>
      )}
    </EuiPanel>
  );
};

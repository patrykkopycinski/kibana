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
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useProposalTransition } from '../../hooks/use_proposal_transition';
import { useProposalActions } from '../../hooks/use_proposal_actions';
import type { DaybreakProposal, MissingRequirement } from '../../../services/proposals_service';
import { ActionFlyout, type GatedAction } from '../action/action_flyout';
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
    case 'approver-count':
      return i18n.translate('xpack.daybreak.gate.missingRequirement.approverCount', {
        defaultMessage: 'additional approver',
      });
  }
};

const blastRadiusCopy: Partial<Record<MissingRequirement, string>> = {
  evidence: 'Approving without evidence means accepting an unverified recommendation.',
  recommendation:
    'No recommended action is recorded, so approval would not trigger a controlled change.',
  'approver-count':
    'A single-approval override removes the second-key safeguard for this proposal.',
};

const isolateGatedAction: GatedAction = {
  label: 'Isolate host',
  cta: 'Isolate host',
  tone: 'danger',
  permNote: 'requires endpoint containment privileges',
  blast: [
    { icon: 'desktop', text: 'Target host will be isolated from the network' },
    { icon: 'alert', text: 'Active sessions on the host may be disrupted' },
    { icon: 'check', text: 'Approved proposal audit trail is preserved', safe: true },
  ],
};

const isTerminal = (status: DaybreakProposal['status']): boolean =>
  status === 'approved' || status === 'dismissed';

export const ApprovalGate: React.FC<{ proposal: DaybreakProposal }> = ({ proposal }) => {
  const tier = deriveGateTier(proposal);
  const statusMeta = PROPOSAL_STATUS_META[proposal.status];
  const { transition, isLoading, missingRequirements } = useProposalTransition();
  const { actResponse, runResponseActionWorker } = useProposalActions();
  const [responseResult, setResponseResult] = React.useState<string | undefined>();
  const [isolateFlyout, setIsolateFlyout] = React.useState(false);
  const isApprovalReady = tier === 'approval-required' && !isTerminal(proposal.status);
  const isComplete = isTerminal(proposal.status);
  const requiredApproverCount = proposal.requiredApproverCount ?? 1;
  const approvalCount = proposal.approvals?.length ?? 0;
  const needsMoreApprovals =
    isApprovalReady && approvalCount > 0 && approvalCount < requiredApproverCount;

  const handleApprove = () => {
    void transition({
      id: proposal.id,
      targetStatus: 'approved',
      decisionType: 'approve',
    });
  };

  const dispatchResponse = (action: 'get_processes' | 'isolate') => {
    setResponseResult(undefined);
    actResponse.mutate(
      { id: proposal.id, action },
      {
        onSuccess: (result) => setResponseResult(result.timelineEntry.description),
        onError: (error) =>
          setResponseResult(
            error instanceof Error ? error.message : 'Response action failed.'
          ),
      }
    );
  };

  const handleIsolateConfirm = () => {
    setIsolateFlyout(false);
    dispatchResponse('isolate');
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
        {requiredApproverCount > 1 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color={approvalCount >= requiredApproverCount ? 'success' : 'primary'}>
              {approvalCount}/{requiredApproverCount} approvals
            </EuiBadge>
          </EuiFlexItem>
        )}
        {isApprovalReady && (
          <EuiFlexItem grow={false}>
            <EuiButton
              data-test-subj="daybreakGateApproveButton"
              size="s"
              fill
              isLoading={isLoading}
              onClick={handleApprove}
            >
              {needsMoreApprovals ? (
                <FormattedMessage
                  id="xpack.daybreak.gate.addApproval"
                  defaultMessage="Add approval"
                />
              ) : (
                <FormattedMessage id="xpack.daybreak.gate.approve" defaultMessage="Approve" />
              )}
            </EuiButton>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      {missingRequirements && missingRequirements.length > 0 && (
        <>
          <EuiSpacer size="m" />
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
          <EuiSpacer size="s" />
          <div className="daybreakBlastRadius" data-test-subj="daybreakGateBlastRadius">
            <EuiText size="xs" color="subdued" className="daybreakBlastRadiusTitle">
              <FormattedMessage
                id="xpack.daybreak.gate.blastRadiusTitle"
                defaultMessage="Blast radius if approved anyway"
              />
            </EuiText>
            <EuiSpacer size="xs" />
            {missingRequirements.map((req) => (
              <div
                className="daybreakBlastRow"
                key={req}
                data-test-subj={`daybreakBlastRow-${req}`}
              >
                <EuiFlexGroup alignItems="flexStart" gutterSize="s" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="alert" size="s" color="danger" />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiText size="s">
                      <strong>{missingRequirementLabel(req)}</strong>
                    </EuiText>
                    <EuiText size="xs" color="subdued">
                      {blastRadiusCopy[req]}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </div>
            ))}
          </div>
        </>
      )}


      {(proposal.status === 'dismissed' || proposal.status === 'modified') && (
        <>
          <EuiSpacer size="m" />
          <EuiText size="xs" color="subdued">
            POST-DISMISS ACTIONS
          </EuiText>
          <EuiSpacer size="xs" />
          <EuiFlexGroup gutterSize="s" wrap responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButton
                size="s"
                iconType="tag"
                onClick={() => runResponseActionWorker.mutate({ id: proposal.id })}
                isLoading={runResponseActionWorker.isLoading}
                data-test-subj="daybreakGateTagFpWorkerButton"
              >
                Tag FP (run worker)
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
          {responseResult && (
            <>
              <EuiSpacer size="s" />
              <EuiText size="xs" color="subdued" data-test-subj="daybreakGateFpTagResult">
                {responseResult}
              </EuiText>
            </>
          )}
        </>
      )}

      {proposal.status === 'approved' && (
        <>
          <EuiSpacer size="m" />
          <EuiText size="xs" color="subdued">
            RESPONSE ACTIONS
          </EuiText>
          <EuiSpacer size="xs" />
          <EuiFlexGroup gutterSize="s" wrap responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButton
                size="s"
                iconType="inspect"
                onClick={() => dispatchResponse('get_processes')}
                isLoading={actResponse.isLoading}
                data-test-subj="daybreakGateGetProcessesButton"
              >
                Get processes
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                size="s"
                color="warning"
                iconType="lock"
                onClick={() => setIsolateFlyout(true)}
                isLoading={actResponse.isLoading}
                data-test-subj="daybreakGateIsolateHostButton"
              >
                Isolate host
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                size="s"
                iconType="play"
                onClick={() => runResponseActionWorker.mutate({ id: proposal.id })}
                isLoading={runResponseActionWorker.isLoading}
                data-test-subj="daybreakGateRunResponseWorkerButton"
              >
                Run worker
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
          {responseResult && (
            <>
              <EuiSpacer size="s" />
              <EuiText size="xs" color="subdued" data-test-subj="daybreakGateResponseResult">
                {responseResult}
              </EuiText>
            </>
          )}
        </>
      )}

      {isolateFlyout && (
        <ActionFlyout
          proposal={proposal}
          action={isolateGatedAction}
          onClose={() => setIsolateFlyout(false)}
          onConfirm={handleIsolateConfirm}
        />
      )}
    </EuiPanel>
  );
};

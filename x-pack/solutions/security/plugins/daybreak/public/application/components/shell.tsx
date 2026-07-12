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
  EuiButtonEmpty,
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
import { DaybreakVisualStyles } from './daybreak_visual_styles';
import { OperationsConsole } from './operations_console';
import { ApprovalGate } from './gate/approval_gate';
import { ProposalInspector } from './proposal/proposal_inspector';
import { deriveGateTier } from './gate/gate_tier';
import { PROPOSAL_STATUS_META } from './proposal/proposal_status';

const severityColor: Record<DaybreakProposal['severity'], 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

const ProposalRailLabel: React.FC<{ proposal: DaybreakProposal }> = ({ proposal }) => {
  const status = PROPOSAL_STATUS_META[proposal.status];

  return (
    <div className="daybreakRailItemContent">
      <div className="daybreakRailItemTopline">
        <EuiHealth color={severityColor[proposal.severity]}>{proposal.severity}</EuiHealth>
        <span className="daybreakRailItemConfidence">{Math.round(proposal.confidence * 100)}%</span>
      </div>
      <div className="daybreakRailItemTitle">{proposal.title}</div>
      <div className="daybreakRailItemStatus">{status.label()}</div>
    </div>
  );
};

export const DaybreakApp: React.FC = () => {
  const { proposals, isLoading } = useProposals();
  const { evidence } = useEvidence();
  const [selectedId, setSelectedId] = React.useState<string | undefined>();
  const [showOperations, setShowOperations] = React.useState(false);
  const selected = proposals.find((proposal) => proposal.id === selectedId);
  const awaitingReview = proposals.filter(
    (proposal) =>
      !['approved', 'dismissed'].includes(proposal.status) &&
      deriveGateTier(proposal) === 'approval-required'
  ).length;

  return (
    <EuiFlexGroup
      className="daybreakVisualShell"
      data-test-subj="daybreakAppShell"
      gutterSize="none"
      responsive={false}
    >
      <DaybreakVisualStyles />
      <EuiFlexItem grow={false} className="daybreakRail" data-test-subj="daybreakRail">
        <EuiPanel
          borderRadius="none"
          hasShadow={false}
          paddingSize="none"
          style={{ height: '100%' }}
        >
          <div className="daybreakRailHeader">
            <EuiText className="daybreakEyebrow" size="xs">
              DAYBREAK / OPERATIONAL QUEUE
            </EuiText>
            <EuiSpacer size="xs" />
            <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiTitle className="daybreakRailTitle" size="s">
                  <h2>Active threads</h2>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge
                  className="daybreakReviewBadge"
                  color={awaitingReview > 0 ? 'warning' : 'hollow'}
                >
                  {awaitingReview} review
                </EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </div>
          <div className="daybreakRailSummary">
            <span>{proposals.length} active signals</span>
            <span>Prioritized by decision risk</span>
          </div>
          {isLoading ? (
            <div className="daybreakRailLoading" data-test-subj="daybreakRailLoading">
              <EuiLoadingSpinner size="m" />
            </div>
          ) : proposals.length === 0 ? (
            <EuiText
              className="daybreakRailEmpty"
              size="s"
              color="subdued"
              data-test-subj="daybreakRailEmpty"
            >
              No proposals yet.
            </EuiText>
          ) : (
            <EuiListGroup
              className="daybreakRailList"
              data-test-subj="daybreakRailList"
              bordered={false}
              listItems={proposals.map((proposal) => ({
                id: proposal.id,
                label: <ProposalRailLabel proposal={proposal} />,
                isActive: proposal.id === selectedId,
                onClick: () => setSelectedId(proposal.id),
                'data-test-subj': `daybreakRailItem-${proposal.id}`,
              }))}
            />
          )}
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem className="daybreakStage" data-test-subj="daybreakStage">
        <EuiPanel
          borderRadius="none"
          hasShadow={false}
          paddingSize="none"
          style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
          <div className="daybreakStageToolbar">
            <span>{selected ? 'Decision workspace' : showOperations ? 'Automation controls' : 'Shift brief'}</span>
            <EuiButtonEmpty
              size="xs"
              onClick={() => {
                setSelectedId(undefined);
                setShowOperations((value) => !value);
              }}
            >
              {showOperations ? 'View brief' : 'Manage automations'}
            </EuiButtonEmpty>
          </div>
          <div style={{ flexGrow: 1, overflow: 'auto' }}>
            <main className="daybreakStageScroll">
              {selected ? (
                <DaybreakProposalDetail
                  proposal={selected}
                  evidence={evidence.filter((item) => selected.evidenceRefs.includes(item.id))}
                  onBack={() => setSelectedId(undefined)}
                />
              ) : showOperations ? (
                <OperationsConsole />
              ) : (
                <BriefDashboard />
              )}
            </main>
          </div>
          <div className="daybreakFloatingComposer">
            <EuiFlexGroup
              className="daybreakComposerInner"
              gutterSize="s"
              data-test-subj="daybreakComposer"
            >
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
          </div>
        </EuiPanel>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const DaybreakProposalDetail: React.FC<{
  proposal: DaybreakProposal;
  evidence: DaybreakEvidence[];
  onBack: () => void;
}> = ({ proposal, evidence, onBack }) => {
  const status = PROPOSAL_STATUS_META[proposal.status];

  return (
    <div data-test-subj="daybreakProposalDetail">
      <EuiButtonEmpty className="daybreakDetailBack" iconType="arrowLeft" size="s" onClick={onBack}>
        Back to operational brief
      </EuiButtonEmpty>
      <EuiSpacer size="m" />
      <section className="daybreakDecisionHero">
        <EuiText className="daybreakEyebrow" size="xs">
          PROPOSAL / DECISION CONTEXT
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiTitle className="daybreakDetailTitle" size="m">
          <h3>{proposal.title}</h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiFlexGroup
          className="daybreakDecisionMeta"
          alignItems="center"
          gutterSize="s"
          responsive={false}
        >
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
      </section>
      <EuiSpacer size="l" />
      <EuiPanel className="daybreakRecommendation" hasBorder paddingSize="l" color="subdued">
        <div className="daybreakRecommendationHeader">
          <span>Recommended action</span>
          <span>Decision ready</span>
        </div>
        <EuiSpacer size="s" />
        <EuiText className="daybreakRecommendationCopy" size="m">
          {proposal.recommendation ?? 'Continue gathering evidence before recommending an action.'}
        </EuiText>
      </EuiPanel>
      <EuiSpacer size="l" />
      <ProposalInspector proposal={proposal} evidence={evidence} />
      <EuiSpacer size="l" />
      <ApprovalGate proposal={proposal} />
    </div>
  );
};

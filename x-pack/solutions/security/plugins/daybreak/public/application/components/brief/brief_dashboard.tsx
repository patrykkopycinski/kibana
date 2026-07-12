/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiListGroup,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useProposals } from '../../hooks/use_proposals';
import type { DaybreakProposal } from '../../../services/proposals_service';

const severityRank: Record<DaybreakProposal['severity'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const isGateReady = (proposal: DaybreakProposal): boolean =>
  proposal.evidenceRefs.length > 0 && Boolean(proposal.recommendation?.trim());

export interface BriefDashboardSections {
  openThreads: DaybreakProposal[];
  awaitingReview: DaybreakProposal[];
  nextActions: DaybreakProposal[];
  priorityProposal?: DaybreakProposal;
  priorityProposalId?: string;
}

const TERMINAL_STATUSES: ReadonlySet<DaybreakProposal['status']> = new Set([
  'approved',
  'dismissed',
]);

const sortByPriority = (proposals: DaybreakProposal[]): DaybreakProposal[] =>
  [...proposals].sort(
    (left, right) =>
      Number(isGateReady(right)) - Number(isGateReady(left)) ||
      severityRank[right.severity] - severityRank[left.severity] ||
      right.confidence - left.confidence
  );

export const computeBriefSections = (proposals: DaybreakProposal[]): BriefDashboardSections => {
  const openThreads = proposals.filter((proposal) => !TERMINAL_STATUSES.has(proposal.status));
  const awaitingReview = openThreads.filter(isGateReady);
  const priorityProposal = sortByPriority(openThreads)[0];
  return {
    openThreads,
    awaitingReview,
    nextActions: openThreads.filter((proposal) => Boolean(proposal.recommendation?.trim())),
    priorityProposal,
    priorityProposalId: priorityProposal?.id,
  };
};

const QueuePanel: React.FC<{
  dataTestSubj: string;
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  count: number;
  emptyMessage: React.ReactNode;
  isLoading: boolean;
  children: React.ReactNode;
}> = ({ dataTestSubj, eyebrow, title, count, emptyMessage, isLoading, children }) => (
  <EuiPanel className="daybreakBriefCard" data-test-subj={dataTestSubj} paddingSize="m" hasBorder>
    <EuiText className="daybreakEyebrow" size="xs">
      {eyebrow}
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
          <h3>{title}</h3>
        </EuiTitle>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBadge data-test-subj={`${dataTestSubj}Count`} color={count > 0 ? 'accent' : 'hollow'}>
          {count}
        </EuiBadge>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="s" />
    {isLoading ? (
      <div data-test-subj={`${dataTestSubj}Loading`}>
        <EuiLoadingSpinner size="m" />
      </div>
    ) : count === 0 ? (
      <EuiText size="s" color="subdued" data-test-subj={`${dataTestSubj}Empty`}>
        {emptyMessage}
      </EuiText>
    ) : (
      children
    )}
  </EuiPanel>
);

const PriorityBrief: React.FC<{ proposal?: DaybreakProposal; isLoading: boolean }> = ({
  proposal,
  isLoading,
}) => {
  if (isLoading) {
    return <EuiLoadingSpinner data-test-subj="daybreakBriefPriorityLoading" size="m" />;
  }

  if (!proposal) {
    return (
      <EuiPanel
        className="daybreakBriefPriority"
        data-test-subj="daybreakBriefPriorityEmpty"
        paddingSize="l"
        hasBorder
      >
        <EuiText size="s" color="subdued">
          No active decision needs attention.
        </EuiText>
      </EuiPanel>
    );
  }

  return (
    <EuiPanel
      className="daybreakBriefPriority"
      data-test-subj="daybreakBriefPriority"
      paddingSize="l"
      hasBorder
    >
      <EuiText className="daybreakEyebrow" size="xs">
        PRIORITY DECISION
      </EuiText>
      <EuiSpacer size="s" />
      <EuiFlexGroup
        alignItems="flexStart"
        justifyContent="spaceBetween"
        responsive={false}
        gutterSize="m"
      >
        <EuiFlexItem>
          <EuiTitle size="s">
            <h2>{proposal.title}</h2>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiText className="daybreakBriefPriorityCopy" size="m">
            {proposal.recommendation ?? 'Gather the missing decision context before taking action.'}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color={isGateReady(proposal) ? 'warning' : 'hollow'}>
            {isGateReady(proposal) ? 'Review ready' : 'Evidence in progress'}
          </EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <div className="daybreakBriefPriorityFacts">
        <span>{proposal.severity} severity</span>
        <span>{Math.round(proposal.confidence * 100)}% confidence</span>
        <span>
          {proposal.evidenceRefs.length} evidence item
          {proposal.evidenceRefs.length === 1 ? '' : 's'}
        </span>
      </div>
    </EuiPanel>
  );
};

export const BriefDashboard: React.FC = () => {
  const { proposals, isLoading } = useProposals();
  const { openThreads, awaitingReview, nextActions, priorityProposal } =
    computeBriefSections(proposals);

  return (
    <div data-test-subj="daybreakBriefDashboard">
      <div className="daybreakBriefIntro">
        <EuiText className="daybreakEyebrow" size="xs">
          DAYBREAK / SHIFT BRIEF
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiTitle className="daybreakBriefTitle" size="m">
          <h1>Operational brief</h1>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText className="daybreakBriefLead">
          Start with the highest-priority decision, then scan the remaining operational queue.
        </EuiText>
      </div>
      <PriorityBrief proposal={priorityProposal} isLoading={isLoading} />
      <EuiSpacer size="m" />
      <EuiFlexGroup className="daybreakBriefSignals" gutterSize="s" responsive={false}>
        <EuiFlexItem>
          <span>
            <strong>{openThreads.length}</strong> active threads
          </span>
        </EuiFlexItem>
        <EuiFlexItem>
          <span>
            <strong>{awaitingReview.length}</strong> waiting for review
          </span>
        </EuiFlexItem>
        <EuiFlexItem>
          <span>
            <strong>{nextActions.length}</strong> recommendations
          </span>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="l" />
      <EuiFlexGroup className="daybreakBriefCards" gutterSize="m" wrap>
        <EuiFlexItem grow={false} style={{ minWidth: 280, flexBasis: '48%' }}>
          <QueuePanel
            dataTestSubj="daybreakBriefAwaitingReview"
            eyebrow="HUMAN DECISION"
            title={
              <FormattedMessage
                id="xpack.daybreak.brief.awaitingReview.title"
                defaultMessage="Ready to review"
              />
            }
            count={awaitingReview.length}
            isLoading={isLoading}
            emptyMessage="Nothing is awaiting review."
          >
            <EuiListGroup
              data-test-subj="daybreakBriefAwaitingReviewList"
              bordered={false}
              listItems={awaitingReview.map((proposal) => ({
                id: proposal.id,
                label: proposal.title,
                'data-test-subj': `daybreakBriefAwaitingReviewItem-${proposal.id}`,
              }))}
            />
          </QueuePanel>
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ minWidth: 280, flexBasis: '48%' }}>
          <QueuePanel
            dataTestSubj="daybreakBriefOpenThreads"
            eyebrow="LIVE QUEUE"
            title={
              <FormattedMessage
                id="xpack.daybreak.brief.openThreads.title"
                defaultMessage="Active threads"
              />
            }
            count={openThreads.length}
            isLoading={isLoading}
            emptyMessage="No open threads."
          >
            <EuiListGroup
              data-test-subj="daybreakBriefOpenThreadsList"
              bordered={false}
              listItems={sortByPriority(openThreads).map((proposal) => ({
                id: proposal.id,
                label: proposal.title,
                'data-test-subj': `daybreakBriefOpenThreadsItem-${proposal.id}`,
              }))}
            />
          </QueuePanel>
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 280, flexBasis: '100%' }}>
          <QueuePanel
            dataTestSubj="daybreakBriefNextActions"
            eyebrow="RECOMMENDED"
            title={
              <FormattedMessage
                id="xpack.daybreak.brief.nextActions.title"
                defaultMessage="Recommended actions"
              />
            }
            count={nextActions.length}
            isLoading={isLoading}
            emptyMessage="No recommended actions yet."
          >
            <EuiFlexGroup direction="column" gutterSize="s">
              {sortByPriority(nextActions).map((proposal) => (
                <EuiFlexItem key={proposal.id}>
                  <EuiText size="s" data-test-subj={`daybreakBriefNextActionsItem-${proposal.id}`}>
                    <strong>{proposal.title}</strong>
                    <br />
                    {proposal.recommendation}
                  </EuiText>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </QueuePanel>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};

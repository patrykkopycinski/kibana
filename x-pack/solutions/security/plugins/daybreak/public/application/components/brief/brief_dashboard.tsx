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

const isGateReady = (proposal: DaybreakProposal): boolean =>
  proposal.evidenceRefs.length > 0 && Boolean(proposal.recommendation?.trim());

export interface BriefDashboardSections {
  openThreads: DaybreakProposal[];
  awaitingReview: DaybreakProposal[];
  nextActions: DaybreakProposal[];
}

const TERMINAL_STATUSES: ReadonlySet<DaybreakProposal['status']> = new Set([
  'approved',
  'dismissed',
]);

export const computeBriefSections = (proposals: DaybreakProposal[]): BriefDashboardSections => {
  const openThreads = proposals.filter((proposal) => !TERMINAL_STATUSES.has(proposal.status));
  return {
    openThreads,
    awaitingReview: openThreads.filter(isGateReady),
    nextActions: openThreads.filter((proposal) => Boolean(proposal.recommendation?.trim())),
  };
};

const SectionPanel: React.FC<{
  dataTestSubj: string;
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  count: number;
  emptyMessage: React.ReactNode;
  isLoading: boolean;
  children: React.ReactNode;
}> = ({ dataTestSubj, eyebrow, title, count, emptyMessage, isLoading, children }) => (
  <EuiPanel data-test-subj={dataTestSubj} paddingSize="m" hasBorder>
    <EuiText size="xs" color="subdued">
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

export const BriefDashboard: React.FC = () => {
  const { proposals, isLoading } = useProposals();
  const { openThreads, awaitingReview, nextActions } = computeBriefSections(proposals);

  return (
    <div data-test-subj="daybreakBriefDashboard">
      <EuiText size="xs" color="subdued">
        DAYBREAK / SHIFT BRIEF
      </EuiText>
      <EuiSpacer size="xs" />
      <EuiTitle size="m">
        <h1>Operational brief</h1>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiText color="subdued">
        Review the work that needs a decision, then open a thread for its evidence and approval
        context.
      </EuiText>
      <EuiSpacer size="l" />
      <EuiFlexGroup gutterSize="m" wrap>
        <EuiFlexItem grow={false} style={{ minWidth: 260, flexBasis: '31%' }}>
          <SectionPanel
            dataTestSubj="daybreakBriefOpenThreads"
            eyebrow="LIVE QUEUE"
            title={
              <FormattedMessage
                id="xpack.daybreak.brief.openThreads.title"
                defaultMessage="Open threads"
              />
            }
            count={openThreads.length}
            isLoading={isLoading}
            emptyMessage="No open threads."
          >
            <EuiListGroup
              data-test-subj="daybreakBriefOpenThreadsList"
              bordered={false}
              listItems={openThreads.map((proposal) => ({
                id: proposal.id,
                label: proposal.title,
                'data-test-subj': `daybreakBriefOpenThreadsItem-${proposal.id}`,
              }))}
            />
          </SectionPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ minWidth: 260, flexBasis: '31%' }}>
          <SectionPanel
            dataTestSubj="daybreakBriefAwaitingReview"
            eyebrow="HUMAN DECISION"
            title={
              <FormattedMessage
                id="xpack.daybreak.brief.awaitingReview.title"
                defaultMessage="Awaiting review"
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
          </SectionPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ minWidth: 260, flexBasis: '31%' }}>
          <SectionPanel
            dataTestSubj="daybreakBriefNextActions"
            eyebrow="RECOMMENDED"
            title={
              <FormattedMessage
                id="xpack.daybreak.brief.nextActions.title"
                defaultMessage="Next actions"
              />
            }
            count={nextActions.length}
            isLoading={isLoading}
            emptyMessage="No recommended actions yet."
          >
            <EuiFlexGroup direction="column" gutterSize="s">
              {nextActions.map((proposal) => (
                <EuiFlexItem key={proposal.id}>
                  <EuiText size="s" data-test-subj={`daybreakBriefNextActionsItem-${proposal.id}`}>
                    <strong>{proposal.title}</strong>
                    <br />
                    {proposal.recommendation}
                  </EuiText>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </SectionPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};

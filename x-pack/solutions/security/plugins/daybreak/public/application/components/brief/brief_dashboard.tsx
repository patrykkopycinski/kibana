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
  EuiNotificationBadge,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useProposals } from '../../hooks/use_proposals';
import type { DaybreakProposal } from '../../../services/proposals_service';

/**
 * A Proposal is gate-ready (would pass `evaluateReadinessGate` for the
 * `approved` transition — `server/client/proposals/gate.ts:62`) when it has
 * at least one evidence reference AND a non-empty recommendation. This is a
 * presentation-only mirror of that check for bucketing purposes — the gate
 * itself stays server-side and is re-enforced (fail-closed, 422) by the
 * transition route; this component never calls it directly (FR-016, per
 * `.ao/recon.md`'s "the gate logic stays server-side" integration note).
 */
const isGateReady = (proposal: DaybreakProposal): boolean =>
  proposal.evidenceRefs.length > 0 &&
  Boolean(proposal.recommendation && proposal.recommendation.trim().length > 0);

/**
 * ASSUMPTION (FR-014, FR-020 — no openspec change spec ("spec.md" under
 * openspec/changes/") is present in this worktree to read the literal
 * requirement text against, see `.ao/blocked.md`'s FR-001 precedent): "open threads" means every Proposal
 * not yet in a terminal state (`approved` or `dismissed`); "awaiting review"
 * means an open Proposal that is gate-ready (evidence + recommendation
 * present) and therefore blocked only on a human approval click, not on more
 * analysis; "next actions" surfaces the concrete `recommendation` text for
 * every open Proposal that has one, regardless of gate-readiness, since a
 * recommendation is actionable even before it clears the gate. This is the
 * most conservative reading available from the existing `ProposalStatus`
 * union and gate semantics (`server/client/proposals/gate.ts`,
 * `proposal_status.ts`) — revisit once the spec/prototype is vendored.
 */
export interface BriefDashboardSections {
  openThreads: DaybreakProposal[];
  awaitingReview: DaybreakProposal[];
  nextActions: DaybreakProposal[];
}

const TERMINAL_STATUSES: ReadonlySet<DaybreakProposal['status']> = new Set([
  'approved',
  'dismissed',
]);

/** Buckets a flat Proposal list into the three Brief dashboard sections. */
export const computeBriefSections = (proposals: DaybreakProposal[]): BriefDashboardSections => {
  const openThreads = proposals.filter((proposal) => !TERMINAL_STATUSES.has(proposal.status));
  const awaitingReview = openThreads.filter(isGateReady);
  const nextActions = openThreads.filter(
    (proposal) => proposal.recommendation && proposal.recommendation.trim().length > 0
  );

  return { openThreads, awaitingReview, nextActions };
};

const SectionPanel: React.FC<{
  dataTestSubj: string;
  title: React.ReactNode;
  count: number;
  emptyMessage: React.ReactNode;
  isLoading: boolean;
  children: React.ReactNode;
}> = ({ dataTestSubj, title, count, emptyMessage, isLoading, children }) => (
  <EuiPanel data-test-subj={dataTestSubj} paddingSize="m" hasBorder>
    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiTitle size="xs">
          <h3>{title}</h3>
        </EuiTitle>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiNotificationBadge
          data-test-subj={`${dataTestSubj}Count`}
          color={count > 0 ? 'accent' : 'subdued'}
        >
          {count}
        </EuiNotificationBadge>
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

/**
 * FR-014, FR-020: the landing/brief surface summarizing a space's Proposal
 * activity into three sections — open threads, proposals awaiting human
 * review, and concrete next actions — all sourced from the real Proposal
 * HTTP API via {@link useProposals} (no mocked or seeded data), mirroring
 * `shell.tsx`'s `DaybreakApp` hook-driven data flow.
 *
 * This is a design-neutral EUI implementation, not a port of the Throughline
 * (NotDaybreak) prototype's `briefView` — the prototype source is
 * unavailable in this repository (`.ao/blocked.md`, FR-001). Once vendored,
 * this component's markup should be diffed 1:1 against the ported
 * `briefView`, keeping the three-section shape and real-data wiring stable.
 */
export const BriefDashboard: React.FC = () => {
  const { proposals, isLoading } = useProposals();
  const { openThreads, awaitingReview, nextActions } = computeBriefSections(proposals);

  return (
    <EuiFlexGroup data-test-subj="daybreakBriefDashboard" direction="column" gutterSize="m">
      <EuiFlexItem>
        <SectionPanel
          dataTestSubj="daybreakBriefOpenThreads"
          title={
            <FormattedMessage
              id="xpack.daybreak.brief.openThreads.title"
              defaultMessage="Open threads"
            />
          }
          count={openThreads.length}
          isLoading={isLoading}
          emptyMessage={
            <FormattedMessage
              id="xpack.daybreak.brief.openThreads.empty"
              defaultMessage="No open threads."
            />
          }
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

      <EuiFlexItem>
        <SectionPanel
          dataTestSubj="daybreakBriefAwaitingReview"
          title={
            <FormattedMessage
              id="xpack.daybreak.brief.awaitingReview.title"
              defaultMessage="Awaiting review"
            />
          }
          count={awaitingReview.length}
          isLoading={isLoading}
          emptyMessage={
            <FormattedMessage
              id="xpack.daybreak.brief.awaitingReview.empty"
              defaultMessage="Nothing is awaiting review."
            />
          }
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

      <EuiFlexItem>
        <SectionPanel
          dataTestSubj="daybreakBriefNextActions"
          title={
            <FormattedMessage
              id="xpack.daybreak.brief.nextActions.title"
              defaultMessage="Next actions"
            />
          }
          count={nextActions.length}
          isLoading={isLoading}
          emptyMessage={
            <FormattedMessage
              id="xpack.daybreak.brief.nextActions.empty"
              defaultMessage="No recommended actions yet."
            />
          }
        >
          <EuiFlexGroup direction="column" gutterSize="s">
            {nextActions.map((proposal) => (
              <EuiFlexItem key={proposal.id}>
                <EuiText size="s" data-test-subj={`daybreakBriefNextActionsItem-${proposal.id}`}>
                  <strong>{proposal.title}:</strong> {proposal.recommendation}
                </EuiText>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </SectionPanel>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

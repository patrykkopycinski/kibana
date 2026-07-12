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
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiIcon,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useProposals } from '../../hooks/use_proposals';
import { useProposalTransition } from '../../hooks/use_proposal_transition';
import type { DaybreakProposal } from '../../../services/proposals_service';
import { ActionFlyout, type GatedAction } from '../action/action_flyout';
import { ThreadTypeBadge } from '../thread/thread_type_badge';
import { deriveThreadType } from '../thread/thread_view';

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

type DecisionKey =
  | 'contain'
  | 'escalate'
  | 'investigate'
  | 'tune'
  | 'suppress'
  | 'monitor'
  | 'dismiss';

interface DecisionMeta {
  key: DecisionKey;
  label: string;
  color: string;
  icon: string;
  blurb: string;
}

const DECISION_META: Record<DecisionKey, DecisionMeta> = {
  contain: {
    key: 'contain',
    label: 'Contain',
    color: '#bd271e',
    icon: 'lock',
    blurb: 'Stop the spread now',
  },
  escalate: {
    key: 'escalate',
    label: 'Escalate',
    color: '#d4791a',
    icon: 'arrowRight',
    blurb: 'Raise for incident response',
  },
  investigate: {
    key: 'investigate',
    label: 'Investigate',
    color: '#1769d3',
    icon: 'search',
    blurb: 'Confirm scope before acting',
  },
  tune: {
    key: 'tune',
    label: 'Tune',
    color: '#7c4dff',
    icon: 'controls',
    blurb: 'Adjust a rule or limit',
  },
  suppress: {
    key: 'suppress',
    label: 'Suppress',
    color: '#7e8796',
    icon: 'eyeClosed',
    blurb: 'Known-good — quiet the alert',
  },
  monitor: {
    key: 'monitor',
    label: 'Monitor',
    color: '#7e8796',
    icon: 'eye',
    blurb: 'Watching — no action yet',
  },
  dismiss: {
    key: 'dismiss',
    label: 'Dismiss',
    color: '#5c6574',
    icon: 'check',
    blurb: 'Closed — no action needed',
  },
};

const DECISION_ORDER: DecisionKey[] = [
  'contain',
  'escalate',
  'investigate',
  'tune',
  'suppress',
  'monitor',
  'dismiss',
];

const ACTIVE_DECISIONS: DecisionKey[] = ['contain', 'escalate', 'investigate', 'tune'];

const severityToScore: Record<DaybreakProposal['severity'], number> = {
  critical: 90,
  high: 70,
  medium: 50,
  low: 30,
};

const severityColor: Record<DaybreakProposal['severity'], string> = {
  critical: '#bd271e',
  high: '#d4791a',
  medium: '#1769d3',
  low: '#00bfb3',
};

const deriveDecision = (proposal: DaybreakProposal): DecisionKey => {
  if (TERMINAL_STATUSES.has(proposal.status)) return 'dismiss';
  if (!isGateReady(proposal)) return 'monitor';
  switch (proposal.severity) {
    case 'critical':
      return 'contain';
    case 'high':
      return 'escalate';
    case 'medium':
      return 'investigate';
    case 'low':
    default:
      return 'tune';
  }
};

const radarScore = (proposal: DaybreakProposal): number =>
  Math.round(severityToScore[proposal.severity] * (0.6 + proposal.confidence * 0.4));

const ScoreGauge: React.FC<{ score: number; color: string; featured?: boolean }> = ({
  score,
  color,
  featured,
}) => {
  const size = featured ? 42 : 38;
  const strokeWidth = featured ? 4 : 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  return (
    <span className={`daybreakGauge ${featured ? 'daybreakGauge--featured' : ''}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e4e7ee"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeLinecap="round"
        />
      </svg>
      <b>{score}</b>
    </span>
  );
};

const DecisionPill: React.FC<{ meta: DecisionMeta }> = ({ meta }) => (
  <span className="daybreakDecisionPill" style={{ color: meta.color }}>
    <span className="daybreakDecisionPillDot" style={{ background: meta.color }} />
    {meta.label}
  </span>
);

const RadarCard: React.FC<{
  proposal: DaybreakProposal;
  featured?: boolean;
  onOpenThread?: () => void;
  onRunGatedAction?: () => void;
  isTransitionLoading?: boolean;
}> = ({ proposal, featured, onOpenThread, onRunGatedAction, isTransitionLoading }) => {
  const decision = deriveDecision(proposal);
  const meta = DECISION_META[decision];
  const score = radarScore(proposal);
  const isReady = isGateReady(proposal);
  return (
    <div
      className={`daybreakRadarCard ${featured ? 'daybreakRadarCard--featured' : ''}`}
      style={{ borderLeftColor: meta.color }}
      data-test-subj={`daybreakRadarCard-${proposal.id}`}
    >
      <div className="daybreakRadarCardHeader">
        <DecisionPill meta={meta} />
        <ThreadTypeBadge type={deriveThreadType(proposal)} />
        {isReady && (
          <EuiBadge color="warning" className="daybreakRadarCardReady">
            Review ready
          </EuiBadge>
        )}
        <EuiFlexItem grow />
        <ScoreGauge score={score} color={meta.color} featured={featured} />
      </div>
      <EuiSpacer size="s" />
      <EuiFlexGroup alignItems="flexStart" gutterSize="m">
        <EuiFlexItem grow={false}>
          <EuiIcon type={meta.icon} size="l" color={meta.color} />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTitle size="xxs">
            <h4 data-test-subj={`daybreakBriefOpenThreadsItem-${proposal.id}`}>{proposal.title}</h4>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiText
            size="s"
            color="subdued"
            data-test-subj={
              proposal.recommendation ? `daybreakBriefNextActionsItem-${proposal.id}` : undefined
            }
          >
            {proposal.recommendation ?? 'Gathering decision context…'}
          </EuiText>
          <EuiSpacer size="xs" />
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiHealth color={severityColor[proposal.severity]}>{proposal.severity}</EuiHealth>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {Math.round(proposal.confidence * 100)}% confidence
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {proposal.evidenceRefs.length} evidence
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        {isReady ? (
          <EuiButton
            size="s"
            fill
            color="warning"
            data-test-subj={`daybreakBriefAwaitingReviewItem-${proposal.id}`}
            onClick={onOpenThread}
          >
            Decide
          </EuiButton>
        ) : (
          <EuiButtonEmpty size="s" onClick={onOpenThread}>
            Open thread
          </EuiButtonEmpty>
        )}
        {isReady && onRunGatedAction && (
          <EuiButtonEmpty
            size="s"
            iconType="lock"
            color="danger"
            onClick={onRunGatedAction}
            isLoading={isTransitionLoading}
            disabled={isTransitionLoading}
            data-test-subj={`daybreakRadarAction-${proposal.id}`}
          >
            Run action
          </EuiButtonEmpty>
        )}
        <EuiFlexItem grow />
        <EuiButtonEmpty iconType="arrowRight" size="xs" onClick={onOpenThread}>
          View
        </EuiButtonEmpty>
      </EuiFlexGroup>
    </div>
  );
};

const DecisionSection: React.FC<{
  meta: DecisionMeta;
  proposals: DaybreakProposal[];
  onOpenThread: (proposal: DaybreakProposal) => void;
  onRunGatedAction: (proposal: DaybreakProposal) => void;
  isTransitionLoading?: boolean;
}> = ({ meta, proposals, onOpenThread, onRunGatedAction, isTransitionLoading }) => {
  if (proposals.length === 0) return null;
  const waiting = proposals.filter((p) => !TERMINAL_STATUSES.has(p.status)).length;
  return (
    <section
      className="daybreakDecisionSection"
      style={{ '--decision-color': meta.color } as React.CSSProperties}
    >
      <div className="daybreakDecisionSectionHeader">
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <span className="daybreakDecisionSectionDot" style={{ background: meta.color }} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiTitle size="xxs">
              <h3 style={{ color: meta.color }}>{meta.label}</h3>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{waiting}</EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {meta.blurb}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </div>
      <EuiSpacer size="s" />
      <EuiFlexGroup direction="column" gutterSize="m">
        {proposals.map((proposal, index) => (
          <EuiFlexItem key={proposal.id} grow={false}>
            <RadarCard
              proposal={proposal}
              featured={index === 0 && ACTIVE_DECISIONS.includes(meta.key)}
              onOpenThread={() => onOpenThread(proposal)}
              onRunGatedAction={() => onRunGatedAction(proposal)}
              isTransitionLoading={isTransitionLoading}
            />
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    </section>
  );
};

const BriefOverview: React.FC<{
  openThreads: DaybreakProposal[];
  awaitingReview: DaybreakProposal[];
  isLoading: boolean;
  activeFilter: DaybreakProposal['severity'] | 'all';
  onFilter: (severity: DaybreakProposal['severity'] | 'all') => void;
}> = ({ openThreads, awaitingReview, isLoading, activeFilter, onFilter }) => {
  if (isLoading) {
    return (
      <EuiPanel
        className="daybreakBriefOverview"
        data-test-subj="daybreakBriefOverview"
        paddingSize="m"
      >
        <EuiLoadingSpinner data-test-subj="daybreakBriefOverviewLoading" />
      </EuiPanel>
    );
  }
  const grouped: Record<DecisionKey, DaybreakProposal[]> = DECISION_ORDER.reduce((acc, key) => {
    acc[key] = [];
    return acc;
  }, {} as Record<DecisionKey, DaybreakProposal[]>);
  openThreads.forEach((proposal) => {
    grouped[deriveDecision(proposal)].push(proposal);
  });
  const visible = ACTIVE_DECISIONS.filter((key) => grouped[key].length > 0).slice(0, 4);
  return (
    <EuiPanel
      className="daybreakBriefOverview"
      data-test-subj="daybreakBriefOverview"
      paddingSize="m"
      hasBorder
    >
      <EuiText className="daybreakEyebrow" size="xs">
        OVERVIEW
      </EuiText>
      <EuiSpacer size="s" />
      <EuiFlexGroup alignItems="stretch" gutterSize="m" responsive={false}>
        {visible.map((key) => {
          const items = grouped[key];
          const waiting = items.filter((p) => !TERMINAL_STATUSES.has(p.status)).length;
          return (
            <EuiFlexItem key={key} className="daybreakOverviewMetric">
              <EuiFlexGroup
                direction="column"
                gutterSize="xs"
                justifyContent="spaceBetween"
                style={{ height: '100%' }}
              >
                <EuiFlexItem grow={false}>
                  <EuiText size="s" style={{ color: DECISION_META[key].color }}>
                    <strong>{DECISION_META[key].label}</strong>
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiTitle size="s">
                    <h2>{waiting}</h2>
                  </EuiTitle>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color="subdued">
                    {DECISION_META[key].blurb}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          );
        })}
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiFlexGroup
        alignItems="center"
        gutterSize="m"
        responsive={false}
        className="daybreakBriefSignals"
      >
        <EuiFlexItem grow={false}>
          <span>
            <strong data-test-subj="daybreakBriefOpenThreadsCount">{openThreads.length}</strong>{' '}
            active threads
          </span>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <span>
            <strong data-test-subj="daybreakBriefAwaitingReviewCount">
              {awaitingReview.length}
            </strong>{' '}
            waiting for review
          </span>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            Surface filter:
          </EuiText>
        </EuiFlexItem>
        {(['all', 'critical', 'high', 'medium', 'low'] as const).map((severity) => (
          <EuiFlexItem grow={false} key={severity}>
            <EuiButtonEmpty
              size="xs"
              color={activeFilter === severity ? 'primary' : 'text'}
              onClick={() => onFilter(severity)}
              data-test-subj={`daybreakBriefFilter-${severity}`}
            >
              {severity === 'all' ? 'All' : severity}
            </EuiButtonEmpty>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    </EuiPanel>
  );
};

export interface BriefDashboardProps {
  onSelectProposal?: (id: string) => void;
}

export const BriefDashboard: React.FC<BriefDashboardProps> = ({ onSelectProposal }) => {
  const { proposals, isLoading } = useProposals();
  const { openThreads, awaitingReview, nextActions, priorityProposal } =
    computeBriefSections(proposals);
  const { transition, isLoading: transitionLoading } = useProposalTransition();
  const [surfaceFilter, setSurfaceFilter] = React.useState<DaybreakProposal['severity'] | 'all'>(
    'all'
  );
  const filteredThreads = React.useMemo(
    () =>
      surfaceFilter === 'all'
        ? openThreads
        : openThreads.filter((p) => p.severity === surfaceFilter),
    [openThreads, surfaceFilter]
  );
  const filteredAwaiting = React.useMemo(
    () =>
      surfaceFilter === 'all'
        ? awaitingReview
        : awaitingReview.filter((p) => p.severity === surfaceFilter),
    [awaitingReview, surfaceFilter]
  );
  const grouped = React.useMemo(() => {
    const acc: Record<DecisionKey, DaybreakProposal[]> = DECISION_ORDER.reduce((map, key) => {
      map[key] = [];
      return map;
    }, {} as Record<DecisionKey, DaybreakProposal[]>);
    sortByPriority(filteredThreads).forEach((proposal) => {
      acc[deriveDecision(proposal)].push(proposal);
    });
    return acc;
  }, [filteredThreads]);

  const onOpenThread = (proposal: DaybreakProposal) => {
    onSelectProposal?.(proposal.id);
  };

  const [flyout, setFlyout] = React.useState<{
    proposal: DaybreakProposal;
    action: GatedAction;
  } | null>(null);
  const defaultGatedAction: GatedAction = {
    label: 'Block source and isolate host',
    cta: 'Approve action',
    tone: 'danger',
    permNote: 'requires containment privileges',
    blast: [
      { icon: 'desktop', text: '1 host will be isolated from the network' },
      { icon: 'globe', text: 'Source IP will be blocked at the perimeter' },
      { icon: 'user', text: '2 user sessions will be revoked' },
    ],
  };
  const onRunGatedAction = (proposal: DaybreakProposal) => {
    setFlyout({ proposal, action: defaultGatedAction });
  };
  const onConfirmAction = async () => {
    if (!flyout) return;
    await transition({ id: flyout.proposal.id, targetStatus: 'approved' });
    setFlyout(null);
  };

  if (isLoading && proposals.length === 0) {
    return (
      <div data-test-subj="daybreakBriefDashboard">
        <EuiLoadingSpinner data-test-subj="daybreakBriefPriorityLoading" />
        <EuiLoadingSpinner data-test-subj="daybreakBriefOpenThreadsLoading" />
        <EuiLoadingSpinner data-test-subj="daybreakBriefAwaitingReviewLoading" />
        <EuiLoadingSpinner data-test-subj="daybreakBriefNextActionsLoading" />
      </div>
    );
  }

  const emptyOpenThreads = filteredThreads.length === 0 && !isLoading;
  const emptyAwaitingReview = filteredAwaiting.length === 0 && !isLoading;

  return (
    <div className="daybreakBriefRadar" data-test-subj="daybreakBriefDashboard">
      <div className="daybreakBriefIntro">
        <EuiText className="daybreakEyebrow" size="xs">
          DAYBREAK / SHIFT BRIEF
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiTitle className="daybreakBriefTitle" size="m">
          <h1>
            {openThreads.length > 0 ? (
              <FormattedMessage
                id="xpack.daybreak.brief.headline.needYou"
                defaultMessage="{count} {count, plural, one {thread} other {threads}} need you"
                values={{ count: awaitingReview.length || openThreads.length }}
              />
            ) : (
              <FormattedMessage
                id="xpack.daybreak.brief.headline.clear"
                defaultMessage="Operational brief"
              />
            )}
          </h1>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText className="daybreakBriefLead">
          Start with the highest-priority decision, then scan the remaining operational queue.
        </EuiText>
      </div>

      <PriorityBrief
        proposal={surfaceFilter === 'all' ? priorityProposal : sortByPriority(filteredThreads)[0]}
        isLoading={isLoading}
      />
      <EuiSpacer size="m" />
      <BriefOverview
        openThreads={filteredThreads}
        awaitingReview={filteredAwaiting}
        isLoading={isLoading}
        activeFilter={surfaceFilter}
        onFilter={setSurfaceFilter}
      />
      <EuiSpacer size="l" />

      {emptyOpenThreads && (
        <EuiText size="s" color="subdued" data-test-subj="daybreakBriefOpenThreadsEmpty">
          No open threads.
        </EuiText>
      )}
      {emptyAwaitingReview && (
        <EuiText size="s" color="subdued" data-test-subj="daybreakBriefAwaitingReviewEmpty">
          Nothing is awaiting review.
        </EuiText>
      )}

      {DECISION_ORDER.map((key) => (
        <DecisionSection
          key={key}
          meta={DECISION_META[key]}
          proposals={grouped[key]}
          onOpenThread={onOpenThread}
          onRunGatedAction={onRunGatedAction}
          isTransitionLoading={transitionLoading}
        />
      ))}

      {flyout && (
        <ActionFlyout
          proposal={flyout.proposal}
          action={flyout.action}
          onClose={() => setFlyout(null)}
          onConfirm={onConfirmAction}
        />
      )}

      <EuiSpacer size="m" />
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiText size="s" color="subdued">
          <strong data-test-subj="daybreakBriefNextActionsCount">{nextActions.length}</strong>{' '}
          recommended actions
        </EuiText>
      </EuiFlexGroup>
      {nextActions.length === 0 && !isLoading && (
        <EuiText size="s" color="subdued" data-test-subj="daybreakBriefNextActionsEmpty">
          No recommended actions yet.
        </EuiText>
      )}
      {isLoading && <EuiLoadingSpinner data-test-subj="daybreakBriefNextActionsLoading" />}

      <ShiftHandoff proposals={proposals} />
    </div>
  );
};

const TERMINAL_STATUSES_FOR_HANDOFF: ReadonlySet<DaybreakProposal['status']> = new Set([
  'approved',
  'dismissed',
  'escalated',
]);

const ShiftHandoff: React.FC<{ proposals: DaybreakProposal[] }> = ({ proposals }) => {
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  const decisions = proposals
    .filter((proposal) => TERMINAL_STATUSES_FOR_HANDOFF.has(proposal.status))
    .filter((proposal) =>
      (proposal.decisionHistory ?? []).some(
        (entry) => new Date(entry.timestamp).getTime() > twentyFourHoursAgo
      )
    )
    .sort((a, b) => {
      const aLast = Math.max(
        ...(a.decisionHistory ?? []).map((e) => new Date(e.timestamp).getTime())
      );
      const bLast = Math.max(
        ...(b.decisionHistory ?? []).map((e) => new Date(e.timestamp).getTime())
      );
      return bLast - aLast;
    });

  if (decisions.length === 0) return null;

  return (
    <>
      <EuiSpacer size="l" />
      <EuiText className="daybreakEyebrow" size="xs">
        SHIFT HANDOFF
      </EuiText>
      <EuiSpacer size="s" />
      <EuiFlexGroup direction="column" gutterSize="s" data-test-subj="daybreakShiftHandoff">
        {decisions.map((proposal) => (
          <EuiFlexItem key={proposal.id} grow={false}>
            <EuiPanel hasBorder paddingSize="s">
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiBadge
                    color={
                      proposal.status === 'approved'
                        ? 'success'
                        : proposal.status === 'escalated'
                        ? 'danger'
                        : 'hollow'
                    }
                  >
                    {proposal.status}
                  </EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText size="s">
                    <strong>{proposal.title}</strong>
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    </>
  );
};

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

  const decision = deriveDecision(proposal);
  const meta = DECISION_META[decision];
  const score = radarScore(proposal);
  const isReady = isGateReady(proposal);

  return (
    <EuiPanel
      className="daybreakBriefPriority"
      data-test-subj="daybreakBriefPriority"
      paddingSize="l"
      hasBorder
      style={{ borderLeftColor: meta.color }}
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
          <EuiFlexGroup alignItems="center" gutterSize="s" direction="column">
            <EuiFlexItem grow={false}>
              <ScoreGauge score={score} color={meta.color} featured />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color={isReady ? 'warning' : 'hollow'}>
                {isReady ? 'Review ready' : 'Evidence in progress'}
              </EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
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

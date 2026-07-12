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
  EuiEmptyPrompt,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiIcon,
  EuiListGroup,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useProposals } from '../hooks/use_proposals';
import { useEvidence } from '../hooks/use_evidence';
import type { DaybreakProposal } from '../../services/proposals_service';
import { BriefDashboard } from './brief/brief_dashboard';
import { DaybreakVisualStyles } from './daybreak_visual_styles';
import { OperationsConsole } from './operations_console';
import { ApprovalGate } from './gate/approval_gate';
import { ProposalInspector } from './proposal/proposal_inspector';
import { ThreadView } from './thread/thread_view';
import { deriveGateTier } from './gate/gate_tier';
import { PROPOSAL_STATUS_META } from './proposal/proposal_status';

const severityColor: Record<DaybreakProposal['severity'], 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

type Destination =
  | 'brief'
  | 'chats'
  | 'discover'
  | 'dashboards'
  | 'alerts'
  | 'attacks'
  | 'records'
  | 'hunt'
  | 'streams'
  | 'agents';

interface RailDestination {
  key: Destination;
  label: string;
  icon: string;
  group?: 'primary' | 'operate' | 'agent';
}

const RAIL_DESTINATIONS: RailDestination[] = [
  { key: 'brief', label: 'Brief', icon: 'sun', group: 'primary' },
  { key: 'chats', label: 'Chats', icon: 'comment', group: 'primary' },
  { key: 'discover', label: 'Discover', icon: 'compass', group: 'operate' },
  { key: 'dashboards', label: 'Dashboards', icon: 'grid', group: 'operate' },
  { key: 'alerts', label: 'Alerts', icon: 'alert', group: 'operate' },
  { key: 'attacks', label: 'Attacks', icon: 'siren', group: 'operate' },
  { key: 'records', label: 'Records', icon: 'list', group: 'operate' },
  { key: 'hunt', label: 'Threat hunt', icon: 'target', group: 'operate' },
  { key: 'streams', label: 'Streams', icon: 'logstashFilter', group: 'operate' },
  { key: 'agents', label: 'Watches', icon: 'eye', group: 'agent' },
];

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

const AppPlaceholder: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <div className="daybreakAppPage" data-test-subj="daybreakAppPlaceholder">
    <EuiEmptyPrompt title={<h3>{title}</h3>} body={<p>{subtitle}</p>} />
  </div>
);

const ChatThreadList: React.FC<{ onSelect: (id: string) => void; selectedId?: string }> = ({
  onSelect,
  selectedId,
}) => {
  const { proposals } = useProposals();
  const threads = proposals.map((proposal) => ({
    id: proposal.id,
    title: proposal.title,
    status: proposal.status,
    severity: proposal.severity,
  }));

  return (
    <div className="daybreakNavPanelList">
      {threads.length === 0 ? (
        <EuiText size="s" color="subdued" className="daybreakNavPanelList">
          No chat threads yet.
        </EuiText>
      ) : (
        threads.map((thread) => (
          <button
            key={thread.id}
            className={`daybreakNavPanelItem ${
              selectedId === thread.id ? 'daybreakNavPanelItem--active' : ''
            }`}
            onClick={() => onSelect(thread.id)}
            data-test-subj={`daybreakNavItem-${thread.id}`}
          >
            <div className="daybreakRailItemContent">
              <div className="daybreakRailItemTopline">
                <EuiHealth color={severityColor[thread.severity]}>{thread.severity}</EuiHealth>
              </div>
              <div className="daybreakRailItemTitle">{thread.title}</div>
              <div className="daybreakRailItemStatus">{thread.status}</div>
            </div>
          </button>
        ))
      )}
    </div>
  );
};

const ChatThreadView: React.FC<{ threadId: string; onBack: () => void }> = ({ threadId }) => {
  const { proposals } = useProposals();
  const thread = proposals.find((p) => p.id === threadId);
  if (!thread) return null;
  return <ThreadView proposal={thread} type="chat" />;
};

export const DaybreakApp: React.FC = () => {
  const { proposals, isLoading } = useProposals();
  const { evidence } = useEvidence();
  const [selectedId, setSelectedId] = React.useState<string | undefined>();
  const [destination, setDestination] = React.useState<Destination>('brief');
  const [chatThreadId, setChatThreadId] = React.useState<string | undefined>();
  const [mode, setMode] = React.useState<'dayshift' | 'nightshift'>('dayshift');
  const selected = proposals.find((proposal) => proposal.id === selectedId);
  const awaitingReview = proposals.filter(
    (proposal) =>
      !['approved', 'dismissed'].includes(proposal.status) &&
      deriveGateTier(proposal) === 'approval-required'
  ).length;

  const renderNavPanel = () => {
    if (destination === 'brief') {
      return (
        <>
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
        </>
      );
    }

    if (destination === 'chats') {
      return (
        <>
          <div className="daybreakRailHeader">
            <EuiText className="daybreakEyebrow" size="xs">
              CHATS
            </EuiText>
            <EuiSpacer size="xs" />
            <EuiTitle className="daybreakRailTitle" size="s">
              <h2>Threads</h2>
            </EuiTitle>
          </div>
          <ChatThreadList selectedId={chatThreadId} onSelect={setChatThreadId} />
        </>
      );
    }

    return (
      <>
        <div className="daybreakRailHeader">
          <EuiText className="daybreakEyebrow" size="xs">
            {RAIL_DESTINATIONS.find((d) => d.key === destination)?.label.toUpperCase()}
          </EuiText>
        </div>
      </>
    );
  };

  const renderMainStage = () => {
    if (destination === 'brief') {
      if (selected) {
        return <ProposalThread proposal={selected} />;
      }
      return <BriefDashboard onSelectProposal={setSelectedId} />;
    }

    if (destination === 'chats') {
      if (chatThreadId) {
        return <ChatThreadView threadId={chatThreadId} onBack={() => setChatThreadId(undefined)} />;
      }
      return <AppPlaceholder title="Chats" subtitle="Select a thread to start investigating." />;
    }

    if (destination === 'agents') {
      return <OperationsConsole />;
    }

    const dest = RAIL_DESTINATIONS.find((d) => d.key === destination);
    return (
      <AppPlaceholder title={dest?.label ?? destination} subtitle="App integration coming soon." />
    );
  };

  const renderInspector = () => {
    if (destination !== 'brief' || !selected) {
      return null;
    }
    const selectedEvidence = evidence.filter((item) => selected.evidenceRefs.includes(item.id));
    return (
      <EuiFlexItem
        grow={false}
        className="daybreakInspectorWrapper"
        data-test-subj="daybreakInspectorPanel"
      >
        <EuiPanel
          className="daybreakInspectorPanel"
          borderRadius="none"
          hasShadow={false}
          paddingSize="none"
        >
          <div className="daybreakInspectorAppBar">
            <EuiText size="xs" className="daybreakEyebrow">
              INSPECTOR
            </EuiText>
            <EuiButtonEmpty
              iconType="cross"
              size="xs"
              onClick={() => setSelectedId(undefined)}
              aria-label="Close inspector"
            >
              Close
            </EuiButtonEmpty>
          </div>
          <div className="daybreakInspectorBody">
            <ProposalInspector proposal={selected} evidence={selectedEvidence} />
            <EuiSpacer size="l" />
            <ApprovalGate proposal={selected} />
          </div>
        </EuiPanel>
      </EuiFlexItem>
    );
  };

  return (
    <EuiFlexGroup
      className={`daybreakVisualShell ${mode === 'nightshift' ? 'daybreakNightshift' : ''}`}
      data-test-subj="daybreakAppShell"
      gutterSize="none"
      responsive={false}
    >
      <DaybreakVisualStyles />

      <EuiFlexItem grow={false} className="daybreakRail" data-test-subj="daybreakRail">
        <EuiFlexGroup
          direction="column"
          justifyContent="spaceBetween"
          gutterSize="none"
          style={{ height: '100%' }}
        >
          <EuiFlexItem grow={false}>
            {RAIL_DESTINATIONS.map((dest) => {
              const isBrief = dest.key === 'brief';
              const isActive = destination === dest.key;
              const label = isBrief ? (mode === 'nightshift' ? 'NightShift' : 'Brief') : dest.label;
              const icon = isBrief ? (mode === 'nightshift' ? 'moon' : dest.icon) : dest.icon;
              const tooltip = isBrief
                ? mode === 'nightshift'
                  ? 'NightShift'
                  : 'NotDaybreak · Brief'
                : dest.label;
              return (
                <EuiToolTip content={tooltip} position="right" key={dest.key}>
                  <button
                    className={`daybreakRailItem ${isActive ? 'daybreakRailItem--active' : ''} ${
                      isBrief ? 'daybreakRailItem--solution' : ''
                    }`}
                    onClick={() => {
                      if (isBrief) {
                        setMode((current) => (current === 'dayshift' ? 'nightshift' : 'dayshift'));
                      }
                      setDestination(dest.key);
                      setSelectedId(undefined);
                      setChatThreadId(undefined);
                    }}
                    data-test-subj={`daybreakRailItem-${dest.key}`}
                    aria-label={label}
                  >
                    <EuiIcon type={icon} size="m" />
                    <span className="daybreakRailItemLabel">{label}</span>
                  </button>
                </EuiToolTip>
              );
            })}
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              className="daybreakRailFooterButton"
              iconType="gear"
              size="xs"
              disabled
              aria-label="Settings"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>

      <EuiFlexItem grow={false} className="daybreakNavPanelWrapper">
        <EuiPanel
          className="daybreakNavPanel"
          borderRadius="none"
          hasShadow={false}
          paddingSize="none"
        >
          {renderNavPanel()}
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
            <span>{RAIL_DESTINATIONS.find((d) => d.key === destination)?.label}</span>
            {selected && destination === 'brief' && (
              <EuiButtonEmpty
                iconType="panel"
                size="xs"
                onClick={() => setSelectedId(undefined)}
                data-test-subj="daybreakInspectorToggle"
              >
                Inspector
              </EuiButtonEmpty>
            )}
          </div>
          <div style={{ flexGrow: 1, overflow: 'auto' }}>
            <main className="daybreakStageScroll">{renderMainStage()}</main>
          </div>
          {destination === 'brief' && (
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
          )}
        </EuiPanel>
      </EuiFlexItem>

      {renderInspector()}
    </EuiFlexGroup>
  );
};

const ProposalThread: React.FC<{ proposal: DaybreakProposal }> = ({ proposal }) => (
  <div data-test-subj="daybreakProposalDetail">
    <ThreadView proposal={proposal} />
  </div>
);

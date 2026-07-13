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
  EuiFieldSearch,
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
  useEuiTheme,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useProposals } from '../hooks/use_proposals';
import { useEvidence } from '../hooks/use_evidence';
import type { DaybreakProposal } from '../../services/proposals_service';
import { BriefDashboard } from './brief/brief_dashboard';
import { DaybreakVisualStyles } from './daybreak_visual_styles';
import { WatchesConsole } from './watches_console';
import { WorkflowsConsole } from './workflows_console';
import { InvestigationsConsole } from './investigations_console';
import { SseConsole } from './sse_console';
import { SkillsConsole } from './skills_console';
import { ActivityConsole } from './activity_console';
import { PerformanceConsole } from './performance_console';
import { GuardrailsConsole } from './guardrails_console';
import { EmbeddedAppPage } from './embedded_app_page';
import { ApprovalGate } from './gate/approval_gate';
import { InspectorPanel } from './inspector/inspector_panel';
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
  | 'agents'
  | 'workflows'
  | 'skills'
  | 'investigations'
  | 'sse'
  | 'activity'
  | 'performance'
  | 'guardrails';

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
  { key: 'workflows', label: 'Workflows', icon: 'play', group: 'agent' },
  { key: 'skills', label: 'Skills', icon: 'layers', group: 'agent' },
  { key: 'investigations', label: 'Investigations', icon: 'magnifyWithPlus', group: 'agent' },
  { key: 'sse', label: 'SSE', icon: 'bell', group: 'agent' },
  { key: 'activity', label: 'Activity', icon: 'pulse', group: 'agent' },
  { key: 'performance', label: 'Performance', icon: 'stats', group: 'agent' },
  { key: 'guardrails', label: 'Guardrails', icon: 'security', group: 'agent' },
];

const RAIL_GROUPS = ['primary', 'operate', 'agent'] as const;

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
  const { colorMode } = useEuiTheme();
  const isDarkVisual = colorMode === 'DARK' || mode === 'nightshift';
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
          <div className="daybreakNavPanelHeader">
            <div className="daybreakNavTop">
              <div className="daybreakNavBrand">
                <EuiIcon type="logoSecurity" size="m" aria-hidden={true} />
                <span>NotDaybreak</span>
              </div>
              <EuiButtonEmpty
                className="daybreakNavNew"
                iconType="plus"
                size="xs"
                aria-label="New thread"
                disabled
              />
              <EuiButtonEmpty
                className="daybreakNavCollapse"
                iconType="menuRight"
                size="xs"
                aria-label="Collapse sidebar"
                disabled
              />
            </div>
            <EuiSpacer size="s" />
            <EuiFieldSearch
              className="daybreakNavSearch"
              placeholder="Search threads & records"
              disabled
              fullWidth
              compressed
            />
            <EuiSpacer size="s" />
            <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText className="daybreakEyebrow" size="xs">
                  DAYBREAK / OPERATIONAL QUEUE
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
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
          <div className="daybreakNavPanelHeader">
            <div className="daybreakNavTop">
              <div className="daybreakNavBrand">
                <EuiIcon type="comment" size="m" aria-hidden={true} />
                <span>Chats</span>
              </div>
              <EuiButtonEmpty
                className="daybreakNavNew"
                iconType="plus"
                size="xs"
                aria-label="New thread"
                disabled
              />
            </div>
            <EuiSpacer size="s" />
            <EuiFieldSearch
              className="daybreakNavSearch"
              placeholder="Search threads"
              disabled
              fullWidth
              compressed
            />
            <EuiSpacer size="s" />
            <EuiText className="daybreakEyebrow" size="xs">
              THREADS
            </EuiText>
            <EuiSpacer size="xs" />
            <EuiTitle className="daybreakRailTitle" size="s">
              <h2>Conversations</h2>
            </EuiTitle>
          </div>
          <ChatThreadList selectedId={chatThreadId} onSelect={setChatThreadId} />
        </>
      );
    }

    return (
      <>
        <div className="daybreakNavPanelHeader">
          <div className="daybreakNavTop">
            <div className="daybreakNavBrand">
              <EuiIcon
                type={RAIL_DESTINATIONS.find((d) => d.key === destination)?.icon ?? 'apps'}
                size="m"
                aria-hidden={true}
              />
              <span>{RAIL_DESTINATIONS.find((d) => d.key === destination)?.label}</span>
            </div>
          </div>
          <EuiSpacer size="s" />
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
      return <WatchesConsole />;
    }

    if (destination === 'workflows') {
      return <WorkflowsConsole />;
    }

    if (destination === 'skills') {
      return <SkillsConsole />;
    }

    if (destination === 'investigations') {
      return <InvestigationsConsole />;
    }

    if (destination === 'sse') {
      return <SseConsole />;
    }

    if (destination === 'activity') {
      return <ActivityConsole />;
    }

    if (destination === 'performance') {
      return <PerformanceConsole />;
    }

    if (destination === 'guardrails') {
      return <GuardrailsConsole />;
    }

    const dest = RAIL_DESTINATIONS.find((d) => d.key === destination);
    const appMap: Record<string, { appId: string; description: string }> = {
      discover: {
        appId: 'discover',
        description: 'Search and explore your Security data in Discover.',
      },
      dashboards: {
        appId: 'dashboards',
        description: 'View dashboards that visualize your operational posture.',
      },
      alerts: {
        appId: 'alerting',
        description: 'Inspect and manage active alerts and detection rules.',
      },
      attacks: {
        appId: 'security',
        description: 'Open the Security app to investigate attacks and detections.',
      },
      records: { appId: 'cases', description: 'Manage cases and records from the Cases app.' },
      hunt: { appId: 'security', description: 'Run threat hunts from the Security app.' },
      streams: { appId: 'streams', description: 'Browse and manage data streams.' },
    };
    const mapped = destination && appMap[destination];
    if (mapped) {
      return (
        <EmbeddedAppPage
          title={dest?.label ?? destination}
          appId={mapped.appId}
          icon={dest?.icon ?? 'apps'}
          description={mapped.description}
        />
      );
    }

    return (
      <AppPlaceholder title={dest?.label ?? destination} subtitle="App integration coming soon." />
    );
  };

  const renderInspector = () => {
    if (destination !== 'brief' || !selected) {
      return null;
    }
    const selectedEvidence = evidence
      .filter((item) => selected.evidenceRefs.includes(item.id))
      .filter((item, index, arr) => arr.findIndex((e) => e.id === item.id) === index);
    return (
      <EuiFlexItem
        grow={false}
        className="daybreakInspectorWrapper"
        data-test-subj="daybreakInspectorWrapper"
      >
        <div className="daybreakInspectorColumn">
          <InspectorPanel
            proposal={selected}
            evidence={selectedEvidence}
            onClose={() => setSelectedId(undefined)}
          />
          <div className="daybreakInspectorGate">
            <ApprovalGate proposal={selected} />
          </div>
        </div>
      </EuiFlexItem>
    );
  };

  return (
    <EuiFlexGroup
      className={`daybreakVisualShell ${isDarkVisual ? 'daybreakNightshift' : ''}`}
      data-daybreak-color-mode={colorMode}
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
            <div className="daybreakRailBrand">
              <EuiIcon type="logoSecurity" size="m" aria-hidden={true} />
            </div>
            <EuiSpacer size="s" />
            {RAIL_GROUPS.map((group, groupIndex) => (
              <React.Fragment key={group}>
                {groupIndex > 0 && <div className="daybreakRailSeparator" />}
                {RAIL_DESTINATIONS.filter((d) => d.group === group).map((dest) => {
                  const isBrief = dest.key === 'brief';
                  const isActive = destination === dest.key;
                  const label = isBrief
                    ? mode === 'nightshift'
                      ? 'NightShift'
                      : 'Brief'
                    : dest.label;
                  const icon = isBrief ? (mode === 'nightshift' ? 'moon' : dest.icon) : dest.icon;
                  const tooltip = isBrief
                    ? mode === 'nightshift'
                      ? 'NightShift'
                      : 'NotDaybreak · Brief'
                    : dest.label;
                  return (
                    <EuiToolTip content={tooltip} position="right" key={dest.key}>
                      <button
                        className={`daybreakRailItem ${
                          isActive ? 'daybreakRailItem--active' : ''
                        } ${isBrief ? 'daybreakRailItem--solution' : ''}`}
                        onClick={() => {
                          if (isBrief) {
                            setMode((current) =>
                              current === 'dayshift' ? 'nightshift' : 'dayshift'
                            );
                          }
                          setDestination(dest.key);
                          setSelectedId(undefined);
                          setChatThreadId(undefined);
                        }}
                        data-test-subj={`daybreakRailItem-${dest.key}`}
                        aria-label={label}
                      >
                        <EuiIcon type={icon} size="m" aria-hidden={true} />
                        <span className="daybreakRailItemLabel">{label}</span>
                      </button>
                    </EuiToolTip>
                  );
                })}
              </React.Fragment>
            ))}
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
              <div className="daybreakComposerBox" data-test-subj="daybreakComposer">
                <EuiFieldText
                  className="daybreakComposerInput"
                  data-test-subj="daybreakComposerInput"
                  placeholder="Ask about the operational queue…"
                  fullWidth
                  disabled
                />
                <EuiButton
                  className="daybreakComposerSend"
                  data-test-subj="daybreakComposerSubmit"
                  disabled
                >
                  <FormattedMessage id="xpack.daybreak.composer.send" defaultMessage="Send" />
                </EuiButton>
              </div>
              <EuiText size="xs" color="subdued" className="daybreakComposerFoot">
                Reads run automatically · drafts & actions ask first
              </EuiText>
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

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiEmptyPrompt,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useProposals } from '../hooks/use_proposals';
import { useEvidence } from '../hooks/use_evidence';
import type { DaybreakProposal } from '../../services/proposals_service';
import { BriefDashboard } from './brief/brief_dashboard';
import { DaybreakVisualStyles } from './daybreak_visual_styles';
import { OperationsConsole } from './operations_console';
import { PROPOSAL_STATUS_META } from './proposal/proposal_status';
import { DaybreakRail, type DaybreakDest, type HomeNavView } from './rail';
import { ThreadView } from './thread/thread_view';
import { InspectorPanel } from './inspector/inspector_panel';

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

const NavPanel: React.FC<{
  proposals: DaybreakProposal[];
  selectedId?: string;
  onSelect: (id: string) => void;
  hidden: boolean;
}> = ({ proposals, selectedId, onSelect, hidden }) => {
  if (hidden) return null;
  return (
    <EuiPanel className="daybreakNavPanel" hasBorder={false} hasShadow={false} paddingSize="none">
      <div className="daybreakNavPanelHeader">
        <EuiText className="daybreakEyebrow" size="xs">
          THREADS
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiTitle size="xs">
          <h3>Active records</h3>
        </EuiTitle>
      </div>
      <div className="daybreakNavPanelList">
        {proposals.length === 0 ? (
          <EuiText size="s" color="subdued">
            No records yet.
          </EuiText>
        ) : (
          proposals.map((proposal) => (
            <button
              key={proposal.id}
              className={`daybreakNavPanelItem ${
                proposal.id === selectedId ? 'daybreakNavPanelItem--active' : ''
              }`}
              onClick={() => onSelect(proposal.id)}
              data-test-subj={`daybreakNavItem-${proposal.id}`}
            >
              <ProposalRailLabel proposal={proposal} />
            </button>
          ))
        )}
      </div>
    </EuiPanel>
  );
};

const AppPage: React.FC<{ dest: DaybreakDest }> = ({ dest }) => (
  <div className="daybreakAppPage" data-test-subj={`daybreakAppPage-${dest}`}>
    <EuiEmptyPrompt
      title={<h2>{dest}</h2>}
      body={<p>This operational app surface is not yet wired in the Daybreak spike.</p>}
    />
  </div>
);

export const DaybreakApp: React.FC = () => {
  const { proposals } = useProposals();
  const { evidence } = useEvidence();
  const [selectedId, setSelectedId] = React.useState<string | undefined>();
  const [dest, setDest] = React.useState<DaybreakDest>('home');
  const [navView, setNavView] = React.useState<HomeNavView>('brief');
  const [showOperations, setShowOperations] = React.useState(false);
  const selected = proposals.find((proposal) => proposal.id === selectedId);

  const onGoBrief = () => {
    setDest('home');
    setNavView('brief');
    setSelectedId(undefined);
  };
  const onGoChats = () => {
    setDest('home');
    setNavView('chats');
  };
  const onGo = (next: DaybreakDest) => {
    setDest(next);
  };

  const onOpenNavPrefs = () => {};

  const isHome = dest === 'home';
  const showNavPanel = isHome && navView !== 'brief';

  return (
    <EuiFlexGroup
      className="daybreakVisualShell"
      data-test-subj="daybreakAppShell"
      gutterSize="none"
      responsive={false}
    >
      <DaybreakVisualStyles />
      <DaybreakRail
        dest={dest}
        navView={navView}
        onGoBrief={onGoBrief}
        onGoChats={onGoChats}
        onGo={onGo}
        onOpenNavPrefs={onOpenNavPrefs}
      />

      <EuiFlexItem className="daybreakStage" data-test-subj="daybreakStage">
        <EuiFlexGroup gutterSize="none" responsive={false} style={{ height: '100%' }}>
          {showNavPanel && (
            <EuiFlexItem grow={false} className="daybreakNavPanelWrapper">
              <NavPanel
                proposals={proposals}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  setNavView('chats');
                }}
                hidden={false}
              />
            </EuiFlexItem>
          )}

          <EuiFlexItem className="daybreakHomeStage">
            <EuiPanel
              borderRadius="none"
              hasShadow={false}
              paddingSize="none"
              style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              <div className="daybreakStageToolbar">
                <span>
                  {isHome
                    ? navView === 'brief'
                      ? 'Shift brief'
                      : showOperations
                      ? 'Automation controls'
                      : 'Active thread'
                    : dest}
                </span>
                {isHome && navView === 'brief' && (
                  <EuiButtonEmpty
                    size="xs"
                    onClick={() => {
                      setSelectedId(undefined);
                      setShowOperations((value) => !value);
                    }}
                  >
                    {showOperations ? 'View brief' : 'Manage automations'}
                  </EuiButtonEmpty>
                )}
              </div>
              <div style={{ flexGrow: 1, overflow: 'auto' }}>
                <main className="daybreakStageScroll">
                  {isHome ? (
                    navView === 'brief' ? (
                      showOperations ? (
                        <OperationsConsole />
                      ) : (
                        <BriefDashboard />
                      )
                    ) : selected ? (
                      <ThreadView proposal={selected} />
                    ) : (
                      <EuiText color="subdued" size="s">
                        Select a record from the secondary nav.
                      </EuiText>
                    )
                  ) : (
                    <AppPage dest={dest} />
                  )}
                </main>
              </div>
              {isHome && (
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
          {selected && navView === 'chats' && (
            <EuiFlexItem grow={false} className="daybreakInspectorWrapper">
              <InspectorPanel
                proposal={selected}
                evidence={evidence.filter((item) => selected.evidenceRefs.includes(item.id))}
              />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

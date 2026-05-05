/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  EuiButtonGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPage,
  EuiPageBody,
  EuiPageHeader,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
} from '@elastic/eui';

import type {
  ArgusMutationFilter,
  ArgusMutationWindow,
  ArgusSynthesisWindow,
  DecisionGraphNodeKind,
  MutationLineageSubject,
  ReasoningChainSubject,
} from '@kbn/argus-console-common';
import type { ActivityEvent, ArgusHttp, E2dFlowWindow } from '../hooks';
import { ActivityFeedPanel } from '../panels/activity_feed_panel/activity_feed_panel';
import type { ArgusArtifactPivotTarget } from '../panels/artifact_details_flyout';
import { AutonomyDecisionsPanel } from '../panels/autonomy_decisions_panel';
import { CalderaQueuePanel } from '../panels/caldera_queue_panel';
import { CoverageGapsPanel } from '../panels/coverage_gaps_panel';
import { CoveragePanel } from '../panels/coverage_panel';
import { DecisionGraphPanel } from '../panels/decision_graph_panel';
import { E2dFlowPanel } from '../panels/e2d_flow_panel/e2d_flow_panel';
import { InboxPanel } from '../panels/inbox_panel';
import { KillSwitchChip } from '../panels/kill_switch_chip';
import { MutationLineagePanel } from '../panels/mutation_lineage_panel/mutation_lineage_panel';
import { MutationsPanel } from '../panels/mutations_panel/mutations_panel';
import { PlaybooksPanel, type ArgusPlaybookEntry } from '../panels/playbooks_panel';
import { ProposalsPanel } from '../panels/proposals_panel/proposals_panel';
import { PulsePanel } from '../panels/pulse_panel/pulse_panel';
import { ReasoningDrilldownPanel } from '../panels/reasoning_drilldown_panel/reasoning_drilldown_panel';

export type ArgusConsoleTabId =
  | 'inbox'
  | 'command_center'
  | 'detection_pipeline'
  | 'coverage_threats'
  | 'governance'
  | 'playbooks';

/**
 * Legacy tab IDs that redirect to the new consolidated views. Used by the
 * page wrapper to map inbound URL `?tab=…` values to the new structure.
 */
export type ArgusLegacyTabId =
  | 'overview'
  | 'mutations'
  | 'e2d'
  | 'proposals'
  | 'autonomy'
  | 'coverage'
  | 'corpus'
  | 'caldera'
  | 'decision_graph';

const LEGACY_TAB_MAP: Record<ArgusLegacyTabId, ArgusConsoleTabId> = {
  overview: 'command_center',
  mutations: 'detection_pipeline',
  e2d: 'detection_pipeline',
  proposals: 'detection_pipeline',
  autonomy: 'governance',
  coverage: 'coverage_threats',
  corpus: 'coverage_threats',
  caldera: 'coverage_threats',
  decision_graph: 'governance',
};

export const resolveTabId = (
  raw: ArgusConsoleTabId | ArgusLegacyTabId | undefined
): ArgusConsoleTabId | undefined => {
  if (!raw) return undefined;
  if (raw in LEGACY_TAB_MAP) return LEGACY_TAB_MAP[raw as ArgusLegacyTabId];
  return raw as ArgusConsoleTabId;
};

export interface ArgusConsoleProps {
  readonly http: ArgusHttp;
  /**
   * When the console is opened directly from an alert flyout's
   * "Show ARGUS reasoning" action the subject is pre-selected.
   */
  readonly initialReasoningSubject?: ReasoningChainSubject;
  readonly initialLineageSubject?: MutationLineageSubject;
  /**
   * Optional action buttons rendered on the right side of the page header.
   * The security_solution page wrapper injects navigation shortcuts (open
   * the companion Kibana dashboard, jump to Discover over `.soc-*`) here so
   * the package itself stays independent of Kibana's `application` client.
   */
  readonly headerRightSideItems?: readonly ReactNode[];
  /**
   * Initial tab. Lets a deep-link (e.g. from the Pulse "× blocked" tile) open
   * the console straight into the relevant view. Legacy tab IDs are auto-mapped
   * to their consolidated equivalents.
   */
  readonly initialTab?: ArgusConsoleTabId;
  /**
   * Called whenever the active tab changes. The host page uses this to sync the
   * URL's `tab=…` search parameter so bookmarking and refresh work correctly.
   */
  readonly onTabChange?: (tabId: ArgusConsoleTabId) => void;
  /**
   * Initial filter pill on the Applied mutations sub-view (`detection_pipeline`
   * tab, pipeline stage `mutations`).
   */
  readonly initialMutationsFilter?: ArgusMutationFilter;
  /**
   * Initial time window on the Applied mutations sub-view (`detection_pipeline`
   * tab, pipeline stage `mutations`).
   */
  readonly initialMutationsWindow?: ArgusMutationWindow;
  /**
   * Pre-selected CVE on the E2D flow sub-view (`detection_pipeline` tab,
   * pipeline stage `flow`). Comes from the `?cve=...` URL param.
   */
  readonly initialE2dCve?: string;
  /**
   * Initial live-hits window on the E2D flow sub-view (`detection_pipeline`,
   * pipeline stage `flow`).
   */
  readonly initialE2dWindow?: E2dFlowWindow;
  /**
   * Initial time window on the Proposals sub-view (`detection_pipeline` tab,
   * pipeline stage `proposals`).
   */
  readonly initialProposalsWindow?: ArgusSynthesisWindow;
  /**
   * Whether the signed-in user has the argus_write capability. Gates the
   * kill-switch toggle and the Approve/Reject row actions on the Mutations
   * tab. The backend is the source of truth — this flag just avoids
   * rendering dead affordances.
   */
  readonly canArgusWrite?: boolean;
  /**
   * Optional toast surface. Called when a write action (kill-switch toggle
   * or mutation verdict) fails after the optimistic update. The security
   * solution wrapper wires this to core's notifications service.
   */
  readonly onWriteError?: (error: Error) => void;
  /**
   * Called when an operator clicks a rule-typed artifact in the Autonomy
   * table. The security_solution wrapper implements this with
   * `application.navigateToApp('security', { deepLinkId: 'rules', path: '/id/<uuid>' })`
   * so the package itself stays independent of Kibana's `application`
   * client. When omitted, artifact names render as plain text.
   */
  readonly onOpenRule?: (args: {
    readonly artifactId: string;
    readonly kibanaRuleId?: string;
  }) => void;
  /**
   * Called when an operator activates a row on the Playbooks tab. The
   * security_solution wrapper routes workflows to Workflows Management and
   * skills to Agent Builder chat; when omitted, rows render without an
   * action handler.
   */
  readonly onOpenPlaybook?: (entry: ArgusPlaybookEntry) => void;
  /**
   * Called when an operator clicks "View in Discover" on the shared details
   * flyout. The security_solution wrapper wires this to
   * `application.navigateToApp('discover', ...)` with a KQL filter on
   * `_index` + `_id` so the package stays independent of Kibana's
   * `application` client. When omitted, the pivot button is hidden.
   */
  readonly onOpenDiscover?: (args: {
    readonly sourceIndex: string;
    readonly sourceDocId: string;
  }) => void;
  /**
   * Pre-seed the Decision Graph explorer root. Typically set from URL
   * params on the Governance tab (`?tab=governance&root=advisory:CVE-2024-27198`
   * or split `root_kind` / `root_id`) or when the reasoning-drilldown flyout
   * asks to escalate to full-screen.
   */
  readonly initialDecisionGraphRoot?: {
    readonly kind: DecisionGraphNodeKind;
    readonly id: string;
  };
  /**
   * Called whenever the Decision Graph root changes so the host page can
   * sync URL state. Omitted when the host doesn't care about deep-links.
   */
  readonly onDecisionGraphRootChange?: (args: {
    readonly rootKind: DecisionGraphNodeKind | undefined;
    readonly rootId: string | undefined;
    readonly depth: number;
  }) => void;
}

interface TabDescriptor {
  readonly id: ArgusConsoleTabId;
  readonly name: string;
  readonly subtitle: string;
  readonly icon?: string;
}

const TABS: readonly TabDescriptor[] = [
  {
    id: 'inbox',
    name: 'Inbox',
    subtitle:
      'Items waiting on you — blocked mutations and autonomy decisions the autonomous applier deferred',
    icon: 'email',
  },
  {
    id: 'command_center',
    name: 'Command center',
    subtitle: 'Pulse KPIs · activity feed · mutation lineage · reasoning drill-down',
    icon: 'dashboardApp',
  },
  {
    id: 'detection_pipeline',
    name: 'Detection pipeline',
    subtitle:
      'Advisory → synthesis → backtest → shadow → apply → observe (E2D + proposals + mutations)',
    icon: 'pipelineApp',
  },
  {
    id: 'coverage_threats',
    name: 'Coverage & threats',
    subtitle: 'MITRE heatmap · coverage gaps · threat actors · active simulation queue',
    icon: 'securityAnalyticsApp',
  },
  {
    id: 'governance',
    name: 'Governance',
    subtitle: 'Autonomy decisions · decision graph · reasoning traces · gate audit trail',
    icon: 'managementApp',
  },
  {
    id: 'playbooks',
    name: 'Playbooks',
    subtitle: 'Kibana workflows and Agent Builder skills tagged argus:playbook',
    icon: 'notebookApp',
  },
];

/**
 * Governance sub-view toggle. The Governance tab presents two complementary
 * perspectives on the same data: a flat decision table and a graph visualization.
 */
type GovernanceMode = 'table' | 'graph';

const GOVERNANCE_MODE_OPTIONS = [
  { id: 'table' as const, label: 'Decision table' },
  { id: 'graph' as const, label: 'Decision graph' },
];

/**
 * Detection Pipeline sub-view. Allows focusing on a single pipeline stage
 * while keeping all three accessible inside the same tab.
 */
type PipelineStage = 'flow' | 'proposals' | 'mutations';

const PIPELINE_STAGE_OPTIONS = [
  { id: 'flow' as const, label: 'E2D flow' },
  { id: 'proposals' as const, label: 'Proposals' },
  { id: 'mutations' as const, label: 'Applied mutations' },
];

/**
 * Coverage & Threats sub-view.
 */
type CoverageSubView = 'heatmap' | 'gaps' | 'simulation';

const COVERAGE_SUB_OPTIONS = [
  { id: 'heatmap' as const, label: 'MITRE heatmap' },
  { id: 'gaps' as const, label: 'Coverage gaps' },
  { id: 'simulation' as const, label: 'Active simulation' },
];

export const ArgusConsole: React.FC<ArgusConsoleProps> = ({
  http,
  initialReasoningSubject,
  initialLineageSubject,
  headerRightSideItems,
  initialTab = 'command_center',
  onTabChange,
  initialMutationsFilter,
  initialMutationsWindow,
  initialE2dCve,
  initialE2dWindow,
  initialProposalsWindow,
  canArgusWrite = false,
  onWriteError,
  onOpenRule,
  onOpenPlaybook,
  onOpenDiscover,
  initialDecisionGraphRoot,
  onDecisionGraphRootChange,
}) => {
  const [reasoningSubject, setReasoningSubject] = useState<ReasoningChainSubject | undefined>(
    initialReasoningSubject
  );
  const [lineageSubject, setLineageSubject] = useState<MutationLineageSubject | undefined>(
    initialLineageSubject
  );
  const [activeTab, setActiveTabRaw] = useState<ArgusConsoleTabId>(initialTab);
  const [e2dCve, setE2dCve] = useState<string | undefined>(initialE2dCve);
  const [proposalsCve, setProposalsCve] = useState<string | undefined>(undefined);
  const [decisionGraphRoot, setDecisionGraphRoot] = useState<
    { kind: DecisionGraphNodeKind; id: string } | undefined
  >(initialDecisionGraphRoot);

  const [governanceMode, setGovernanceMode] = useState<GovernanceMode>(
    initialDecisionGraphRoot ? 'graph' : 'table'
  );
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>('flow');
  const [coverageSubView, setCoverageSubView] = useState<CoverageSubView>('heatmap');

  const setActiveTab = useCallback(
    (tabId: ArgusConsoleTabId) => {
      setActiveTabRaw(tabId);
      onTabChange?.(tabId);
    },
    [onTabChange]
  );

  const onEscalateReasoningToDecisionGraph = ({
    rootKind,
    rootId,
  }: {
    readonly rootKind: DecisionGraphNodeKind;
    readonly rootId: string;
  }): void => {
    setDecisionGraphRoot({ kind: rootKind, id: rootId });
    setGovernanceMode('graph');
    setActiveTab('governance');
  };

  const onSelectReasoning = (event: ActivityEvent): void => {
    if (event.run_id) setReasoningSubject({ kind: 'run', id: event.run_id });
    else if (event.alert_id) setReasoningSubject({ kind: 'alert', id: event.alert_id });
  };

  const onSelectLineage = (event: ActivityEvent): void => {
    if (event.rule_id) setLineageSubject({ kind: 'rule', id: event.rule_id });
    else if (event.alert_id) setLineageSubject({ kind: 'alert', id: event.alert_id });
  };

  const onArtifactPivot = (target: ArgusArtifactPivotTarget): void => {
    if (target.kind === 'reasoning') {
      setReasoningSubject(target.subject);
      setActiveTab('command_center');
      return;
    }
    if (target.kind === 'lineage') {
      setLineageSubject(target.subject);
      setActiveTab('command_center');
      return;
    }
    if (target.kind === 'decision_graph') {
      setDecisionGraphRoot({ kind: target.subject.kind, id: target.subject.id });
      setGovernanceMode('graph');
      setActiveTab('governance');
      return;
    }
    if (target.kind === 'discover') {
      onOpenDiscover?.({ sourceIndex: target.sourceIndex, sourceDocId: target.sourceDocId });
    }
  };

  const onPulseMetricClick = useCallback(
    (metricId: string) => {
      switch (metricId) {
        case 'mutations-applied':
          setPipelineStage('mutations');
          setActiveTab('detection_pipeline');
          break;
        case 'mutations-rolled-back':
          setPipelineStage('mutations');
          setActiveTab('detection_pipeline');
          break;
        case 'mutations-blocked':
          setActiveTab('governance');
          break;
        case 'drift-open':
          setActiveTab('governance');
          break;
        case 'rollback-mttr':
          setActiveTab('governance');
          break;
        case 'tier-mix-trusted':
        case 'tier-mix-probationary':
        case 'tier-mix-untrusted':
        case 'tier-mix-system':
          setActiveTab('governance');
          break;
        default:
          break;
      }
    },
    [setActiveTab]
  );

  const currentTab = useMemo(() => TABS.find((t) => t.id === activeTab) ?? TABS[0], [activeTab]);

  const rightSideItems = useMemo<readonly ReactNode[]>(() => {
    const killSwitch = (
      <KillSwitchChip
        key="argus-kill-switch"
        http={http}
        canToggle={canArgusWrite}
        onError={onWriteError}
      />
    );
    return headerRightSideItems && headerRightSideItems.length > 0
      ? [killSwitch, ...headerRightSideItems]
      : [killSwitch];
  }, [headerRightSideItems, http, canArgusWrite, onWriteError]);

  return (
    <EuiPage data-test-subj="argusConsolePage" paddingSize="l">
      <EuiPageBody>
        <EuiPageHeader
          pageTitle="ARGUS console"
          description="Autonomous SOC detection engineering — is ARGUS working, and why did it do what it did?"
          rightSideItems={[...rightSideItems]}
        />

        <EuiSpacer size="m" />

        <EuiTabs data-test-subj="argusConsoleTabs">
          {TABS.map((tab) => (
            <EuiTab
              key={tab.id}
              isSelected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-test-subj={`argusConsoleTab-${tab.id}`}
            >
              {tab.name}
            </EuiTab>
          ))}
        </EuiTabs>

        <EuiSpacer size="s" />

        <EuiText size="xs" color="subdued">
          {currentTab.subtitle}
        </EuiText>

        <EuiSpacer size="l" />

        {/* ── Inbox ──────────────────────────────────────────────── */}
        {activeTab === 'inbox' && (
          <InboxPanel
            http={http}
            canApproveMutations={canArgusWrite}
            onApprovalError={onWriteError}
            onOpenAutonomyDecision={() => {
              // The Governance tab's table view already exposes the row
              // and its `review_reason` once the operator filters to
              // "required_human"; switching tabs gives them the full
              // gate-evaluation context they need to act.
              setGovernanceMode('table');
              setActiveTab('governance');
            }}
            onOpenMutationDetail={() => {
              // The mutation detail flyout lives on the Mutations
              // sub-view of the Detection Pipeline tab. We seed the
              // pipeline stage there and let the table find the row by
              // its mutation_intent_id.
              setPipelineStage('mutations');
              setActiveTab('detection_pipeline');
            }}
          />
        )}

        {/* ── Command Center ─────────────────────────────────────── */}
        {activeTab === 'command_center' && (
          <>
            <PulsePanel http={http} onMetricClick={onPulseMetricClick} />

            <EuiSpacer size="l" />

            <EuiFlexGroup gutterSize="l" alignItems="flexStart">
              <EuiFlexItem grow={5}>
                <ActivityFeedPanel
                  http={http}
                  onSelectReasoning={onSelectReasoning}
                  onSelectLineage={onSelectLineage}
                  onPivot={onArtifactPivot}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={7}>
                <MutationLineagePanel
                  http={http}
                  subject={lineageSubject}
                  onSubjectChange={setLineageSubject}
                  onPivot={onArtifactPivot}
                />
                <EuiSpacer size="l" />
                <ReasoningDrilldownPanel
                  http={http}
                  subject={reasoningSubject}
                  onSubjectChange={setReasoningSubject}
                  onOpenDecisionGraphFullScreen={onEscalateReasoningToDecisionGraph}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </>
        )}

        {/* ── Detection Pipeline ─────────────────────────────────── */}
        {activeTab === 'detection_pipeline' && (
          <>
            <EuiFlexGroup alignItems="center" gutterSize="m">
              <EuiFlexItem grow={false}>
                <EuiButtonGroup
                  legend="Pipeline stage"
                  options={PIPELINE_STAGE_OPTIONS}
                  idSelected={pipelineStage}
                  onChange={(id) => setPipelineStage(id as PipelineStage)}
                  buttonSize="compressed"
                  data-test-subj="argusPipelineStageToggle"
                />
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="m" />

            {pipelineStage === 'flow' && (
              <E2dFlowPanel
                http={http}
                initialCve={e2dCve}
                initialWindow={initialE2dWindow}
                onPivot={onArtifactPivot}
                onOpenProposals={(cveId) => {
                  setProposalsCve(cveId);
                  setPipelineStage('proposals');
                }}
              />
            )}

            {pipelineStage === 'proposals' && (
              <ProposalsPanel
                http={http}
                initialCve={proposalsCve}
                initialWindow={initialProposalsWindow}
                onOpenInFlow={(cveId) => {
                  setE2dCve(cveId);
                  setPipelineStage('flow');
                }}
              />
            )}

            {pipelineStage === 'mutations' && (
              <MutationsPanel
                http={http}
                initialFilter={initialMutationsFilter}
                initialWindow={initialMutationsWindow}
                canApproveMutations={canArgusWrite}
                onApprovalError={onWriteError}
              />
            )}
          </>
        )}

        {/* ── Coverage & Threats ──────────────────────────────────── */}
        {activeTab === 'coverage_threats' && (
          <>
            <EuiFlexGroup alignItems="center" gutterSize="m">
              <EuiFlexItem grow={false}>
                <EuiButtonGroup
                  legend="Coverage view"
                  options={COVERAGE_SUB_OPTIONS}
                  idSelected={coverageSubView}
                  onChange={(id) => setCoverageSubView(id as CoverageSubView)}
                  buttonSize="compressed"
                  data-test-subj="argusCoverageSubViewToggle"
                />
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="m" />

            {coverageSubView === 'heatmap' && <CoveragePanel http={http} />}

            {coverageSubView === 'gaps' && <CoverageGapsPanel http={http} />}

            {coverageSubView === 'simulation' && <CalderaQueuePanel http={http} />}
          </>
        )}

        {/* ── Governance ──────────────────────────────────────────── */}
        {activeTab === 'governance' && (
          <>
            <EuiFlexGroup alignItems="center" gutterSize="m">
              <EuiFlexItem grow={false}>
                <EuiButtonGroup
                  legend="Governance view"
                  options={GOVERNANCE_MODE_OPTIONS}
                  idSelected={governanceMode}
                  onChange={(id) => setGovernanceMode(id as GovernanceMode)}
                  buttonSize="compressed"
                  data-test-subj="argusGovernanceModeToggle"
                />
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="m" />

            {governanceMode === 'table' && (
              <AutonomyDecisionsPanel
                http={http}
                onOpenRule={onOpenRule}
                onPivot={onArtifactPivot}
              />
            )}

            {governanceMode === 'graph' && (
              <DecisionGraphPanel
                http={http}
                initialRootKind={decisionGraphRoot?.kind}
                initialRootId={decisionGraphRoot?.id}
                onRootChange={(args) => {
                  if (args.rootKind && args.rootId) {
                    setDecisionGraphRoot({ kind: args.rootKind, id: args.rootId });
                  } else {
                    setDecisionGraphRoot(undefined);
                  }
                  onDecisionGraphRootChange?.(args);
                }}
              />
            )}
          </>
        )}

        {/* ── Playbooks ──────────────────────────────────────────── */}
        {activeTab === 'playbooks' && (
          <PlaybooksPanel http={http} onOpenPlaybook={onOpenPlaybook} />
        )}
      </EuiPageBody>
    </EuiPage>
  );
};

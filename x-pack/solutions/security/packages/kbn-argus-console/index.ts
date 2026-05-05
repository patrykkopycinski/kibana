/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  ArgusConsole,
  resolveTabId,
  type ArgusConsoleTabId,
  type ArgusLegacyTabId,
} from './src/argus_console/argus_console';
export { ReasoningDrilldownPanel } from './src/panels/reasoning_drilldown_panel/reasoning_drilldown_panel';
export { MutationLineagePanel } from './src/panels/mutation_lineage_panel/mutation_lineage_panel';
export { ActivityFeedPanel } from './src/panels/activity_feed_panel/activity_feed_panel';
export { PulsePanel } from './src/panels/pulse_panel/pulse_panel';
export { MutationsPanel } from './src/panels/mutations_panel/mutations_panel';
export { E2dFlowPanel } from './src/panels/e2d_flow_panel/e2d_flow_panel';
export { ProposalsPanel, ProposalsTable } from './src/panels/proposals_panel';
export { AutonomyDecisionsPanel } from './src/panels/autonomy_decisions_panel';
export { InboxPanel, type InboxPanelProps } from './src/panels/inbox_panel';
export { CoverageGapsPanel } from './src/panels/coverage_gaps_panel';
export { CoveragePanel, type CoveragePanelProps } from './src/panels/coverage_panel';
export { CalderaQueuePanel } from './src/panels/caldera_queue_panel';
export {
  PlaybooksPanel,
  type PlaybooksPanelProps,
  type ArgusPlaybookEntry,
} from './src/panels/playbooks_panel';
export {
  DecisionGraphFlyout,
  type DecisionGraphFlyoutProps,
  DecisionGraphPanel,
  type DecisionGraphPanelProps,
  DecisionGraphSvg,
  type DecisionGraphSvgProps,
} from './src/panels/decision_graph_panel';
export {
  ArgusArtifactDetailsFlyout,
  type ArgusArtifactDetailsFlyoutProps,
  type ArgusArtifactPivotTarget,
} from './src/panels/artifact_details_flyout';
export { KillSwitchChip } from './src/panels/kill_switch_chip';

export {
  useReasoningChain,
  useMutationLineage,
  useActivityFeed,
  useGovernancePulse,
  useMutations,
  useE2dFlow,
  useRecentCves,
  useSynthesisProposals,
  useRecentProposals,
  useAutonomyDecisions,
  useCoverageGaps,
  useCalderaQueue,
  useKillSwitch,
  useMutationApproval,
  useCoverageSnapshot,
  useThreatProfiles,
  useThreatActors,
  useThreatActorCoverage,
  useDecisionGraph,
  type UseDecisionGraphArgs,
  useArtifactDetails,
  useActivityEventDetails,
  useMutationLineageNodeDetails,
  type UseArtifactDetailsArgs,
  type UseActivityEventDetailsArgs,
  type UseMutationLineageNodeDetailsArgs,
  type ArgusHttp,
  type FetchState,
  type ActivityEvent,
  type ActivityFeedFilters,
  type ActivityLayer,
  type GovernancePulseWindow,
  type UseGovernancePulseArgs,
  type UseMutationsArgs,
  type UseE2dFlowArgs,
  type UseRecentCvesArgs,
  type UseSynthesisProposalsArgs,
  type UseRecentProposalsArgs,
  type UseAutonomyDecisionsArgs,
  type UseCoverageGapsArgs,
  type UseCalderaQueueArgs,
  type UseKillSwitchArgs,
  type UseKillSwitchResult,
  type UseMutationApprovalArgs,
  type UseMutationApprovalResult,
  type UseCoverageSnapshotArgs,
  type E2dFlowWindow,
} from './src/hooks';

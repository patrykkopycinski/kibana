/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ArgusRoutesDeps } from './types';
import { registerReasoningChainRoute } from './routes/reasoning_chain';
import { registerMutationLineageRoute } from './routes/mutation_lineage';
import { registerGovernancePulseRoute } from './routes/governance_pulse';
import { registerActivityFeedRoute } from './routes/activity_feed';
import { registerMutationsRoute } from './routes/mutations';
import { registerMutationDetailRoute } from './routes/mutation_detail';
import { registerE2dFlowRoute } from './routes/e2d_flow';
import { registerE2dRecentCvesRoute } from './routes/e2d_recent_cves';
import { registerSynthesisProposalsRoute } from './routes/synthesis_proposals';
import { registerRecentProposalsRoute } from './routes/recent_proposals';
import { registerAutonomyDecisionsRoute } from './routes/autonomy_decisions';
import { registerCoverageGapsRoute } from './routes/coverage_gaps';
import { registerCalderaQueueRoute } from './routes/caldera_queue';
import { registerKillSwitchRoutes } from './routes/kill_switch';
import { registerMutationVerdictRoute } from './routes/mutation_verdict';
import { registerCoverageRoutes } from './routes/coverage';
import { registerPlaybooksIndexRoute } from './routes/playbooks_index';
import { registerDecisionGraphRoute } from './routes/decision_graph';
import { registerDecisionGraphRecentRootsRoute } from './routes/decision_graph_recent_roots';
import { registerArtifactDetailsRoute } from './routes/artifact_details';

export const registerArgusRoutes = (deps: ArgusRoutesDeps) => {
  registerReasoningChainRoute(deps);
  registerMutationLineageRoute(deps);
  registerGovernancePulseRoute(deps);
  registerActivityFeedRoute(deps);
  registerMutationsRoute(deps);
  registerMutationDetailRoute(deps);
  registerE2dFlowRoute(deps);
  registerE2dRecentCvesRoute(deps);
  registerSynthesisProposalsRoute(deps);
  registerRecentProposalsRoute(deps);
  // Phase C — "complete-story" surfaces.
  registerAutonomyDecisionsRoute(deps);
  registerCoverageGapsRoute(deps);
  registerCalderaQueueRoute(deps);
  registerKillSwitchRoutes(deps);
  registerMutationVerdictRoute(deps);

  // Tier 3 — live Playbooks index. Reads the workflow registry by tag and
  // merges the hardcoded ARGUS skill list so the console tab shows the same
  // set of playbooks operators see in Agent Builder.
  registerPlaybooksIndexRoute(deps);

  // Shared details read used by the Activity feed + Mutation lineage flyouts.
  // Not behind an experimental flag because both panels are always rendered —
  // the route just returns `not_found` when the underlying doc is missing.
  registerArtifactDetailsRoute(deps);

  // Tier 1 — community-corpus coverage. Gated so the routes disappear when
  // the feature flag is off rather than returning empty heatmaps.
  if (deps.experimentalFeatures.argusCoverageEnabled) {
    registerCoverageRoutes(deps);
  }

  // Tier 5 — decision-graph neighborhood read. Gated separately so the
  // Console flyout / full-screen explorer can be dark-launched without also
  // enabling the Tier-1 corpus surface. The recent-roots discovery endpoint
  // sits behind the same flag because its only consumer is the panel that
  // is also gated on `argusDecisionGraphEnabled`.
  if (deps.experimentalFeatures.argusDecisionGraphEnabled) {
    registerDecisionGraphRoute(deps);
    registerDecisionGraphRecentRootsRoute(deps);
  }
};

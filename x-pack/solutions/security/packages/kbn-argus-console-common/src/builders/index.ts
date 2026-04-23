/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { buildReasoningChainFromSpanDocs, type SpanDocInput } from './reasoning_chain_builder';

export {
  buildMutationLineageFromDocs,
  type MutationStageDocs,
  type StageDoc,
} from './mutation_lineage_builder';

export {
  buildGovernancePulse,
  type ActorTrustTiersAggsInput,
  type BuildGovernancePulseArgs,
  type GovernancePulseAggsInput,
  type MutationIntentsAggsInput,
} from './governance_pulse_builder';

export {
  buildActivityFeed,
  hitToEvent,
  allActivityLayers,
  type BuildActivityFeedArgs,
  type RawActivityHit,
} from './activity_feed_builder';

export {
  buildMutations,
  type BuildMutationsArgs,
  type RawMutationIntentDoc,
  type RawOutcomeDoc,
} from './mutations_builder';

export {
  buildMutationDetail,
  type BuildMutationDetailArgs,
  type DetailRawAdvisoryDoc,
  type DetailRawBacktestDoc,
  type DetailRawMutationIntentDoc,
  type DetailRawOutcomeDoc,
} from './mutation_detail_builder';

export {
  buildE2dFlow,
  type BuildE2dFlowArgs,
  type E2dRawAdvisoryDoc,
  type E2dRawBacktestDoc,
  type E2dRawEvalRunDoc,
  type E2dRawMutationIntentDoc,
  type E2dRawOutcomeDoc,
  type E2dRawRecommendationDoc,
} from './e2d_flow_builder';

export {
  buildRecentProposals,
  buildSynthesisProposals,
  dominates,
  findDominator,
  type BuildRecentProposalsInput,
  type BuildSynthesisProposalsInput,
  type SynthesisRawAdvisoryDoc,
  type SynthesisRawBlock,
  type SynthesisRawCandidate,
  type SynthesisRawRecommendationDoc,
} from './synthesis_proposals_builder';

export {
  buildAutonomyDecisions,
  hitToDecision,
  type BuildAutonomyDecisionsArgs,
  type RawAutonomyDecisionDoc,
  type RawAutonomyHit,
} from './autonomy_decisions_builder';

export {
  buildCoverageGaps,
  hitToGap,
  type BuildCoverageGapsArgs,
  type RawCoverageGapDoc,
  type RawCoverageHit,
} from './coverage_gaps_builder';

export {
  buildCalderaQueue,
  type BuildCalderaQueueArgs,
  type RawCalderaCommandDoc,
  type RawCalderaProfileDoc,
  type RawDifficultyStateDoc,
} from './caldera_queue_builder';

export {
  buildKillSwitchState,
  type BuildKillSwitchArgs,
  type RawKillSwitchDoc,
} from './kill_switch_builder';

export {
  buildActorCoverage,
  buildCoverageSnapshot,
  buildNavigatorLayer,
  type RawAuthoredDoc,
  type RawCorpusDoc,
  type TechniqueMeta,
} from './coverage_builder';

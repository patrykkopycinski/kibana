/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const REASONING_CHAIN_ROUTE = '/internal/security_solution/argus/reasoning_chain' as const;
export const MUTATION_LINEAGE_ROUTE = '/internal/security_solution/argus/mutation_lineage' as const;
export const GOVERNANCE_PULSE_ROUTE = '/internal/security_solution/argus/governance_pulse' as const;
export const ACTIVITY_FEED_ROUTE = '/internal/security_solution/argus/activity_feed' as const;
export const MUTATIONS_ROUTE = '/internal/security_solution/argus/mutations' as const;
export const MUTATION_DETAIL_ROUTE = '/internal/security_solution/argus/mutation_detail' as const;
export const E2D_FLOW_ROUTE = '/internal/security_solution/argus/e2d_flow' as const;
export const E2D_RECENT_CVES_ROUTE = '/internal/security_solution/argus/e2d_recent_cves' as const;
export const SYNTHESIS_PROPOSALS_ROUTE =
  '/internal/security_solution/argus/synthesis_proposals' as const;
export const RECENT_PROPOSALS_ROUTE = '/internal/security_solution/argus/recent_proposals' as const;

// Phase C routes — the "complete-story" additions. Three pure reads and two
// writes. Writes are gated server-side by the `securitySolution-argus_write`
// API capability; reads reuse the base `securitySolution` privilege like the
// other internal ARGUS routes.
export const AUTONOMY_DECISIONS_ROUTE =
  '/internal/security_solution/argus/autonomy_decisions' as const;
export const COVERAGE_GAPS_ROUTE = '/internal/security_solution/argus/coverage_gaps' as const;
export const CALDERA_QUEUE_ROUTE = '/internal/security_solution/argus/caldera_queue' as const;
export const KILL_SWITCH_ROUTE = '/internal/security_solution/argus/kill_switch' as const;
export const MUTATION_VERDICT_ROUTE = '/internal/security_solution/argus/mutation_verdict' as const;

// Tier 1 routes — community-corpus coverage surface. All gated on the base
// `securitySolution` privilege and additionally on `argusCoverageEnabled`.
export const COVERAGE_ROUTE = '/internal/security_solution/argus/coverage' as const;
export const THREAT_PROFILES_ROUTE = '/internal/security_solution/argus/threat_profiles' as const;
export const THREAT_PROFILE_DETAIL_ROUTE =
  '/internal/security_solution/argus/threat_profiles/{profile_id}' as const;
export const THREAT_ACTORS_ROUTE = '/internal/security_solution/argus/threat_actors' as const;
export const THREAT_ACTOR_DETAIL_ROUTE =
  '/internal/security_solution/argus/threat_actors/{actor_id}' as const;
export const THREAT_ACTOR_COVERAGE_ROUTE =
  '/internal/security_solution/argus/threat_actors/{actor_id}/coverage' as const;
export const NAVIGATOR_LAYER_ROUTE =
  '/internal/security_solution/argus/coverage/navigator_layer' as const;
// Tier 2 — redundancy summary (counts of active consolidation intents).
export const REDUNDANCY_SUMMARY_ROUTE =
  '/internal/security_solution/argus/coverage/redundancy_summary' as const;

// Tier 5 routes — decision-graph adapter + playbooks discovery index.
export const DECISION_GRAPH_ROUTE = '/internal/security_solution/argus/decision_graph' as const;
/**
 * Recent-roots discovery for the Decision graph panel. Returns the N most
 * recent `(from_kind, from_id)` subjects in `.soc-decision-graph` so the UI
 * can auto-select a populated neighborhood on first render and surface
 * quick-pick chips (advisory:CVE-…, rule:…) above the subject picker.
 */
export const DECISION_GRAPH_RECENT_ROOTS_ROUTE =
  '/internal/security_solution/argus/decision_graph/recent_roots' as const;
export const PLAYBOOKS_INDEX_ROUTE = '/internal/security_solution/argus/playbooks_index' as const;

/**
 * Generic "fetch one document + best-effort related entities" route used by
 * the shared ARGUS details flyout (Activity feed + Mutation lineage).
 * Contract: `GET ?source_index=...&source_doc_id=...&include_related=...`.
 */
export const ARTIFACT_DETAILS_ROUTE = '/internal/security_solution/argus/artifact_details' as const;

/**
 * UI capability keys surfaced on the base `siemV5` Kibana feature. The actual
 * capability check is `capabilities[SECURITY_FEATURE_ID_V5]?.argus_*`; we
 * export the bare key names so the console (which doesn't import the features
 * package) can look them up by string.
 */
export const ARGUS_CONSOLE_READ_UI_CAPABILITY = 'argus_read' as const;
export const ARGUS_CONSOLE_ALL_UI_CAPABILITY = 'argus_all' as const;

/**
 * Server-side API capability used by `requiredPrivileges` on every ARGUS write
 * route. Appears as an `api:` entry on the `privileges.all` privilege group of
 * the base `siemV5` feature — so anyone with `siem.crud` gets it, and anyone
 * with `siem.show` does not.
 */
export const ARGUS_WRITE_API_CAPABILITY = 'securitySolution-argus_write' as const;

export const ARGUS_SOC_INDICES = {
  reasoningTrace: '.soc-reasoning-trace',
  actorTrustTiers: '.soc-actor-trust-tiers',
  mutationIntents: '.soc-mutation-intents',
  recommendations: '.soc-recommendations',
  /** Unified eval verticals — filter by `run_kind` (detection | reasoning | adversarial | shadow_backtest | …). */
  detectionEvalRuns: '.soc-argus-eval-runs',
  backtestResults: '.soc-backtests',
  outcomes: '.soc-outcomes',
  // Live-demo / telemetry source. The activity-feed route reads from this
  // index so UI shows telemetry-layer events (EDR alerts, ingest signals).
  // Intentionally separate from the production `.alerts-security.alerts-*`
  // index so the demo ticker never writes into real alerting storage.
  telemetrySignals: '.soc-telemetry-signals',
  cveAdvisories: '.soc-cve-advisories',
  // Phase C indices — autonomous decisions ledger, coverage-gap feed from
  // the gap-analyzer workflow, Caldera attack queue + profiles + difficulty
  // state, global kill-switch document, and the append-only audit trail
  // we write to on every console-originated mutation.
  autonomyDecisions: '.soc-autonomy-decisions',
  coverageGaps: '.soc-coverage-gaps',
  attackCommands: '.soc-attack-commands',
  attackProfiles: '.soc-attack-profiles',
  difficultyState: '.soc-difficulty-state',
  killSwitch: '.soc-kill-switch',
  auditTrail: '.soc-audit-trail',
  // Tier 1 — community-corpus coverage.
  detectionCorpus: '.soc-detection-corpus',
  threatProfiles: '.soc-threat-profiles',
  threatActors: '.soc-threat-actors',
  // Tier 5 — condensed decision graph over the reasoning trace / lineage /
  // autonomy ledger used by the `argus.decision_graph` read.
  decisionGraph: '.soc-decision-graph',
  // Vision-doc 4.2 — once-per-hour ATT&CK coverage rollup the
  // `soc-argus-coverage-snapshotter` workflow writes. Stores
  // {total_techniques, covered_techniques, coverage_pct} so the Pulse panel
  // can compute a trend (current vs window-baseline) without re-aggregating
  // .soc-coverage-gaps + .soc-detection-corpus on every page-load.
  coverageSnapshots: '.soc-coverage-snapshots',
} as const;

/**
 * The singleton document id for the kill-switch index. The autonomous-applier
 * workflow reads `/.soc-kill-switch/_doc/global` as a gate on every apply, so
 * writing to any other id would have no effect.
 */
export const KILL_SWITCH_DOC_ID = 'global' as const;

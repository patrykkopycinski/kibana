## Why

Argus today synthesizes Elastic detection rules from advisories, evaluates them, governs them, and applies them — but it operates in isolation. It doesn't know what the community (Sigma, Splunk ESCU, Sublime, KQL, CrowdStrike CQL) already covers, it has no aggregate view of ATT&CK coverage, it can't answer "what am I missing for ransomware / APT29", and its analyst-facing surfaces are all read-only dashboards. Compared to community efforts like Security-Detections-MCP (8,200+ unified rules, ATT&CK STIX knowledge, threat-profile gap analysis, pattern learning, 11 pre-built analyst workflows), Argus has the deeper system (governance, eval gates, drift, reasoning traces) but none of the breadth-of-knowledge surface.

This change lands that breadth **inside Kibana** using the platform's own primitives — no custom engines, no custom routes where workflows or skills fit. Concretely:

1. **Unified corpus of community detections** (Tier 1) becomes a first-class `.soc-*` index so every coverage question can be answered against real data.
2. **ATT&CK coverage + threat profiles + actor knowledge** (Tier 1) turns that corpus into a set of panels that answer "where are we weak, for whom, for what profile".
3. **Pattern learning + procedure clustering + redundancy detection** (Tier 2) feeds that knowledge back into Argus's Pareto synthesis so proposed rules are grounded in the community's prior art, not generated from scratch.
4. **Analyst playbooks** (Tier 3) ship as Agent Builder skills + Workflow YAMLs tagged `argus:playbook` — not a bespoke playbook engine. Every playbook is both a deterministic workflow (observable in the Workflows UI) and an LLM-callable skill (discoverable via agent-builder), with file-mutation-intent writes routed through the existing governance gate.
5. **Quality-of-life** (Tier 4): shared autocomplete combo-boxes so every technique/CVE/process-name input across the Console is grounded in real data, a per-rule detection-quality score surfaced as a sortable column, and a scheduled CTI auto-intake so new KEV / OTX / vendor advisories turn into governance-gated draft rules without human kick-off.
6. **Knowledge graph over Argus decisions** (Tier 5): a `.soc-decision-graph` index materializes edges across advisories, intents, outcomes, actors, and reasoning traces so "why did Argus do X" becomes a graph query rather than a cross-index join. Read contracts stay in the existing `@kbn/argus-console-common` package — the broader read-API adapter refactor is out of scope for this change and will be a follow-up.

The goal is a **stack-native system** from ingest to graph. Tier 5 adds the graph surface that operators can reason over; a separate follow-up change will consolidate Argus's read contracts into a dedicated `@kbn/argus-read-api` adapter once the decision graph has bedded in.

## What Changes

### Data plane

- New index `.soc-detection-corpus` (community rules, normalized across 6 formats) populated by a new CLI-backed ingest package `@kbn/argus-corpus-ingest`.
- New index `.soc-threat-actors` populated from `enterprise-attack.json` STIX.
- New index `.soc-threat-profiles` (ransomware / APT29 / Lazarus / Midnight Blizzard / persistence / credential-access), seeded built-in and user-extensible.
- New index `.soc-detection-patterns` (auto-mined canonical query shapes per technique with source counts and precision hints).
- New field groups on existing `.soc-recommendations`: `argus.procedure_clusters[]`, `argus.quality_score`, `argus.coverage_delta` (populated at synthesis time).
- New `argus.origin` values: `gap_analysis`, `consolidation`, `cti_ingest` — reuse the existing mutation-intent write path and governance gate.

### Argus Console (`@kbn/argus-console`)

- New **Coverage** panel: tactic × technique heatmap, colored by `argus_authored − community_authored`, with preset threat-profile filters and a one-click Navigator layer export.
- New **Actors** section: list of STIX actors with per-actor coverage split (Argus / community / uncovered), opening a flyout that reuses the existing mutation-detail flyout layout.
- New **Playbooks** tab: two widgets — workflow-runs list (filtered by tag `argus:playbook`) and skill launcher (agent-builder skills tagged `argus:playbook`). No new route, no new runner UI.
- Extensions to the existing **Mutation Detail** flyout: a Coverage-Delta section and a Procedure-Clusters chip row.

### Quality-of-life (Tier 4)

- New shared combo-box components under `@kbn/argus-console` (`<TechniqueCombo />`, `<CveCombo />`, `<ProcessNameCombo />`, `<ActorCombo />`, `<DataSourceCombo />`) backed by a new route `GET /internal/security_solution/argus/autocomplete?kind=<k>&q=<q>`. Reused across the Coverage panel filters, Playbooks tab skill-launcher flyout, existing Mutations panel filters, and agent-builder tool-call parameter prompts.
- New `argus.quality_score` field on `.soc-recommendations` (range `0..1`) computed at synthesis and on post-apply observation. A new `Quality` sortable column on the Mutations panel, and a matching chip in the Mutation Detail flyout that breaks the score down into its contributing signals (backtest precision, FP rate, drift stability, corpus-pattern alignment, governance verdict streak).
- New scheduled workflow `soc-argus-cti-auto-intake.yaml` (nightly by default, plus hourly KEV fast-path) that chains existing KEV + OTX / vendor advisory ingest into `soc-argus-exploit-to-detection`, producing draft mutation intents with `argus.origin: 'cti_ingest'`. Auto-intake runs are observable in the existing Workflows UI and emit a per-run summary event to `.soc-audit-trail`.

### Knowledge graph (Tier 5)

- New index `.soc-decision-graph` materialized by a scheduled workflow `soc-argus-decision-graph-builder.yaml` that walks `.soc-cve-advisories`, `.soc-recommendations`, `.soc-mutation-intents`, `.soc-outcomes`, `.soc-reasoning-trace`, `.soc-threat-actors`, and `.soc-audit-trail` to produce edge documents `{ edge_id, from_kind, from_id, to_kind, to_id, relation, evidence_ts, strength }`. Read via a new route `GET /internal/security_solution/argus/decision_graph?root_kind=&root_id=&depth=` surfacing the neighborhood around a subject (alert / intent / rule / actor). The Reasoning Drill-down panel gains a "Show decision graph" button that opens a flyout rendering the neighborhood DAG using the existing `LineageGraph` primitive. Request/response types live in `@kbn/argus-console-common` alongside the other Argus read contracts; a dedicated `@kbn/argus-read-api` adapter package is deferred to a follow-up change.
- New **Decision Graph** Console panel (`?panel=decision_graph`) provides a full-screen explorer over the same `.soc-decision-graph` data. Reuses the `LineageGraph` primitive at canvas scale with client-side filtering (by node kind, relation, time window, actor, trust tier), a "path between two nodes" pathfinding mode (BFS over the currently-loaded neighborhood), and export actions for JSON (raw neighborhood payload) and SVG (rendered graph snapshot). The existing flyout remains the drill-down entrypoint; the explorer is for cross-neighborhood exploration and report capture.

### Agent-native primitives (Tier 3)

- 6 new Agent Builder **tools** under `x-pack/solutions/security/plugins/security_solution/server/agent_builder/tools/argus_*_tool.ts`: `argus_list_uncovered_techniques_tool`, `argus_export_navigator_layer_tool`, `argus_get_coverage_summary_tool`, `argus_file_mutation_intent_tool`, `argus_get_mutation_detail_tool`, `argus_list_actor_coverage_tool`.
- 4 new **workflows** under `soc-simulation/workflows/`: `soc-argus-playbook-ransomware.yaml`, `soc-argus-playbook-apt-emulation.yaml`, `soc-argus-playbook-datasource-gap.yaml`, `soc-argus-playbook-cti-ingest.yaml` (chains existing `soc-kev-ingest` + `soc-argus-exploit-to-detection`). All tagged `argus`, `argus:playbook`.
- Retro-tag existing `soc-argus-exploit-to-detection.yaml`, `soc-kev-ingest.yaml`, `soc-argus-drift-monitor.yaml` with `argus:playbook` so they surface in the Console tab for free.
- 6 new **skills** registered in `x-pack/solutions/security/plugins/security_solution/server/agent_builder/skills/register_skills.ts`: `argus_assess_readiness`, `argus_emulate_actor`, `argus_run_purple_team`, `argus_assess_cve`, `argus_find_datasource_gaps`, `argus_review_rule_quality`. Each skill chains the atomic tools above and invokes the relevant workflow via `run_workflow`.

### Synthesis upgrade

- `@kbn/argus-exploit-to-detection` seeds Pareto synthesis from `.soc-detection-patterns` candidates when a matching technique pattern exists, so proposed rules carry `argus.procedure_clusters[]` and `argus.pattern_id` provenance.
- Cross-source redundancy detection produces mutation intents with `argus.origin: 'consolidation'` proposing retirement of semantic duplicates (governance-gated, Pareto-alternative-backed).

## Capabilities

### New Capabilities

- `argus-detection-corpus`: ingest + schema + CLI for a unified cross-source community detection corpus at `.soc-detection-corpus`.
- `argus-coverage-panel`: Argus Console panel rendering tactic × technique coverage with Navigator layer export, reading from `.soc-detection-corpus` + `.soc-recommendations`.
- `argus-threat-profiles`: `.soc-threat-profiles` index + preset filters + gap-analysis workflow trigger that files `mutation_intent`s for uncovered techniques.
- `argus-threat-actors`: STIX-enriched `.soc-threat-actors` index + Console actor list + per-actor coverage flyout.
- `argus-procedure-patterns`: `argus.procedure_clusters[]` field on recommendations, `.soc-detection-patterns` index, and pattern-seeded Pareto synthesis.
- `argus-redundancy-detector`: cross-source duplicate scoring surfaced in the Coverage panel and materialized as `argus.origin: 'consolidation'` mutation intents.
- `argus-playbook-primitives`: 6 Agent Builder tools, 4 new workflow YAMLs, 6 registered skills — no custom playbook runner. Every playbook is a tagged workflow + LLM-callable skill.
- `argus-playbooks-console-tab`: Playbooks tab in the Argus Console embedding workflow-runs + skill-launcher widgets, filtering by tag `argus:playbook`.
- `argus-autocomplete`: shared `GET /internal/security_solution/argus/autocomplete` route + `<TechniqueCombo />`, `<CveCombo />`, `<ProcessNameCombo />`, `<ActorCombo />`, `<DataSourceCombo />` components used across Console filters, skill flyouts, and agent-builder parameter prompts.
- `argus-quality-score`: per-rule quality score computed at synthesis + post-apply, surfaced as a sortable Mutations-panel column and a breakdown chip in the Mutation Detail flyout.
- `argus-cti-auto-intake`: scheduled `soc-argus-cti-auto-intake.yaml` workflow turning KEV + OTX / vendor advisories into governance-gated draft rules without human kick-off. Per-run audit summary written to `.soc-audit-trail`.
- `argus-decision-graph`: `.soc-decision-graph` edge index + scheduled builder workflow + `GET /decision_graph` read route + Console "Show decision graph" flyout + full-screen Decision Graph explorer panel (filtering, pathfinding, JSON/SVG export).

### Modified Capabilities

- `argus-console-route`: extended with a new `Coverage` panel + `Playbooks` tab + `Decision Graph` explorer panel. URL deep-link params gain `?panel=coverage|playbooks|decision_graph`; the explorer accepts `?root_kind=&root_id=&depth=&filter_kinds=&path_from=&path_to=` so a rendered view is fully reconstructable from a link. The Mutations panel gains a `Quality` sortable column (Tier 4). The Reasoning Drill-down gains a "Show decision graph" affordance that opens the flyout; an "Open in explorer" secondary action hands off to the full-screen panel with the same neighborhood pre-loaded (Tier 5). The Coverage panel's profile-filter, actor-picker, and technique-filter are powered by the new autocomplete combo-boxes (Tier 4).
- `argus-explain-decision-skill`: gains an optional `include_community_context: boolean` arg that, when true, enriches the reasoning chain with community-corpus references; AND an optional `include_decision_graph: boolean` that embeds a summarised N-hop neighborhood from `.soc-decision-graph` (Tier 5).
- `argus-console-common`: gains Tier-5 decision-graph request/response types (`DecisionGraphRequest`, `DecisionGraphResponse`, `DecisionGraphNode`, `DecisionGraphEdge`) alongside the existing Argus read contracts.
- `argus-console-mutation-lineage-panel`: the existing lineage DAG layout primitive (`LineageGraph`) is reused by the new decision-graph flyout with no behaviour change to existing surfaces (Tier 5).

## Impact

- **New packages**:
  - `x-pack/solutions/security/packages/kbn-argus-corpus-ingest` (`shared-common`) — per-format parsers (Sigma YAML, Splunk ESCU YAML, Elastic rules, Sublime MQL, KQL markdown, CrowdStrike CQL), normalizer, CLI.
  - `x-pack/solutions/security/packages/kbn-argus-coverage` (`shared-common`) — builders + types for coverage, threat profiles, actors, patterns, redundancy. Consumed by both `@kbn/argus-console` and server routes.
  - `x-pack/solutions/security/packages/kbn-argus-decision-graph` (`shared-common`, Tier 5) — builder functions that turn raw `.soc-*` docs into edge documents, plus neighborhood-query helpers. Used by the scheduled workflow's step + the read route.
- **`@kbn/argus-console-common`**: new types `ArgusCoverageSnapshot`, `ArgusThreatProfile`, `ArgusActorCoverage`, `ArgusProcedureCluster`, `ArgusPattern`, `ArgusRedundancyGroup`, `ArgusCoverageDelta`, and (Tier 5) `DecisionGraphRequest` / `DecisionGraphResponse` / `DecisionGraphNode` / `DecisionGraphEdge`. New route constants under `src/constants.ts` for the coverage / actors / threat-profile / decision-graph routes.
- **`@kbn/argus-console`**: new `CoveragePanel`, `ThreatProfilePicker`, `ActorListPanel`, `ActorCoverageFlyout`, `PlaybooksTab`, `WorkflowRunsWidget`, `SkillLauncherWidget`, `DecisionGraphPanel` (full-screen explorer) + supporting `DecisionGraphFilters`, `DecisionGraphPathfinder`, `DecisionGraphExportMenu` sub-components. Extension to `MutationDetailFlyout` for Coverage-Delta + Procedure-Clusters sections.
- **`x-pack/solutions/security/plugins/security_solution`**:
  - `server/lib/argus/routes/` — new routes: `coverage.ts`, `threat_profiles.ts`, `threat_actors.ts`, `detection_patterns.ts`, `playbooks_index.ts`, `autocomplete.ts` (Tier 4), `decision_graph.ts` (Tier 5). All gated on `capabilities.siem.argus_read`.
  - `server/agent_builder/tools/argus_*_tool.ts` — 6 new Tier-3 tools + 2 additional Tier-4/5 tools: `argus_autocomplete_tool`, `argus_get_decision_graph_tool`.
  - `server/agent_builder/skills/` — 6 new skill directories (one per playbook) + registration in `register_skills.ts`. Each skill exports a zod schema + a prompt template + a handler that chains tools and invokes a workflow via the workflow-runner internal API.
- **New workflows**: `soc-argus-playbook-ransomware.yaml`, `soc-argus-playbook-apt-emulation.yaml`, `soc-argus-playbook-datasource-gap.yaml`, `soc-argus-playbook-cti-ingest.yaml` (Tier 3), `soc-argus-redundancy-scanner.yaml` (Tier 2, nightly), `soc-argus-cti-auto-intake.yaml` (Tier 4, scheduled), `soc-argus-decision-graph-builder.yaml` (Tier 5, scheduled) under `soc-simulation/workflows/`. All declare `metadata.tags: [argus, argus:playbook]` where user-triggerable, or `[argus, argus:scheduled]` where background-only. Existing `soc-argus-exploit-to-detection.yaml`, `soc-kev-ingest.yaml`, `soc-argus-drift-monitor.yaml` get `argus:playbook` appended.
- **New CLIs under `scripts/`** (wrapped via `@kbn/setup-node-env` pattern, same as existing `run_exploit_to_detection.js`):
  - `scripts/argus_ingest_corpus.js` → invokes `@kbn/argus-corpus-ingest` CLI across configured repos, writes `.soc-detection-corpus`.
  - `scripts/argus_ingest_stix.js` → parses `enterprise-attack.json`, writes `.soc-threat-actors`.
  - `scripts/argus_mine_patterns.js` → reads `.soc-detection-corpus`, writes `.soc-detection-patterns`.
  - `scripts/argus_seed_threat_profiles.js` → writes built-in profiles to `.soc-threat-profiles`.
- **Seed data**: new demo script `scripts/argus_seed_coverage_demo.js` that populates a representative subset of the corpus + actors + profiles so the Console panel lights up without a 10-minute ingest.
- **Index templates + ILM** registered via the existing `@kbn/soc-simulation-indices` pattern (or equivalent — follow the pattern used for `.soc-recommendations`).
- **Feature-flagged**: all new Console surfaces gated on existing `argusConsoleEnabled`. Within that, a secondary flag `argusCoverageEnabled` gates Tier 1 + Tier 2 specifically so we can ship playbooks (Tier 3) independently. Tier 4 (autocomplete + quality score + CTI auto-intake) gates on `argusConsoleEnabled` for UI surfaces and is independent of `argusCoverageEnabled`; the CTI auto-intake schedule gates on a new flag `argusCtiAutoIntakeEnabled` so the nightly workflow can be disabled per-install. Tier 5 (decision graph) ships an additive package + index + read route; the decision-graph surface gates on `argusDecisionGraphEnabled`.
- **Backwards compatibility**: zero breaking changes. All new indices, all new packages, all new routes, all new workflows. The existing Argus Console route, Mutations Panel, and E2D flow are unchanged until `argusCoverageEnabled` is on (at which point the Mutation Detail flyout gains two new sections — purely additive).
- **No runtime Python**. TypeScript + Workflow YAML + Kibana skills only.
- **No schema changes to existing indices** except additive `argus.procedure_clusters[]`, `argus.quality_score`, `argus.quality_score_breakdown`, `argus.coverage_delta`, `argus.pattern_id` fields on `.soc-recommendations` — all optional, populated lazily.

## Scope cuts (deferred to a follow-up change)

- **`@kbn/argus-read-api` adapter package + MCP/A2A switchover**: consolidating every Argus read contract into a dedicated `shared-common` package and refactoring `@kbn/argus-mcp-server` / `@kbn/argus-a2a-server` onto it is a separate change. Tier 5 in this PR keeps decision-graph contracts in `@kbn/argus-console-common` alongside the other Argus read types and leaves the existing MCP / A2A inline contracts untouched. The adapter follow-up is mechanical once the decision graph has bedded in.
- **MCP transport wrapping of the new read routes**: adding brand-new MCP tools for every newly-exposed read (coverage, threat actors, decision graph, autocomplete) is a separate follow-up gated on the adapter change above.
- **Executive briefing Lens dashboard** (listed in the prior plan as Tier 3 #9). The underlying data (quality score, coverage delta, CTI auto-intake summaries) all exist after this change; building the dashboard is a separate, low-risk Lens-only PR.
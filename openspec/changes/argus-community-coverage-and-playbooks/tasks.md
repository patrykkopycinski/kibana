# Tasks

Phases are shippable in order. Each phase stands alone behind its feature flag.

## Phase A — Tier 3: Playbook primitives + Console tab

### A1. Agent Builder tools (`x-pack/solutions/security/plugins/security_solution/server/agent_builder/tools/`)

- [x] A1.1 Create `argus_list_uncovered_techniques_tool.ts` — zod-typed `{ profile_id?, tactic?, top_n? }` → `{ techniques: Array<{ technique_id, name, argus_authored: boolean, community_authored: boolean, source_count }> }`. Reads `.soc-recommendations` + `.soc-detection-corpus`.
- [x] A1.2 Create `argus_export_navigator_layer_tool.ts` — `{ profile_id? | technique_ids?, name }` → `{ layer_json: string, technique_count }`. Produces ATT&CK Navigator v4.5 layer JSON.
- [x] A1.3 Create `argus_get_coverage_summary_tool.ts` — `{ profile_id? }` → `{ total, argus_only, community_only, both, gaps }` aggregated over `.soc-detection-corpus` + `.soc-recommendations`. (Implemented as `argus_summarize_coverage_tool.ts`.)
- [x] A1.4 Create `argus_file_mutation_intent_tool.ts` — `{ advisory_id?, technique_id?, origin: 'gap_analysis' | 'consolidation' | 'cti_ingest' | 'manual', rationale }` → `{ mutation_intent_id }`. Writes through `@kbn/argus-exploit-to-detection`'s existing intent builder — never direct ES index.
- [x] A1.5 Create `argus_get_mutation_detail_tool.ts` — thin LLM-callable wrapper around the existing `buildMutationDetail` builder + route.
- [x] A1.6 Create `argus_list_actor_coverage_tool.ts` — `{ actor_id }` → `{ techniques: Array<{ technique_id, argus_authored, community_authored, redundant_rule_count }> }`. (Reads `.soc-threat-actors` when present in Phase B; until then returns an empty-shape response with `source: 'unavailable'`.)
- [x] A1.7 Register all six in `server/agent_builder/tools/register_tools.ts` alongside existing Argus tools.
- [ ] A1.8 Unit tests per tool in `*/__tests__/` covering: happy path, missing-index graceful degrade, privilege rejection.

### A2. Workflow YAMLs (`soc-simulation/workflows/`)

- [ ] A2.1 Create `soc-argus-playbook-ransomware.yaml` — steps: `argus_get_coverage_summary` (profile=ransomware) → `argus_list_uncovered_techniques` → fan-out `argus_file_mutation_intent` with `origin: gap_analysis` per technique → emit `argus_export_navigator_layer`.
- [ ] A2.2 Create `soc-argus-playbook-apt-emulation.yaml` — inputs `{ actor_id }`; same shape but profile scoped to the actor's techniques. Also triggers `soc-argus-exploit-to-detection` where no intent exists.
- [x] A2.3 Create `soc-argus-playbook-datasource-gap.yaml` — inputs `{ data_source }`; reads `.soc-detection-corpus` for rules requiring that data source, produces gap summary + intents for missing coverage.
- [ ] A2.4 Create `soc-argus-playbook-cti-ingest.yaml` — chains existing `soc-kev-ingest` → `soc-argus-exploit-to-detection` with `origin: cti_ingest`. Intent-only, governance decides apply.
- [ ] A2.5 Add `metadata.tags: [argus, argus:playbook]` to 2.1–2.4.
- [x] A2.6 Retro-tag `soc-argus-exploit-to-detection.yaml`, `soc-kev-ingest.yaml`, `soc-argus-drift-monitor.yaml` with `argus:playbook` (keep existing tags).
- [ ] A2.7 Smoke-run each new workflow via `scripts/workflows_run.js` (or the existing local invocation pattern) against the demo cluster; capture run_id + verify `.soc-mutation-intents` writes with expected `argus.origin`.

### A3. Agent Builder skills (`x-pack/solutions/security/plugins/security_solution/server/agent_builder/skills/`)

- [ ] A3.1 Create `argus_assess_readiness/` (skill.ts + prompt.md + schema.ts + tests). Extracts `{ profile_id }`, calls `run_workflow` for `soc-argus-playbook-ransomware` or equivalent, summarizes.
- [ ] A3.2 Create `argus_emulate_actor/` — extracts `{ actor_id }`, invokes `soc-argus-playbook-apt-emulation`.
- [ ] A3.3 Create `argus_run_purple_team/` — extracts `{ actor_id, emulation_profile }`, invokes `soc-argus-playbook-apt-emulation` then polls `.soc-backtest-results` for the produced intents.
- [ ] A3.4 Create `argus_assess_cve/` — extracts `{ cve_id }`, invokes `soc-kev-ingest` followed by `soc-argus-exploit-to-detection` via the cti-ingest chain; summarizes synthesis output and governance decisions.
- [ ] A3.5 Create `argus_find_datasource_gaps/` — extracts `{ data_source }`, invokes `soc-argus-playbook-datasource-gap`.
- [ ] A3.6 Create `argus_review_rule_quality/` — reads `.soc-recommendations` + `.soc-backtest-results` for a given `rule_id`, returns quality narrative. Pure-read skill (no workflow invocation).
- [ ] A3.7 Tag each skill with `argus:playbook` in its `metadata.tags`.
- [ ] A3.8 Register all six in `server/agent_builder/skills/register_skills.ts`.
- [ ] A3.9 Unit tests per skill: arg-extraction, workflow-invocation call shape, result-summarization output contract.

### A4. Console Playbooks tab (`@kbn/argus-console`)

- [ ] A4.1 Add `Playbooks` tab to `argus_console/argus_console.tsx` tab navigation.
- [ ] A4.2 Create `src/panels/playbooks_panel/playbooks_panel.tsx` with two sections: `WorkflowRunsWidget` and `SkillLauncherWidget`.
- [ ] A4.3 `WorkflowRunsWidget` — embeds the existing workflow-management embeddable (via `embeddable` plugin) filtered to `tag:argus:playbook`. Shows recent runs + a "Run" action that opens the Workflows UI pre-filled.
- [ ] A4.4 `SkillLauncherWidget` — reads registered skills via the agent-builder internal client, filters to `metadata.tags includes argus:playbook`, renders a card grid; clicking a card opens the agent-builder chat with the skill pre-selected (or falls back to a skill-invocation flyout if agent-builder UI deep-link isn't available).
- [ ] A4.5 URL deep-link: `/app/security/argus?panel=playbooks` opens the tab directly.
- [ ] A4.6 Unit tests: filter-by-tag correctness, empty-state when no playbooks tagged.

## Phase B — Tier 1: Corpus + Coverage + Threat Profiles + Threat Actors

### B1. `@kbn/argus-corpus-ingest` package

- [ ] B1.1 Scaffold `x-pack/solutions/security/packages/kbn-argus-corpus-ingest/` (`shared-common`, owner `@elastic/security-detection-engine`, group `security`, visibility `private`).
- [ ] B1.2 Per-format parsers in `src/parsers/{sigma,splunk_escu,elastic,sublime,kql_md,crowdstrike_cql}.ts`. Each exports `parse(contents: string, sourceMeta): CorpusRule[]`.
- [ ] B1.3 `src/normalize.ts` — `CorpusRule` unified shape: `{ rule_id, source, title, mitre_technique[], data_sources[], raw_query, authored_at, last_modified, language, provenance_url }`.
- [ ] B1.4 `src/cli/ingest.ts` — reads a `sources.yaml` (git URLs + format tags), clones/updates sibling repos into a working dir, invokes parsers, bulk-indexes to `.soc-detection-corpus`.
- [ ] B1.5 Index-template registration following the `.soc-recommendations` pattern.
- [ ] B1.6 Parser unit tests with fixtures per format; malformed-input → `.soc-dead-letter` doc.
- [ ] B1.7 `scripts/argus_ingest_corpus.js` wrapper following the `@kbn/setup-node-env` pattern.

### B2. `.soc-threat-actors` ingest

- [ ] B2.1 `scripts/argus_ingest_stix.js` — reads `ATTACK_STIX_PATH` / `enterprise-attack.json`, extracts `intrusion-set` + `malware` + `tool` → normalizes into `{ actor_id, actor_name, aliases[], techniques[], software[], first_seen, last_seen, references[] }`.
- [ ] B2.2 Index template + ILM.
- [ ] B2.3 Integration test: given a sample STIX bundle, the ingest produces the expected actor set + technique-link fan-out.

### B3. `.soc-threat-profiles` seeding

- [ ] B3.1 `scripts/argus_seed_threat_profiles.js` writes six built-in profiles (ransomware, APT29, Lazarus, Midnight Blizzard, persistence, credential-access). Each profile: `{ profile_id, name, description, technique_ids[], actor_ids[] }`.
- [ ] B3.2 Index template with `id`-as-doc-id idempotency.
- [ ] B3.3 Document the user-extension path in `@kbn/argus-corpus-ingest/README.md` (drop a YAML, re-run the seeder).

### B4. `@kbn/argus-coverage` package

- [ ] B4.1 Scaffold `x-pack/solutions/security/packages/kbn-argus-coverage/` (`shared-common`).
- [ ] B4.2 Types in `src/types/{coverage.ts,threat_profile.ts,actor_coverage.ts,coverage_delta.ts}`.
- [ ] B4.3 Builders: `build_coverage_snapshot.ts`, `build_actor_coverage.ts`, `build_coverage_delta.ts`. Pure functions, fed raw ES docs.
- [ ] B4.4 Navigator layer exporter `src/exporters/navigator_layer.ts`.
- [ ] B4.5 Unit tests + fixtures.

### B5. Backend routes (`security_solution/server/lib/argus/routes/`)

- [ ] B5.1 `coverage.ts` — `GET /internal/security_solution/argus/coverage?profile_id=…`. Gated on `capabilities.siem.argus_read`.
- [ ] B5.2 `threat_profiles.ts` — `GET /internal/security_solution/argus/threat_profiles` + `GET /.../threat_profiles/{profile_id}`.
- [ ] B5.3 `threat_actors.ts` — `GET /.../threat_actors` + `GET /.../threat_actors/{actor_id}` + `GET /.../threat_actors/{actor_id}/coverage`.
- [ ] B5.4 `navigator_layer.ts` — `GET /.../coverage/navigator_layer?profile_id=…|actor_id=…&name=…` returns `application/json`.
- [ ] B5.5 Register in `register_argus_routes.ts`.
- [ ] B5.6 Route tests covering privilege enforcement + schema validation + happy path.

### B6. Console Coverage panel + Actor surface

- [ ] B6.1 `src/panels/coverage_panel/coverage_panel.tsx` — tactic × technique heatmap; cell color = `argus_authored − community_authored`.
- [ ] B6.2 `ThreatProfilePicker` component; selecting a profile narrows the heatmap.
- [ ] B6.3 "Export Navigator layer" button → calls the route, triggers a file download.
- [ ] B6.4 "Run gap analysis" button → POST invocation of `soc-argus-playbook-ransomware` (or matching profile playbook) via workflows internal API; toast with the run URL; panel polls `.soc-mutation-intents` for `argus.origin: 'gap_analysis'` docs produced in the last 5 min.
- [ ] B6.5 `src/panels/actors_panel/actors_panel.tsx` — actor list with coverage split column.
- [ ] B6.6 `ActorCoverageFlyout` composed on top of the new generic `ArgusDetailFlyout` skeleton (Decision 10).
- [ ] B6.7 Extract `ArgusDetailFlyout` skeleton; refactor `MutationDetailFlyout` on top of it — no behaviour change.
- [ ] B6.8 Feature flag: all new surfaces gate on `argusCoverageEnabled`.
- [ ] B6.9 Deep-link: `?panel=coverage` + `?actor_id=…` opens the coverage panel with an actor pre-selected.

### B7. Demo seeder

- [ ] B7.1 `scripts/argus_seed_coverage_demo.js` — writes a representative 50-rule subset of corpus across 5 sources, 3 actors (APT29, Lazarus, FIN7), all six built-in profiles. Idempotent.
- [ ] B7.2 Wire into `soc-simulation/setup/` alongside existing demo seeders so `yarn soc:setup` includes it.

## Phase C — Tier 2: Procedure patterns + Redundancy detector + Pattern-seeded Pareto

### C1. `.soc-detection-patterns`

- [ ] C1.1 Index template + fields: `{ pattern_id, technique_id, canonical_shape, source_counts, precision_hint, redundancy_groups[] }`.
- [ ] C1.2 `scripts/argus_mine_patterns.js` — reads `.soc-detection-corpus`, clusters by technique + query shape (tokenized), writes `.soc-detection-patterns`.
- [ ] C1.3 Pattern miner unit tests over fixture corpus.

### C2. Pattern-seeded Pareto synthesis

- [ ] C2.1 In `@kbn/argus-exploit-to-detection/src/synth/`, add a pre-step: when a technique has a matching pattern, seed Pareto with `{ shape: pattern.canonical_shape, weight_hint: pattern.precision_hint }`.
- [ ] C2.2 Attach `argus.pattern_id` + `argus.procedure_clusters[]` to the resulting intent. The M2.5 reasoning-trace record keeps a reference.
- [ ] C2.3 Unit tests: pattern present → intent carries `pattern_id`; pattern absent → intent unchanged.

### C3. Mutation Detail flyout extensions

- [ ] C3.1 Add `CoverageDeltaSection` — pulls `argus.coverage_delta` from the intent; renders techniques newly covered / newly redundant.
- [ ] C3.2 Add `ProcedureClustersSection` — chip row over `argus.procedure_clusters[]`; each chip links to `.soc-detection-patterns/{pattern_id}` in Discover.
- [ ] C3.3 Both sections feature-flagged behind `argusCoverageEnabled`; render nothing when flag is off.
- [ ] C3.4 Snapshot + render tests.

### C4. Redundancy detector

- [ ] C4.1 New workflow `soc-argus-redundancy-scanner.yaml` (scheduled nightly). Steps: read corpus + authored → compute cross-source similarity per technique → fan-out `argus_file_mutation_intent` with `origin: consolidation`.
- [ ] C4.2 Tag the workflow `argus`, `argus:playbook`.
- [ ] C4.3 Extend `build_coverage_snapshot.ts` to surface `redundancy_groups[]` from `.soc-detection-patterns`.
- [ ] C4.4 Coverage panel shows a "Redundancy" row per tactic with a count chip; clicking opens a table of the consolidation intents.

### C5. Pattern discovery in the Coverage panel

- [ ] C5.1 Add a "Patterns" side drawer listing the top-N patterns per selected tactic or technique, with `source_counts` and a "Seed synthesis with this pattern" action that files an origin=`pattern_seed` mutation intent.
- [ ] C5.2 Unit + e2e-lite tests.

## Phase D — Tier 4: Autocomplete + Quality score + CTI auto-intake

### D1. Shared autocomplete route + combo-box components

- [ ] D1.1 Create `server/lib/argus/routes/autocomplete.ts` — `GET /internal/security_solution/argus/autocomplete?kind=<technique|cve|process|actor|data_source>&q=<q>&limit=<n>`. Dispatch on `kind` to: ATT&CK techniques (from `.soc-threat-actors` / static list), `.soc-cve-advisories` (CVE), `.alerts-security.alerts-*` + `logs-endpoint.events.process-*` (process.name), `.soc-threat-actors` (actor), static data-source enum (data_source). Uniform response `{ results: Array<{ id, label, context?: Record<string, unknown> }> }`. Capped `limit ≤ 25`, min `q.length >= 2` (actor/data_source may accept `q.length >= 0`).
- [ ] D1.2 Route tests: dispatch matrix, empty-query short-circuit, privilege enforcement.
- [ ] D1.3 Register route in `register_argus_routes.ts`.
- [ ] D1.4 In `@kbn/argus-console-common`, add `src/types/autocomplete.ts` — `AutocompleteKind`, `AutocompleteResult`, `AutocompleteResponse`.
- [ ] D1.5 In `@kbn/argus-console`, add `src/components/combo_boxes/{technique,cve,process,actor,data_source}_combo.tsx`. Each wraps `EuiComboBox` with async loader backed by the autocomplete route, `minSearchLength: 2` (where applicable), 200ms debounce, and renders kind-specific `context` (e.g. actor aliases, CVE CVSS score). Ship a shared `useAutocomplete(kind, query)` hook.
- [ ] D1.6 Replace inline/freeform inputs in the Mutations panel filters, the Coverage panel profile/actor/technique pickers, and the Skill launcher parameter form with the new combos.
- [ ] D1.7 Register `argus_autocomplete_tool` in agent-builder tools — thin wrapper over the route so LLM skill handlers can resolve fuzzy user input to canonical IDs.
- [ ] D1.8 Unit tests for each combo + the shared hook.

### D2. Quality score field + column + breakdown

- [ ] D2.1 Add `argus.quality_score: number` and `argus.quality_score_breakdown: { backtest_precision, fp_rate, drift_stability, corpus_pattern_alignment, governance_streak }` to the `.soc-recommendations` index mapping.
- [ ] D2.2 In `@kbn/argus-exploit-to-detection/src/quality/`, add `compute_quality_score.ts` — pure function over `{ backtest: RawBacktestResult, post_apply_obs?: PostApplyObs[], corpus_alignment?: number, governance_verdicts: VerdictSummary }` → `{ score, breakdown }`. Deterministic weights, snapshot-tested.
- [ ] D2.3 Invoke the computer at synthesis time (after backtest gate) and persist on the recommendation doc.
- [ ] D2.4 Add `scripts/argus_recompute_quality_scores.js` (one-shot + post-apply observer): reads recent `.soc-post-apply-observations`, recomputes per `rule_id`, writes back. Also writes the observation-point record into new `.soc-quality-score-history` index (index template shipped alongside).
- [ ] D2.5 Extend the Mutations panel backend route (`server/lib/argus/routes/mutations.ts`) to include `argus.quality_score` in `_source` + sort-by support.
- [ ] D2.6 In `@kbn/argus-console/src/panels/mutations_panel/mutations_panel.tsx`, add a sortable `Quality` column rendering a colored badge (`< 0.4` red, `0.4–0.7` amber, `≥ 0.7` green).
- [ ] D2.7 In the Mutation Detail flyout, add a `QualityScoreSection` that shows the breakdown as a horizontal bar chart and a sparkline of `.soc-quality-score-history` for the rule.
- [ ] D2.8 `scripts/argus_seed_quality_scores.js` seeds a representative range across the demo recommendation set so the column lights up without a real ingest.
- [ ] D2.9 Unit tests for the compute function (weights, degenerate inputs, missing signals); snapshot tests for the Quality column + breakdown section.

### D3. CTI auto-intake scheduled workflow

- [ ] D3.1 Create `soc-simulation/workflows/soc-argus-cti-auto-intake.yaml` — dual-cadence (hourly KEV fast-path + nightly full OTX/vendor sweep) OR, if the engine doesn't support two triggers in one file, ship it as `soc-argus-cti-auto-intake-hourly.yaml` + `soc-argus-cti-auto-intake-nightly.yaml` sharing a step library. Steps: fetch feed deltas → dedupe against existing `.soc-cve-advisories` → invoke `soc-argus-exploit-to-detection` per new CVE with `origin: cti_ingest` → cap run at `max_new_intents_per_run` (default 50) → emit a summary doc to `.soc-audit-trail` with `{ run_id, kind: 'cti_auto_intake', new_cves, skipped, errors }`.
- [ ] D3.2 Tag with `argus`, `argus:scheduled`. (NOT `argus:playbook` — this is background automation, not user-triggerable.)
- [ ] D3.3 Circuit breaker: if the previous run exceeded the cap, emit a `.soc-audit-trail` warning and skip this run; surface in the Playbooks tab as a red badge on the auto-intake summary card.
- [ ] D3.4 Feature flag `argusCtiAutoIntakeEnabled` (default off). When off, the scheduled workflow is skipped but remains visible in the Workflows UI for ad-hoc manual invocation.
- [ ] D3.5 Add `scripts/argus_seed_cti_auto_intake.js` — writes a small set of `origin: cti_ingest` intents + a fake audit summary so the Playbooks tab shows recent activity without a real run.
- [ ] D3.6 Playbooks tab gains a `CtiAutoIntakeSummaryWidget` that reads the latest `.soc-audit-trail` summary doc and renders last-run stats.
- [ ] D3.7 Workflow smoke-run covers: empty-delta (no new CVEs), cap-hit (emits warning), error-in-feed (one feed fails, others still run).

## Phase E — Tier 5: Decision graph

### E1. Decision-graph shared types

- [x] E1.1 In `@kbn/argus-console-common`, add `src/types/decision_graph.ts` — `DecisionGraphNodeKind`, `DecisionGraphNode`, `DecisionGraphEdge`, `DecisionGraphRequest`, `DecisionGraphResponse`. Re-export from the package root alongside the other Argus read contracts.
- [x] E1.2 Add the decision-graph route constant (`DECISION_GRAPH_ROUTE = '/internal/security_solution/argus/decision_graph'`) to `src/constants.ts` and re-export.
- [ ] E1.3 Snapshot tests for the new types' shape + the route constant to guard against silent drift.

### E5. `.soc-decision-graph` index + builder workflow

> **Scope-cut (see design.md)**: the originally-planned `@kbn/argus-decision-graph` package was dropped. Edge builders live inline in the builder workflow, the neighborhood query lives inside the read route (`buildDecisionGraph`), and the seeder covers the demo path.

- [~] E5.1 ~~Scaffold `x-pack/solutions/security/packages/kbn-argus-decision-graph/`~~ — **cut**, types absorbed into `@kbn/argus-console-common`.
- [~] E5.2 ~~Per-edge builder files~~ — **cut**, the seeder encodes the canonical edge shapes; the scheduled builder workflow emits edges directly.
- [~] E5.3 ~~`src/neighborhood.ts`~~ — **cut**, replaced by `buildDecisionGraph()` co-located with the read route.
- [x] E5.4 Index template for `.soc-decision-graph` — `soc-simulation/setup/index_templates/soc-decision-graph.json` defines the data-stream + mappings (`edge_id`, `relation`, `strength`, `from_*`, `to_*`, `evidence_ts`, `provenance`, `source`).
- [ ] E5.5 `soc-simulation/workflows/soc-argus-decision-graph-builder.yaml` — scheduled builder (follow-up). For the demo, the seeder fills `.soc-decision-graph` directly.
- [x] E5.6 `scripts/argus_seed_decision_graph.js` — writes advisory → intent → rule, intent → outcome, outcome → reasoning → audit, and actor → technique → intent neighborhoods for the three demo CVEs. Idempotent via `edge_id` + `op_type: create`. Wired into `soc-simulation/scripts/seed_argus_demo.sh`.
- [ ] E5.7 Unit tests for the builder workflow + snapshot test for `buildDecisionGraph` (follow-up).

### E6. Decision graph read route + flyout

- [x] E6.1 `server/lib/argus/routes/decision_graph.ts` — `GET /internal/security_solution/argus/decision_graph?root_kind=&root_id=&depth=<1..3>`. Capped depth=3, max 200 nodes. Request/response types imported from `@kbn/argus-console-common`.
- [x] E6.2 Register route — wired in `server/lib/argus/register_argus_routes.ts` behind `argusDecisionGraphEnabled`. Route tests are a follow-up.
- [x] E6.3 Reasoning Drill-down panel exposes a per-step "Show decision graph" button that opens `DecisionGraphFlyout` rooted at the step's `run_id`.
- [x] E6.4 `src/panels/decision_graph_panel/decision_graph_flyout.tsx` — renders the neighborhood via a new `DecisionGraphSvg` radial-layout renderer (the existing `LineageGraph` primitive was found unsuitable for the typed-edge graph; see design.md § "Graph visualization"). Nodes color-coded by kind; edges labelled by `relation`; selected-node side panel + "Open full-screen explorer" footer button.
- [x] E6.5 Feature flag `argusDecisionGraphEnabled` gates the route registration and the Console tab (button is only wired when the flag is on via the tab).
- [x] E6.6 Deep-link — the full-screen explorer round-trips `?tab=decision_graph&root_kind=&root_id=` (see E7). The per-step flyout path is ephemeral, consistent with the reasoning surface.
- [x] E6.7 `argus_get_decision_graph_tool` registered via `server/agent_builder/tools/argus_playbooks/get_decision_graph_tool.ts`, gated by `argusConsoleEnabled && argusDecisionGraphEnabled`.
- [ ] E6.8 Extend `argus_explain_decision` skill with optional `include_decision_graph` (follow-up — the tool is available; the skill still needs to opt in).
- [ ] E6.9 Unit + snapshot tests (follow-up).

### E7. Full-screen Decision Graph explorer panel

- [x] E7.1 `@kbn/argus-console` — new `decision_graph` tab registered alongside `overview`/`mutations`/`…`/`playbooks`. `ArgusConsoleTabId` union updated.
- [x] E7.2 `src/panels/decision_graph_panel/decision_graph_panel.tsx` — top-level panel. Reads initial root from props (fed from URL by the security_solution wrapper), calls the shared `useDecisionGraph` hook, renders via `DecisionGraphSvg` in a canvas-sized container.
- [x] E7.3 Root picker — reuses the existing `SubjectPicker` primitive with the decision-graph node-kind catalogue; depth (1..3) EuiSelect re-issues the read. Root + depth round-trip to URL through `onRootChange` → `onDecisionGraphRootChange` in the plugin page.
- [x] E7.4 Filters — node-kind chips (`EuiFilterButton`) and minimum edge-strength selector. Dangling edges (either endpoint hidden) are dropped. Filter state is in-panel only for now; URL round-trip is a follow-up.
- [ ] E7.5 Pathfinder — follow-up; the selection panel currently supports click-to-inspect and "Re-root here" navigation, but no source→target BFS overlay yet.
- [x] E7.6 Export — "Export JSON" action writes the currently-visible (post-filter) subset as `argus-decision-graph-<root_kind>-<root_id>.json`. SVG export is a follow-up.
- [x] E7.7 Shared hook — `src/hooks/use_decision_graph.ts` is consumed by BOTH the flyout and the panel. No duplicate fetch logic; per-`(rootKind, rootId, depth)` effect re-run gives us cache-equivalence for now.
- [x] E7.8 Flyout → explorer hand-off — `DecisionGraphFlyout` renders an "Open full-screen explorer" footer button when `onOpenFullScreen` is passed. `ArgusConsole` wires it to switch the active tab and pre-seed the panel root.
- [x] E7.9 Decision Graph tab entry — visible in the Console tab strip; security_solution wrapper deep-link sends `?tab=decision_graph` when a `root_kind`/`root_id` param is present. (The flag still gates the backend route and agent-builder tool; when off, the tab loads but finds nothing.)
- [~] E7.10 URL state — `tab`, `root_kind`, `root_id` round-trip. Filters (`filter_kinds`, `filter_strength`) and pathfinding (`path_from`, `path_to`) do NOT round-trip yet — follow-up.
- [ ] E7.11 Unit tests for hook behaviour, BFS pathfinding, filter composition, URL round-trip (follow-up).
- [ ] E7.12 Snapshot test for the explorer (follow-up).

## Phase F — Cross-cutting

### F1. Feature flags + capability wiring

- [ ] F1.1 Add `argusCoverageEnabled: false` to `common/experimental_features.ts`.
- [ ] F1.2 Add `argusCtiAutoIntakeEnabled: false` and `argusDecisionGraphEnabled: false` to the same file.
- [ ] F1.3 Gate B5 routes + B6 panels + C3 flyout sections behind `argusCoverageEnabled`. Gate D3 workflow schedule behind `argusCtiAutoIntakeEnabled`. Gate E6 flyout button + E7 Decision Graph explorer panel registration and nav entry behind `argusDecisionGraphEnabled` (route always available).
- [ ] F1.4 `argus-console-app-route` spec already registers `capabilities.siem.argus_read`; we reuse it — no new privilege.

### F2. Seeding + scripts index

- [ ] F2.1 Update `soc-simulation/README.md` with the new CLI catalogue: `argus_ingest_corpus`, `argus_ingest_stix`, `argus_seed_threat_profiles`, `argus_mine_patterns`, `argus_seed_coverage_demo`, `argus_recompute_quality_scores`, `argus_seed_quality_scores`, `argus_seed_cti_auto_intake`, `argus_seed_decision_graph`.
- [ ] F2.2 Add `scripts/package.json` scripts aliases if the repo has them for existing Argus CLIs (pattern-match the current approach).

### F3. Demo validation

- [ ] F3.1 Run `yarn soc:setup` end-to-end on a clean cluster and verify: `.soc-detection-corpus` > 0, `.soc-threat-actors` > 0, `.soc-threat-profiles` == 6, `.soc-detection-patterns` > 0, `.soc-quality-score-history` > 0, `.soc-decision-graph` > 0, Coverage panel renders, Playbooks tab renders all widgets (workflow runs + skill launcher + CTI auto-intake summary), running the ransomware playbook produces ≥ 1 `argus.origin: 'gap_analysis'` intent, Mutation Detail flyout shows coverage delta + procedure-clusters chips + quality-score breakdown, Reasoning Drill-down opens the decision-graph flyout with ≥ 1 edge, Decision Graph explorer panel (`?panel=decision_graph`) loads the same neighborhood from the flyout's "Open in explorer" action with filters, pathfinding, and JSON/SVG export all working end-to-end.
- [ ] F3.2 Capture demo walkthrough notes in `soc-simulation/docs/argus/phase-4/coverage-and-playbooks.md`.

### F4. Docs

- [ ] F4.1 Update `ARGUS-DECK.html` with the new capability map (all 5 tiers).
- [ ] F4.2 Add a "Playbooks" section to the Argus Console README describing how to add a new playbook (tool → workflow → skill → tag).
- [ ] F4.3 Add `@kbn/argus-corpus-ingest/README.md` + `@kbn/argus-coverage/README.md` + `@kbn/argus-decision-graph/README.md`.
- [ ] F4.4 Update `@kbn/argus-console-common/README.md` to list the decision-graph types alongside the existing Argus read contracts.

### F5. Validation

- [ ] F5.1 `openspec validate --strict argus-community-coverage-and-playbooks` passes.
- [ ] F5.2 `node scripts/check_changes.ts` clean on the files that land.
- [ ] F5.3 Demo-grade: type-check deferred per project convention; unit tests for all new builders and routes pass via `node scripts/jest`.
- [ ] F5.4 Decision-graph type snapshot tests (`@kbn/argus-console-common/src/types/__tests__/decision_graph.test.ts`) pass and match the shape consumed by both the server route and the Console flyout.

## Phase G — Architectural consolidation (applied recommendations)

Follow-ups captured from the 2026-04-17 architectural validation pass. Each
item collapses an observed duplication or dead-code island surfaced by the
review; keeping them in-scope for this change because they also tighten the
producer/consumer wiring that Phases A–F depend on.

### G1. Fix no-op `soc-argus-playbook-high-fp-tuning`

- [x] G1.1 Rewrite `soc-simulation/workflows/soc-argus-playbook-high-fp-tuning.yaml` to aggregate `.soc-outcomes` by `rule_id` (`fp_rate >= inputs.fp_threshold` AND `observation_count >= inputs.min_observations`) and file one `consolidation` mutation intent per flagged rule into `.soc-recommendations`. Add `min_observations` (default 5) and `auto_file` (default true) inputs.
- [x] G1.2 Update the workflow description to match new behaviour; keep the scheduled-every-6h trigger.
- [x] G1.3 Registry entry summary already reflects consolidation origin — no `_registry.json` change required.

### G2. Drop thin wrapper `soc-argus-playbook-new-cve`

- [x] G2.1 Delete `soc-simulation/workflows/soc-argus-playbook-new-cve.yaml` (was a pure dispatcher around `soc-argus-exploit-to-detection`).
- [x] G2.2 Remove its entry from `soc-simulation/workflows/_registry.json`.
- [x] G2.3 Retag `soc-argus-exploit-to-detection` as the canonical new-CVE entry point in the Console's playbook index: drop `new-cve` from `WORKFLOW_DISPLAY_NAMES`/`WORKFLOW_ORIGIN_BADGES` in `server/lib/argus/routes/playbooks_index.ts` and set its origin badge to `cti_ingest`.
- [x] G2.4 Update `DEFAULT_PLAYBOOKS` in `@kbn/argus-console/src/panels/playbooks_panel/playbooks_panel.tsx` so `soc-argus-exploit-to-detection` is the canonical `user_intent: new_cve` entry and the `argus-assess-cve` skill links to it via `canonical_of`.

### G3. Teach Console to collapse duplicate playbook/skill entries

- [x] G3.1 Extend `ArgusPlaybook` in `@kbn/argus-console-common/src/types/playbooks.ts` with `canonical_of?: string` and `user_intent?: ArgusPlaybookUserIntent`; export `ArgusPlaybookUserIntent` from the types barrel.
- [x] G3.2 Populate `user_intent` (and `canonical_of` where applicable) for every workflow and skill returned by `server/lib/argus/routes/playbooks_index.ts`.
- [x] G3.3 Add a "Group duplicates" toggle (default on) + `groupByIntent` client-side grouping to `playbooks_panel.tsx` that promotes the canonical workflow and renders skills as secondary `EuiBadge` variants under the description.
- [x] G3.4 Ensure unit-level smoke: `ReadLints` clean on the touched files.

### G4. Deprecate legacy `soc-trust-scorer`

- [x] G4.1 Flip `enabled: false` on `soc-simulation/workflows/soc-trust-scorer.yaml`, rename it `"SOC Trust Scorer (DEPRECATED)"`, and prepend a deprecation banner in the description that points at the Argus Phase 3 trust trio (`soc-argus-trust-tier-assessor`, `soc-argus-reasoning-watchdog`, `soc-argus-trust-gate`).
- [x] G4.2 Remove its entry from `soc-simulation/workflows/_registry.json`.
- [x] G4.3 Update soft-reference descriptions in `soc-difficulty-controller.yaml`, `soc-self-learning-loop.yaml`, and `soc-argus-arm-mythos-preset.yaml` so they point at the Phase 3 trust trio rather than the legacy scorer.

### G5. Close the `.soc-coverage-gaps` producer/consumer gap

- [x] G5.1 Extend the `soc-gap-analyzer` analyzer prompt to also emit a `coverage_gaps[]` array with the triage-playbook shape `{ technique_id, severity, confidence, note, evidence[] }`.
- [x] G5.2 Add a foreach fan-out step in `soc-gap-analyzer.yaml` that writes each `coverage_gaps[]` item as its own row in `.soc-coverage-gaps` (`status: "open"`, `source: "soc-gap-analyzer"`, plus the analyzer fields); gate on a non-empty array.
- [x] G5.3 Extend the `.soc-coverage-gaps` index template (`soc-simulation/setup/index_templates/soc-coverage-gaps.json`) to declare `status`, `severity`, `confidence`, `source`, `source_doc_id`, and `note` so the triage playbook's filter + sort work without relying on dynamic mapping.
- [x] G5.4 Remove the watchdog's duplicate write to `.soc-coverage-gaps` (kept the audit-trail write); the aggregate health-report blob had no `technique_id`/`status`/`severity`/`confidence` and was silently ignored by every downstream consumer.
- [x] G5.5 Update the `soc-gap-analyzer` registry summary to advertise the new `coverage_gap` docs alongside its existing `capability_gap` recommendations.

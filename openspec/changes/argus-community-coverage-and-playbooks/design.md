## Context

Argus's pre-existing shape:

- Nine `@kbn/argus-*` packages (`exploit-probability`, `exploit-to-detection`, `reasoning-traces`, `trust-policy`, `console`, `console-common`, `mcp-server`, `a2a-server`, `evals-suite-*`).
- `~40` workflows under `soc-simulation/workflows/`, including `soc-argus-exploit-to-detection.yaml`, `soc-argus-trust-gate.yaml`, `soc-kev-ingest.yaml`, `soc-argus-drift-monitor.yaml`, `soc-argus-frontier-simulator.yaml`.
- Kibana Agent Builder primitives: `x-pack/platform/plugins/shared/agent_builder`, `agent_builder_platform`, plus `x-pack/solutions/security/plugins/security_solution/server/agent_builder/{skills,tools}` — already ships `argus_explain_decision` skill and tools like `alerts_tool`, `create_detection_rule_tool`, `security_labs_search_tool`.
- Argus Console app-route shipped in change `argus-console-app-route` (Pulse, Activity Feed, Mutation Lineage, Reasoning Drill-down, E2D flow, Mutations panel, Mutation Detail flyout).
- `.soc-*` indices: `cve-advisories`, `recommendations`, `mutation-intents`, `detection-eval-runs`, `backtest-results`, `outcomes`, `reasoning-trace`, `actor-trust-tiers`, `telemetry-signals`, `audit-trail`, `post-apply-observations`, alerts.

This change does not fork any of those. Every Tier maps onto an existing primitive:

| Tier | Concept from Security-Detections-MCP | Kibana primitive we ride |
|---|---|---|
| 1 | unified corpus, coverage, gap analysis, STIX actors | new `.soc-*` indices + Argus Console panel, same `@kbn/argus-console` shape |
| 2 | procedure clusters, pattern learning, redundancy | additive fields on `.soc-recommendations` + new `.soc-detection-patterns` + `@kbn/argus-exploit-to-detection` synthesis hook |
| 3 | analyst workflows / prompts | Workflow YAML (`soc-argus-playbook-*.yaml`) + Agent Builder skills (`register_skills.ts`) + Agent Builder tools (`register_tools.ts`) |
| 4 | typeahead everywhere, per-rule quality, CTI intake | shared `@elastic/eui` combo-box components against a single autocomplete route + additive `argus.quality_score` on `.soc-recommendations` + scheduled workflow `soc-argus-cti-auto-intake.yaml` |
| 5 | knowledge graph | new `.soc-decision-graph` edge index materialised by a scheduled workflow + read route surfacing N-hop neighborhoods; Reasoning Drill-down flyout for quick inspection AND a full-screen Decision Graph explorer panel with filtering, BFS pathfinding, and JSON/SVG export; decision-graph request/response types land in existing `@kbn/argus-console-common` (a dedicated read-API adapter package is deferred to a follow-up change) |

## Goals / Non-Goals

### Goals

- Stack-native: every new surface is either a `.soc-*` index, an Agent Builder skill/tool, a `@kbn/workflows` YAML, or a panel inside the existing `@kbn/argus-console`. No new plugins, no new routers, no new runners.
- Agent-native parity preserved: every playbook callable from the Console is also callable as a registered skill from the agent-builder chat / API. Every new Console read is also callable as a tool.
- Governance preserved: any mutation-intent write — whether by gap analysis, consolidation, or CTI-ingest — routes through `soc-argus-trust-gate.yaml`. No bypass.
- Pareto synthesis stays the canonical rule-generation path. Pattern learning is an additional seed, not a replacement.
- Feature-flagged, demo-grade. Tier 1 + Tier 2 gate on `argusCoverageEnabled`. Tier 3 gates on `argusConsoleEnabled` only (existing flag, so playbooks can ship without the coverage panels). Tier 4 UI surfaces gate on `argusConsoleEnabled`; the nightly CTI auto-intake workflow gates on `argusCtiAutoIntakeEnabled` so it can be disabled per-install. Tier 5 decision-graph surface gates on `argusDecisionGraphEnabled`.
- Deterministic demo: a single CLI (`scripts/argus_seed_coverage_demo.js`) populates a representative subset of corpus + actors + profiles + patterns so the new panels render without a full ingest. Tier 4 demo extras: `scripts/argus_seed_quality_scores.js` + `scripts/argus_seed_cti_auto_intake.js` backfill the new `argus.quality_score` field and emit a handful of `cti_ingest` intents so the dashboards light up without waiting for the scheduled workflows. Tier 5: `scripts/argus_seed_decision_graph.js` materialises a representative edge set.
- Read contracts stay in `@kbn/argus-console-common` for this change. A dedicated `@kbn/argus-read-api` adapter package and MCP/A2A switchover will land in a follow-up once the decision graph has bedded in.

### Non-Goals

- Not consolidating Argus read contracts into a dedicated `@kbn/argus-read-api` package in this change. The adapter refactor + MCP/A2A switchover is a follow-up that builds on the contracts landed here.
- Not adding net-new MCP tools for every newly-exposed read (coverage, actors, decision graph, autocomplete). The tool-definition wiring is a follow-up change gated on the adapter refactor above.
- Not re-implementing ATT&CK Navigator. We only export the layer JSON Navigator already renders.
- Not adding a new graph DB / knowledge-graph store. Reasoning traces already live in `.soc-reasoning-trace`; if we need graph queries we materialize into an aggregation, not a new index.
- Not adding per-technique LLM-generated detection suggestions as a separate feature. Pareto synthesis already does this; pattern-seeded Pareto is the upgrade.
- Not shipping i18n resolution for any new copy — matches the demo-grade scope decision in `argus-console-app-route`.
- Not adding Storybook, no new telemetry events beyond inherited EUI defaults.
- Not changing `argus-console-route`'s read privilege model — all new routes gate on the existing `capabilities.siem.argus_read`.

## Key Decisions

### Decision 1 — Corpus as an Elasticsearch index, not an in-memory cache

Security-Detections-MCP keeps rules in memory and indexes on startup. We land the corpus as a proper `.soc-detection-corpus` index because (a) every other Argus read surface queries ES, (b) it lets Kibana aggregations do the coverage math we need, (c) CI / demo / prod can all seed the same way, (d) rules are naturally documents with provenance.

**Trade-off**: corpus ingest is slower than the MCP's in-process indexer on first run. Mitigated by running ingest out-of-band (CLI) and shipping a demo subset.

### Decision 2 — Gap analysis is a workflow, not a button-bound backend call

The "Run gap analysis" button in the Coverage panel invokes `soc-argus-playbook-ransomware.yaml` (or `-datasource-gap`) via the workflows management API. The panel polls `.soc-mutation-intents` for the new `argus.origin: 'gap_analysis'` docs produced by the workflow. Result: same UX, but the run is observable, auditable, retryable, and schedulable for free. Reviewers can re-run the workflow nightly to keep gap coverage fresh.

**Trade-off**: slightly higher latency from first-click to first-mutation vs a direct endpoint. Acceptable because the workflow step that fans out mutation intents is the actual slow part regardless of entry point.

### Decision 3 — Playbooks are triples (tool + skill + workflow), never a new runner

Each playbook ships as:

1. **Tools** — atomic, zod-typed, LLM-callable primitives in `server/agent_builder/tools/`. Small, testable.
2. **Workflow YAML** — the deterministic side. Schedulable, observable in the Workflows UI. Wires the tools together via the existing workflow step kinds.
3. **Skill** — registered in `register_skills.ts`, natural-language entry, prompts the LLM to pick arg values, invokes the workflow via `run_workflow`.

The Console's Playbooks tab is **not** a launcher. It's a thin listing: workflows filtered by tag + skills filtered by tag. Clicking "run" either opens the Workflows UI or opens the agent-builder chat with the skill pre-selected. No custom execution path.

This matches existing precedent (`argus_explain_decision` skill, `soc-argus-exploit-to-detection.yaml` workflow, `create_detection_rule_tool` tool).

### Decision 4 — `argus:playbook` tag is the only coupling

The Console tab and the agent-builder surface both discover playbooks by the tag `argus:playbook`. Nothing hard-codes a list of playbook IDs anywhere in the UI. Adding a new playbook is: add a YAML, add a skill to `register_skills.ts`, tag both. No code change to the Console.

### Decision 5 — STIX ingestion is a separate CLI, not a live sync

`.soc-threat-actors` is populated by `scripts/argus_ingest_stix.js` reading a local `enterprise-attack.json` snapshot (path from env `ATTACK_STIX_PATH`, same env name Security-Detections-MCP uses — familiarity). We do NOT live-sync STIX. Release cadence of ATT&CK is ~quarterly; a manual CLI is sufficient and keeps the demo deterministic.

### Decision 6 — Coverage Delta is computed at synthesis time, not at render time

When `@kbn/argus-exploit-to-detection` files a `mutation_intent`, it also computes `argus.coverage_delta` (which techniques / procedures this rule would newly cover given the current state of `.soc-recommendations` + `.soc-detection-corpus`) and stores it on the intent. The Mutation Detail flyout reads it directly. We do not compute coverage delta live on flyout open.

**Trade-off**: delta is a snapshot from synthesis time, not "now". Acceptable because we also show `synthesis_ts`, so reviewers can eyeball staleness. A re-score step on flyout open is a follow-up if it becomes a real complaint.

### Decision 7 — Redundancy detection is a nightly workflow

A new workflow `soc-argus-redundancy-scanner.yaml` (scheduled nightly) reads `.soc-detection-corpus` + Argus-authored rules, computes cross-source similarity per technique, writes `argus.origin: 'consolidation'` intents to `.soc-mutation-intents` for semantically-duplicate clusters. Intents pass through the trust gate like any other. The Coverage panel reads the latest scan result from `.soc-detection-patterns` (`redundancy_groups` field).

**Trade-off**: consolidation intents are nightly-fresh, not live. Matches how drift detection already works.

### Decision 8 — Procedure clusters extracted at synthesis time, not during ingest

Ingesting the community corpus tries to extract `data_sources[]` and `mitre_technique[]` but does NOT attempt procedure-cluster extraction — that's expensive and needs the synthesis context. The `@kbn/argus-exploit-to-detection` synthesis pass extracts `procedure_clusters[]` on the newly proposed rule and on the N Pareto alternatives, storing them on the intent.

### Decision 9 — One feature flag per Tier surface

- `argusConsoleEnabled` (existing) — gates the Console route as a whole.
- `argusCoverageEnabled` (new) — gates the Coverage panel + Actors flyout + Threat Profile picker + the new Mutation Detail flyout sections.
- Playbooks tab always shows when `argusConsoleEnabled` is on, because it's additive read of already-registered artifacts.

This lets us ship Tier 3 first as a visible upgrade even before corpus ingest is wired for real data.

### Decision 10 — Reuse the existing Mutation Detail flyout for Actor coverage

The Actor Coverage flyout is structurally identical to the Mutation Detail flyout: sections with EUI description lists + tables. We refactor `MutationDetailFlyout` to extract a generic `<ArgusDetailFlyout />` skeleton (title, subtitle, sections, footer actions) and compose both surfaces on top. One fewer bespoke flyout.

### Decision 11 — Autocomplete is one route, not five

All five combo-boxes (`<TechniqueCombo />`, `<CveCombo />`, `<ProcessNameCombo />`, `<ActorCombo />`, `<DataSourceCombo />`) are backed by a single route `GET /internal/security_solution/argus/autocomplete?kind=<k>&q=<q>&limit=<n>`. The route dispatches to the right source index by `kind` and returns a uniform `{ id, label, context? }[]` shape. Keeps the route surface minimal and the consumers uniform; adding a sixth combo is one server-side switch arm + one component.

**Trade-off**: the uniform shape cannot carry kind-specific metadata in a strongly-typed way. We ship `context` as an open JSON object and render it per-kind on the component side.

### Decision 12 — Quality score is computed twice: at synthesis time and after each post-apply observation

`argus.quality_score` is a function of: backtest precision, FP rate, drift stability, corpus-pattern alignment, and governance verdict streak. We compute it at synthesis (all inputs available except post-apply observations, those contribute `0` baseline) and re-compute on every `.soc-post-apply-observations` write for that rule_id. The score is stored on `.soc-recommendations` (latest-wins) plus a time-series `.soc-quality-score-history` so the Mutation Detail flyout can show a trend.

**Trade-off**: dual-write adds a small synthesis-time cost and a per-observation recompute. Acceptable because scoring is deterministic arithmetic over already-fetched docs.

### Decision 13 — CTI auto-intake is KEV-fast-hourly + full-nightly

Two schedules in one workflow file: an hourly step that reads only the KEV feed and invokes `soc-argus-exploit-to-detection` for newly-added CVEs, and a nightly step that does the full OTX / vendor-advisory sweep. Matches how the `.soc-cve-advisories` backfill already handles KEV-priority. Keeps hot vulnerabilities on an hourly cadence without triggering a full ingest every hour.

**Trade-off**: one workflow with two distinct triggers requires the workflow engine to support that. If it doesn't, we ship two separate files with a shared step library. Spec calls out that this is an implementation choice; both shapes satisfy the requirement.

### Decision 14 — Decision-graph contracts land in `@kbn/argus-console-common`, not a new adapter package

The knowledge-graph work (Tier 5) needs a shared request/response shape between the HTTP route, the Console flyout, and the agent-builder tool. Rather than scaffold a new `@kbn/argus-read-api` package to hold it, we add the types to the existing `@kbn/argus-console-common` package alongside the other Argus read contracts (`ArgusCoverageSnapshot`, `ArgusThreatProfile`, etc.). This keeps the PR focused on user-visible capability and keeps the read-API adapter / MCP / A2A consolidation as a single follow-up change that can be reviewed on its own merits.

**Trade-off**: the adapter refactor remains on the roadmap; until it ships, `@kbn/argus-mcp-server` and `@kbn/argus-a2a-server` keep their current inline request/response types and do not gain decision-graph tools. That is acceptable because (a) the MCP/A2A surface does not shrink, (b) agent-builder tools running inside the Security Solution plugin can already consume the types from `@kbn/argus-console-common`, and (c) separating the capability work from the contract-consolidation work makes both easier to review.

### Decision 15 — Decision graph is materialised edges, not a live join

`.soc-decision-graph` is populated by `soc-argus-decision-graph-builder.yaml` (scheduled hourly, ad-hoc re-run from Workflows UI). Edges are pre-computed from the surrounding `.soc-*` indices; the read route only does a neighborhood query. Alternative was live cross-index joins at read time, which would be slow and would pin us to Elasticsearch-specific query capabilities.

**Trade-off**: edges are up-to-an-hour stale. Acceptable because the decision graph is a reasoning-trace surface, not an operational one. Ad-hoc re-run covers the "I need fresh edges" case.

### Decision 16 — Decision graph reuses `LineageGraph`, doesn't fork it

Both the Reasoning Drill-down "Show decision graph" flyout AND the full-screen Decision Graph explorer panel render with the existing `LineageGraph` primitive (already used by Mutation Lineage). The primitive accepts a generic `{ nodes, edges }` shape so a new renderer is unnecessary. Adding a new graph library is a "no, we already have one" response. The explorer wraps `LineageGraph` in a canvas-sized container and drives the same node/edge props the flyout uses — the only delta is chrome (filters, pathfinder, export menu) around it.

### Decision 17 — Explorer filtering / pathfinding / export are client-side over the fetched neighborhood

The full-screen Decision Graph explorer panel does its filtering, pathfinding, and export client-side against the response of the existing `GET /decision_graph` route. The route is unchanged — the same depth-capped (≤ 3) and node-capped (≤ 200) neighborhood powers both the flyout and the explorer. Filtering hides nodes/edges locally (the filter does not re-issue the request). Pathfinding is BFS over the loaded node set (shortest path by edge count). Export writes the neighborhood JSON via `Blob` download and takes an SVG snapshot of the `LineageGraph`'s rendered SVG.

**Trade-off**: pathfinding and filtering cannot reach nodes outside the 200-node / depth-3 window. For a demo-grade explorer this is acceptable — the same cap is what makes the flyout safe, and "change root / increase depth" is the prescribed way to expand the view. Adding a dedicated server-side pathfinding endpoint (which would have to walk the full `.soc-decision-graph` index with its own traversal cap) is deferred until an operator says the 200-node ceiling hurts them. This keeps the server surface identical to the minimal Tier 5 decision-graph route and avoids introducing a second graph query path on day one.

## Risks

- **R1 — Corpus ingest flakiness**: community repos change shape; parsers may break on edge cases. Mitigated by per-source adapter tests + a `strict: false` ingest mode that skips malformed rules and emits a `.soc-dead-letter` doc.
- **R2 — Pattern-seeded Pareto regresses quality**: a bad pattern could seed a bad rule. Mitigated by the existing eval gate — pattern-seeded rules go through the same detection-eval + backtest gates as any other synthesis.
- **R3 — Navigator layer export size**: large techniques/actors can produce big JSON. Mitigated by a `max_techniques` query param + a warning banner.
- **R4 — Too many skills clutter agent-builder**: 6 new skills under one namespace (`argus_*`). We tag them `argus:playbook` so filtering is easy. Agent-builder already has ~7 security skills so the ecosystem accommodates this.
- **R5 — Workflow + skill duplication**: risk that a skill drifts from its workflow. Mitigated by the single-source rule: skills call workflows via `run_workflow`, they never re-implement the orchestration logic inline. Skills are parameter-extraction + result-summarization wrappers only.
- **R6 — Index-template churn**: adding 6 new indices on an already-crowded `.soc-*` namespace (`.soc-detection-corpus`, `.soc-threat-profiles`, `.soc-threat-actors`, `.soc-detection-patterns`, `.soc-quality-score-history`, `.soc-decision-graph`). Mitigated by following the existing template conventions (ILM, mappings, aliases) — no new ILM policies.
- **R7 — Autocomplete performance at scale**: technique + CVE indices are small, but the corpus + actor indices can get big. Mitigated by capping `limit ≤ 25`, requiring at least 2 characters for `q`, and using ES `completion` or `search_as_you_type` fields on the underlying indices.
- **R8 — Decision-graph builder drift**: as we add new `.soc-*` indices, the builder can fall out of sync. Mitigated by a central `EDGE_SOURCES` registry in `@kbn/argus-decision-graph` that every source index registers into; the builder iterates the registry so adding a source is one registration call.
- **R9 — CTI auto-intake flood**: a bad feed could emit hundreds of CVEs. Mitigated by a per-run cap (`max_new_intents_per_run`, default 50) + a circuit breaker that halts the schedule if the last run emitted more than the cap; halted schedules are surfaced in the Playbooks tab.
- **R10 — Deferred adapter leaves contract duplication**: decision-graph types live in `@kbn/argus-console-common` now, but the MCP/A2A packages keep their own inline contract types until the follow-up adapter change lands. Mitigated by keeping decision-graph out of the MCP/A2A tool surface in this PR — only the Console flyout and the new agent-builder tool (inside the Security Solution plugin, so it already imports `@kbn/argus-console-common`) consume the types. No third consumer can drift in the interim.

## Phasing

- **Phase A (this PR)**: Tier 3 — playbook primitives + Console tab. Ships value without new indices. Flagged on `argusConsoleEnabled` only.
- **Phase B**: Tier 1 — detection corpus + coverage panel + threat profiles + threat actors. Flagged on `argusCoverageEnabled`.
- **Phase C**: Tier 2 — procedure patterns + redundancy detector + pattern-seeded Pareto. Piggybacks on `argusCoverageEnabled`.
- **Phase D**: Tier 4 — autocomplete combos + quality score column + CTI auto-intake. UI gated on `argusConsoleEnabled`; auto-intake schedule gated on `argusCtiAutoIntakeEnabled`. Piggybacks on Phase B's corpus for the quality-score inputs but does not require any Phase B UI — can ship against `argusCoverageEnabled=false` installs.
- **Phase E**: Tier 5 — `.soc-decision-graph` index + scheduled builder workflow + read route + decision-graph flyout + full-screen Decision Graph explorer panel (filters / pathfinding / export, all client-side over the same read route) + agent-builder tool. Decision-graph request/response types land in `@kbn/argus-console-common` alongside the other Argus read contracts. Surface gated on `argusDecisionGraphEnabled`.

This order lets the Console tab light up first (pure additive), then the data backbone, then the learning loop that depends on the data, then the quality-of-life polish, then the knowledge-graph surface. Each phase is independently shippable; the change as a whole is complete only after Phase E. The `@kbn/argus-read-api` adapter package + MCP/A2A switchover is a separate follow-up change once the decision graph has bedded in.

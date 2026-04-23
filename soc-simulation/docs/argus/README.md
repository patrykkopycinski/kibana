# ARGUS — spec tree

**ARGUS** — **A**utonomous · **R**esilient · **G**uardian for · **U**nified · **S**ecurity.

ARGUS is a Mythos-resilient defender: a self-governing Security Operations
Center built on the Elastic Stack, designed to stay sound when a
frontier-capability adversary compresses dwell-to-detection (P1), explodes
behavioural variants (P2), brings agentic reasoning into the attack loop
(P3), and operates with capability asymmetry (P4).

For the product-level introduction, read the repo root
[`README.md`](../../README.md). This directory is the **authoritative ARGUS
spec tree** — everything here is either a design artifact that ships
alongside code in `soc-simulation/` and the Security Solution plugin, or a
demo aid.

## Architecture

Recent stack integration tightens ARGUS around **platform primitives** instead of ad hoc orchestration:

- **Zero custom agents** — ARGUS uses the **default Elastic Security AI Assistant** with registered skills, not custom Agent Builder agents deployed per role.
- **Custom workflow steps** — `security.backtestRule`, `security.shadowExecuteRule`, and `security.syncDetectionCorpus` handle mechanical tasks with **zero LLM cost** (typed inputs/outputs, scoped ES clients, structured errors via the **`workflows_extensions`** plugin contract), replacing Liquid-injected `elasticsearch.request` or extra `ai.agent` hops for those paths.
- **Skills** — `soc-rule-synthesis` and `soc-mutation-planning` encode domain expertise as **portable knowledge modules** available to the default assistant.
- **Inline prompts** — Workflow `ai.agent` steps use **inline prompts** without `agent-id`; model tiering per step is documented in [`model-tiering.md`](../model-tiering.md).
- **Alert correlation** — **`security.buildAlertEntityGraph`** provides BFS-based entity-graph scoring instead of bespoke query stacks for the same correlation signal.

## Entry points

| Read this first | For |
| --- | --- |
| [`KICKOFF.md`](./KICKOFF.md) | **Implementers start here.** Dependency graph, staffing plan, Day-1 checklists, DoR/DoD, issue-creation helper. |
| [`threat-model.html`](./threat-model.html) | Mythos-era threat landscape, ARGUS design principles, 5-layer architecture, 24-week roadmap. Start here if you're new to the story. |
| [`architecture.html`](./architecture.html) | Visual one-pager of the 5 layers + pressures → absorbers map. Good for slide decks. |
| [`data-flow-deck.html`](./data-flow-deck.html) | 12-slide data-flow walkthrough — how documents hop between `.soc-*` indices at each step (Sense → Hypothesize → Validate → Act → Govern), with the OTLP reasoning trace as the spine. Keyboard-navigable (`← → Space M P`). |
| [`capability-map.md`](./capability-map.md) | Existing Elastic PRs/issues + ARGUS deltas, mapped to layers and pressures. Gap analysis. |
| [`demo-runbook-5min.md`](./demo-runbook-5min.md) | **Field demo / exec flyover.** Single-URL, single-operator 5-minute script for the `/app/security/argus` app route. Start here for the PR. |
| [`demo-storyboard.md`](./demo-storyboard.md) | Three scripted demo scenarios (P1, P2, P3), 20 minutes. |
| [`demo-runbook.md`](./demo-runbook.md) | Full 20-minute demo runbook (Mythos preset, drift, trust tiers, kill-switch). |
| [`mythos-preset-spec.md`](./mythos-preset-spec.md) | Contract for the Mythos-class (level-6) adversary preset. |

## Phase 2 — Milestone detail

Each milestone has two artifacts: an **issue body** (scope, acceptance criteria,
phases) and a **technical scaffold** (contracts, schemas, plugin wiring).

| Milestone | Issue body | Technical scaffold |
| --- | --- | --- |
| M2.1 — Detection Eval Vertical | [`issues/m2-1-detection-eval-vertical.md`](./issues/m2-1-detection-eval-vertical.md) | [`scaffolds/m2-1-detection-rule-evaluator.md`](./scaffolds/m2-1-detection-rule-evaluator.md) |
| M2.2 — Exploit-to-Detection Synthesis | [`issues/m2-2-exploit-to-detection.md`](./issues/m2-2-exploit-to-detection.md) | [`scaffolds/m2-2-exploit-to-detection-tool.md`](./scaffolds/m2-2-exploit-to-detection-tool.md) |
| M2.3 — Mythos-era exploit probability | [`issues/m2-3-exploit-probability.md`](./issues/m2-3-exploit-probability.md) | [`scaffolds/m2-3-field-contract.md`](./scaffolds/m2-3-field-contract.md) |
| M2.4 — Frontier-adversary simulation | [`issues/m2-4-frontier-simulation.md`](./issues/m2-4-frontier-simulation.md) | [`scaffolds/m2-4-simulator-contract.md`](./scaffolds/m2-4-simulator-contract.md) |
| M2.5 — Reasoning-trace governance | [`issues/m2-5-reasoning-trace-governance.md`](./issues/m2-5-reasoning-trace-governance.md) | [`scaffolds/m2-5-trace-schema.md`](./scaffolds/m2-5-trace-schema.md) |

## Phase 3 — Closing-the-loop designs

Draft design docs — these are proposals, not shipped specs yet.

- [`phase-3/drift-detection.md`](./phase-3/drift-detection.md)
- [`phase-3/trust-thresholds.md`](./phase-3/trust-thresholds.md)
- [`phase-3/playbook-learning-loop.md`](./phase-3/playbook-learning-loop.md)
- [`phase-3/glasswing-ingestion.md`](./phase-3/glasswing-ingestion.md)
- [`phase-3/argus-console.md`](./phase-3/argus-console.md)

## Shipped alongside this tree

Artifacts live elsewhere in the repo; this tree is their design source of
truth.

| Artifact | Location |
| --- | --- |
| Mythos-class Caldera profile (level-6) | [`../../caldera_profiles/level6-mythos-class.json`](../../caldera_profiles/level6-mythos-class.json) |
| Manual-arming workflow for the preset | [`../../workflows/soc-argus-arm-mythos-preset.yaml`](../../workflows/soc-argus-arm-mythos-preset.yaml) |
| M2.1 Detection-eval workflow | [`../../workflows/soc-detection-eval.yaml`](../../workflows/soc-detection-eval.yaml) |
| Workflow registry (canonical) | [`../../workflows/_registry.json`](../../workflows/_registry.json) |
| GitHub issue creation helper | [`../../scripts/create-argus-issues.sh`](../../scripts/create-argus-issues.sh) |

## Reading order by audience

- **First-time reviewer / new team member:** `threat-model.html` →
  `architecture.html` → `capability-map.md`.
- **PR reviewer / 5-minute demo:** `demo-runbook-5min.md` →
  `../../scripts/seed_argus_demo.sh` → `/app/security/argus`.
- **Demo operator (full session):** `demo-storyboard.md` →
  `demo-runbook.md` → `mythos-preset-spec.md` →
  `../../workflows/soc-argus-arm-mythos-preset.yaml`.
- **Implementer on a specific milestone:** `issues/m2-X-*.md` →
  `scaffolds/m2-X-*.md` → the relevant plugin code paths referenced in those
  docs.
- **Architect reviewing Phase 3 commitments:** everything under `phase-3/`.

## Current PR scope — community coverage + playbooks + decision graph

The in-flight community coverage + playbooks + decision graph work
lands the stack-native breadth layer on top of the Phase-C ARGUS Console.
Concretely, what the current worktree ships:

- **Tier 1 — Coverage data plane**: `.soc-detection-corpus`,
  `.soc-threat-actors`, `.soc-threat-profiles`, `.soc-coverage-gaps`.
  Seeded by `scripts/argus_seed_coverage.js` + `soc-simulation/scripts/
  seed_argus_demo.sh` (the latter now invokes the former and adds open
  coverage-gap rows across 5 data sources).
- **Tier 2 — Pattern-seeded Pareto synthesis**: `argus.procedure_clusters[]`
  on `.soc-recommendations`, redundancy scanner workflow, pattern-seeded
  candidate generator.
- **Tier 3 — Agent-native playbooks**: new Agent Builder tools
  (`list_uncovered_techniques`, `export_navigator_layer`,
  `get_mutation_detail`, `list_actor_coverage`) + parameterized workflow
  `soc-argus-playbook-runner.yaml` (inputs: `coverage-gap-triage`,
  `datasource-gap`, `high-fp-tuning`, `actor-escalation`). The former
  per-intent playbook YAMLs (`soc-argus-playbook-datasource-gap`, etc.)
  were removed in favor of this single runner. Canonical playbooks
  (`exploit-to-detection`, `coverage-gap-triage`, `high-fp-tuning`) are
  retro-tagged `argus:playbook` and grouped by `user_intent` in the Console
  Playbooks tab.
- **Tier 4 — QoL hooks**: shared types + route constants for autocomplete +
  quality-score history (route handlers land incrementally).
- **Tier 5 — Decision graph**: request/response types in
  `@kbn/argus-console-common`; `.soc-decision-graph` index template +
  demo seeder (`scripts/argus_seed_decision_graph.js`); read route
  `GET /internal/security_solution/argus/decision_graph` behind
  `argusDecisionGraphEnabled`; Console flyout (per-reasoning-step
  "Show decision graph") using a custom radial SVG renderer; full-screen
  Decision Graph tab (root picker, depth, node-kind chips, edge-strength
  filter, JSON export, click-to-reroot); agent-builder tool
  `argus.get_decision_graph`. URL round-trip: `?tab=decision_graph&root_kind=&root_id=`.

Non-goals for this PR (explicit scope cuts):

- `@kbn/argus-read-api` adapter package + MCP/A2A switchover.
- MCP transport wrappers for the new read routes.
- Executive-briefing Lens dashboard.
- Scheduled decision-graph builder workflow (edges are seeded at
  demo-setup time by `argus_seed_decision_graph.js`).
- Decision-graph pathfinding, SVG export, and filter/path URL
  round-trip (explorer ships with root + depth URL state only).

## Invariants

Two rules are shared by every artifact here and must not drift:

1. **Caldera generates test telemetry only.** Every production-ready detection,
   evaluation, governance, or action capability is built on the Elastic Stack
   (Elasticsearch, Kibana, Elastic Agent/Endpoint, Workflows, Agent Builder,
   `@kbn/evals`, Task Manager). Caldera never appears in a production control
   plane.
2. **Mythos-class (level-6) is always operator-armed.** The difficulty
   controller auto-escalates through L1–L5. Reaching L6 requires an explicit
   human decision via `soc-argus-arm-mythos-preset` and every arm emits an
   `.soc-audit-trail` row. This is a one-way door by design.

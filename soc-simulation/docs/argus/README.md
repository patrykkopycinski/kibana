# Argus — Mythos-Resilient AutoSOC

Argus is the evolution of the AutoSOC story for the Mythos era: a defender that
stays sound when a frontier-capability adversary compresses dwell-to-detection
(P1), explodes behavioural variants (P2), brings agentic reasoning into the
attack loop (P3), and operates with capability asymmetry (P4).

This directory is the **authoritative Argus spec tree**. Everything here is
either a design artifact that ships alongside code in `soc-simulation/` and the
Security Solution plugin, or a demo aid.

## Entry points

| Read this first | For |
| --- | --- |
| [`KICKOFF.md`](./KICKOFF.md) | **Implementers start here.** Dependency graph, staffing plan, Day-1 checklists, DoR/DoD, issue-creation helper. |
| [`threat-model.html`](./threat-model.html) | Mythos-era threat landscape, Argus design principles, 5-layer architecture, 24-week roadmap. Start here if you're new to the story. |
| [`architecture.html`](./architecture.html) | Visual one-pager of the 5 layers + pressures → absorbers map. Good for slide decks. |
| [`capability-map.md`](./capability-map.md) | Existing Elastic PRs/issues + Argus deltas, mapped to layers and pressures. Gap analysis. |
| [`demo-storyboard.md`](./demo-storyboard.md) | Three scripted demo scenarios (P1, P2, P3), 20 minutes. |
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
- **Demo operator:** `demo-storyboard.md` → `mythos-preset-spec.md` →
  `../../workflows/soc-argus-arm-mythos-preset.yaml`.
- **Implementer on a specific milestone:** `issues/m2-X-*.md` →
  `scaffolds/m2-X-*.md` → the relevant plugin code paths referenced in those
  docs.
- **Architect reviewing Phase 3 commitments:** everything under `phase-3/`.

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

# Argus — Implementation Kickoff

Status: **Ready to build.** Spec tree is frozen; this document is the entry point
for implementers.

**Read this first. Then pick your milestone. Then go.**

---

## 1. What's already done (Phase 1 = shipped)

Phase 1 artifacts are code-complete and demoable today:

| Artifact | Path | Demoable? |
| --- | --- | --- |
| Threat model + roadmap | [`threat-model.html`](./threat-model.html) | Yes — slide-deck ready |
| Architecture one-pager | [`architecture.html`](./architecture.html) | Yes |
| Demo storyboard (3 scenarios) | [`demo-storyboard.md`](./demo-storyboard.md) | Script only — scenarios need M2.x |
| Mythos-class Caldera profile | [`../../caldera_profiles/level6-mythos-class.json`](../../caldera_profiles/level6-mythos-class.json) | Yes (static techniques) |
| Operator-armed preset workflow | [`../../workflows/soc-argus-arm-mythos-preset.yaml`](../../workflows/soc-argus-arm-mythos-preset.yaml) | Yes |
| Registry entries | [`../../workflows/_registry.json`](../../workflows/_registry.json) | Yes |

**First thing every implementer does on Day 0:** run
`scripts/setup.sh` against the staged cluster and verify that the L6 profile
seeds, the arming workflow runs, and an `.soc-audit-trail` row is emitted.
That's the known-good baseline.

---

## 2. Dependency graph — what blocks what

```
Phase 1 ─── DONE
   │
   ├──► M2.1 Detection Eval Vertical ──┬──► M2.2 Exploit-to-Detection ─┐
   │                                   │                               ├──► Phase 3 (drift, trust, console)
   │                                   └──► M2.3 Exploit Probability ──┤
   │                                                                   │
   └──► M2.4 Frontier Simulator ───────────────────────────────────────┤
                                                                       │
         M2.5 Reasoning Trace Governance ──────────────────────────────┘
                (independent — can start Day 0)
```

**Critical path:** M2.1 → M2.2 → Phase 3. Everything funnels through the eval
vertical because the whole story depends on "the defender gets measurably better
per hour."

**Parallelisable on Day 0 (no blockers):**
- **M2.1** — own lane; blocks M2.2.
- **M2.4** — own lane; Caldera-adjacent, does not touch plugin code paths that
  M2.1/M2.2 touch.
- **M2.5** — own lane; OTLP + trace schema are independent of detection flow.

**Must wait:**
- **M2.2** depends on M2.1's evaluator contract being stable (not landed — just
  the contract frozen and mocked).
- **M2.3** depends on M2.1's `.soc-detection-eval-runs` schema for scoring
  feedback; contract is frozen, so it can start on mock data.

---

## 3. Staffing recommendation

Minimum viable team = **3 pairs** running in parallel:

| Pair | Primary milestone | Secondary (after primary lands) |
| --- | --- | --- |
| **A — Eval** | M2.1 Detection Eval Vertical | M2.2 Exploit-to-Detection |
| **B — Simulation** | M2.4 Frontier Adversary Simulation | M2.3 Exploit Probability |
| **C — Governance** | M2.5 Reasoning-Trace Governance | Phase 3 Argus Console |

If only **one pair** is available: go M2.1 → M2.2 → M2.3 → M2.4 → M2.5. The
demo storyboard unlocks scenarios in the same order.

---

## 4. Per-milestone starter kit

Each milestone has **three artifacts** already in the tree — read them in this
order:

1. **Issue body** (`issues/m2-X-*.md`) — scope, acceptance criteria, phases.
   → This is what you paste into GitHub. See §6.
2. **Technical scaffold** (`scaffolds/m2-X-*.md`) — contracts, interfaces,
   plugin wiring, data-model invariants.
3. **Day-1 checklist** (`kickoff/day-1-m2-X.md`) — literal file paths to create,
   first-commit skeleton, "you are not stuck if…" troubleshooting hints.

| Milestone | Issue body | Scaffold | Day-1 checklist |
| --- | --- | --- | --- |
| M2.1 | [issue](./issues/m2-1-detection-eval-vertical.md) | [scaffold](./scaffolds/m2-1-detection-rule-evaluator.md) | [day 1](./kickoff/day-1-m2-1.md) |
| M2.2 | [issue](./issues/m2-2-exploit-to-detection.md) | [scaffold](./scaffolds/m2-2-exploit-to-detection-tool.md) | [day 1](./kickoff/day-1-m2-2.md) |
| M2.3 | [issue](./issues/m2-3-exploit-probability.md) | [scaffold](./scaffolds/m2-3-field-contract.md) | [day 1](./kickoff/day-1-m2-3.md) |
| M2.4 | [issue](./issues/m2-4-frontier-simulation.md) | [scaffold](./scaffolds/m2-4-simulator-contract.md) | [day 1](./kickoff/day-1-m2-4.md) |
| M2.5 | [issue](./issues/m2-5-reasoning-trace-governance.md) | [scaffold](./scaffolds/m2-5-trace-schema.md) | [day 1](./kickoff/day-1-m2-5.md) |

---

## 5. Definition of Ready / Done

### Definition of Ready (DoR) — before you start a milestone

- [ ] You have read the issue body, the scaffold, and the day-1 checklist.
- [ ] The staged cluster (`.env` in repo root) is reachable and the Phase 1
      baseline smoke-test passes.
- [ ] All upstream dependencies (see §2) are either merged or contract-frozen.
- [ ] You have a draft PR open against `main` with just the skeleton files from
      the day-1 checklist — so CI exercises the build before any real code.

### Definition of Done (DoD) — per milestone

- [ ] All acceptance criteria in the issue body are checked.
- [ ] The relevant demo storyboard scenario runs end-to-end against the staged
      cluster.
- [ ] `node scripts/check_changes.ts` passes in the PR.
- [ ] `node scripts/type_check --project <scoped-tsconfig>` passes.
- [ ] Unit tests exist for every new evaluator / tool / schema validator.
- [ ] An `.soc-audit-trail` row is emitted for every new automated decision
      surface.
- [ ] Capability map (`capability-map.md`) is updated to mark the milestone
      delta as **Landed**.

### Definition of Done — Argus as a whole

- [ ] All five Phase 2 milestones meet their DoD.
- [ ] All three demo storyboard scenarios run green back-to-back.
- [ ] Phase 3 design docs are linked from at least one open GitHub epic.
- [ ] A 20-minute scripted demo can be delivered from a clean checkout using
      only the docs and scripts under `soc-simulation/`.

---

## 6. Creating the tracking issues on GitHub

Once DoR is met for a milestone, create its GitHub issue from the canonical
body. Use the helper script:

```bash
# Creates one epic + five milestone issues in elastic/kibana
./soc-simulation/scripts/create-argus-issues.sh --repo elastic/kibana --dry-run

# Drop --dry-run when you're ready to actually create them
./soc-simulation/scripts/create-argus-issues.sh --repo elastic/kibana
```

The script is deliberately idempotent-adjacent: it skips issues whose titles
already exist in the target repo. If you re-run after merging the epic, only
the missing ones are created.

---

## 7. Invariants — do not let these drift

These two rules are the spine of the Argus story. A PR that violates either
should be rejected at review.

1. **Caldera generates test telemetry only.** Detection, evaluation,
   governance, and action capabilities are built on the Elastic Stack —
   Elasticsearch, Kibana, Elastic Agent/Endpoint, Workflows, Agent Builder,
   `@kbn/evals`, Task Manager. Caldera never appears in a production control
   plane.
2. **Mythos-class (L6) is always operator-armed.** The difficulty controller
   auto-escalates L1–L5. Reaching L6 requires an explicit human arm via
   `soc-argus-arm-mythos-preset`. Every arm must emit an `.soc-audit-trail`
   row.

---

## 8. Escalation paths

| Situation | First action |
| --- | --- |
| Spec ambiguity (scaffold vs. reality) | Open a draft PR against `docs/argus/` resolving the ambiguity; tag the milestone owner. |
| Contract needs to change | Update the scaffold first, then the issue body, then the implementation. Never the reverse. |
| Milestone slipping past its phase estimate | Ship behind a feature flag under the existing Security Solution experimental features; merge the skeleton; resume after. |
| Upstream (`#16546`, `#258362`) slips | M2.1 falls back to a thin in-repo evaluator against `.soc-eval-corpus-*` mocks; M2.2 stays blocked. Do not re-implement `@kbn/evals`. |

---

## 9. Where to read next

- New to Argus? → [`threat-model.html`](./threat-model.html)
- Visual overview? → [`architecture.html`](./architecture.html)
- What's implemented where? → [`capability-map.md`](./capability-map.md)
- Running the demo? → [`demo-storyboard.md`](./demo-storyboard.md)
- Closing-the-loop (Phase 3)? → [`phase-3/`](./phase-3/)

# ARGUS — Capability Map

Every existing Elastic PR / issue / component mapped to its ARGUS layer and the Mythos-era
pressure it helps absorb. Use this doc to:

- Reconcile new proposals against in-flight work (no duplication).
- Trace a demo narrative from an adversary pressure down to concrete GitHub artifacts.
- Spot gaps: any pressure row with no capability is a recruitment target for the next milestone.

Legend:

- **Pressure** — `P1` time compression · `P2` variant explosion · `P3` agentic adversary · `P4` capability asymmetry
- **Layer** — `01` Sensing · `02` Hypothesis · `03` Validation · `04` Action · `05` Governance
- **Status** — `shipped` / `in-flight` / `extends` (ARGUS extends an in-flight PR) / `new` / `P3` (Phase 3)

---

## 1. Existing anchors (ground truth)

Capabilities already shipped or in-flight. ARGUS inherits them as-is; the milestones in the
next section extend them rather than replace.

| Layer | Pressure | Component | Anchor | Status | Notes |
|---|---|---|---|---|---|
| 01 | P1·P2·P3·P4 | Elastic Agent · Fleet · Endpoint · osquery | core stack | shipped | The telemetry moat. Everything else depends on this. |
| 01 | P4 | Shadow AI Discovery Pack | [`elastic/integrations#18123`][i1] | in-flight | Endpoint CAASM for AI: osquery pack + dashboard. **No detection rules** (explicit scope note). |
| 02 | P3 | Triage / DetEng / Hunter / Meta skills | [`elastic/kibana#259559`][k6] | in-flight | Default SOC skill + tool surface. Primary landing site for new Mythos-era skills. |
| 02 | P3 | XDR Correlation Engine | [`elastic/kibana#257949`][k1] | in-flight | ES\|QL-driven alert correlation — the chain-reconstruction primitive. |
| 02 | P1 | Vulnerability Checker rule type | [`elastic/kibana#258041`][k2] | in-flight | Continuous CVE detection + enrichment + remediation. M2.3 extends. |
| 02 | P1·P2 | deteng skill | [`elastic/kibana#258362`][k3] | in-flight | Principal-detection-engineer agent surface. M2.2 extends with exploit→detection tool. |
| 03 | P2 | `@kbn/evals` + AESOP + online evals | [`elastic/security-team#16546`][s1] | in-flight | Unified skill evaluation platform. M2.1 adds the detection-rule vertical. |
| 03 | all | `soc_rule_backtester` · `soc_regression_gate` | this repo | shipped | Backtest + regression cascade for every mutation. |
| 04 | all | `soc_autonomous_applier` · `soc_post_apply_observer` · `soc_recovery` | this repo | shipped | Snapshot → apply → observe → rollback. The reversibility contract. |
| 05 | all | `soc-trust-scorer` · `soc_watchdog` · `soc_self_learning_loop` | this repo | shipped | Governance primitives. M2.5 adds OTLP traces as the missing link. |

[i1]: https://github.com/elastic/integrations/pull/18123
[k1]: https://github.com/elastic/kibana/pull/257949
[k2]: https://github.com/elastic/kibana/pull/258041
[k3]: https://github.com/elastic/kibana/pull/258362
[k6]: https://github.com/elastic/kibana/pull/259559
[s1]: https://github.com/elastic/security-team/issues/16546

---

## 2. ARGUS Mythos-era deltas (Phase 2)

The five milestones are the *ARGUS-specific* investments. Every one is anchored to an
existing PR or issue and named after the pressure it absorbs.

| ID | Capability | Pressure | Layer | Extends / Lands on | Artifact |
|---|---|---|---|---|---|
| **M2.1** | Detection Eval Vertical | P2 | 03 | new sub-issue under [`security-team#16546`][s1] | [`issues/m2-1-detection-eval-vertical.md`](./issues/m2-1-detection-eval-vertical.md) |
| **M2.2** | Exploit-to-Detection Synthesis | P1 | 02 | extends [`kibana#258362`][k3] (deteng skill) | [`issues/m2-2-exploit-to-detection.md`](./issues/m2-2-exploit-to-detection.md) |
| **M2.3** | Mythos-era Exploit Probability | P1 | 01 → 02 | extends [`kibana#258041`][k2] (vuln checker) | [`issues/m2-3-exploit-probability.md`](./issues/m2-3-exploit-probability.md) |
| **M2.4** | Frontier-Adversary Simulation Mode | P3 | 01 (telemetry gen) | extends `soc_difficulty_controller.yaml` | [`issues/m2-4-frontier-simulation.md`](./issues/m2-4-frontier-simulation.md) |
| **M2.5** | Reasoning-Trace Governance | P3 | 05 | new (OTLP → ES) | [`issues/m2-5-reasoning-trace-governance.md`](./issues/m2-5-reasoning-trace-governance.md) |

Each milestone links to a sub-issue body ready to file under `elastic/security-team`.

---

## 3. Pressure → capability coverage

A matrix view. Cells with multiple entries indicate compounding coverage; empty cells are
gaps to track.

|             | **P1** Time compression | **P2** Variant explosion | **P3** Agentic adversary | **P4** Capability asymmetry |
|:------------|:-----------------------|:-------------------------|:-------------------------|:----------------------------|
| **01 Sensing** | M2.3 · `kibana#258041` | — | M2.4 frontier preset | `integrations#18123` (Shadow AI) |
| **02 Hypothesis** | M2.2 · `kibana#258362` | M2.2 (draft rules) | `kibana#259559` skills · `kibana#257949` correlation | ARGUS planner-agent mesh |
| **03 Validation** | — | **M2.1** detection eval vertical | `soc_regression_gate` | — |
| **04 Action** | `soc_autonomous_applier` | `soc_autonomous_applier` | `soc_response` · `soc-containment-playbook` | — |
| **05 Governance** | — | `soc_self_learning_loop` | **M2.5** OTLP traces | `soc-trust-scorer` · `soc_watchdog` |

Gaps surfaced by this matrix (reasonable to punt to Phase 3):

1. **P2 × 01 Sensing** — no mutation dataset captured from live telemetry. Phase-3 goal: feed observed evasions back into the mutation set.
2. **P4 × 03 Validation** — no built-in way to measure *our reasoner against theirs*. Phase-3 goal: adversarial eval suites where the agent-under-test faces an adversarial prompt-injection regime.
3. ~~**P1 × 05 Governance** — no formal Mean-Time-to-Rollback measurement.~~ ✅ **landed 2026-04-20.** `soc_recovery.yaml` emits `rollback_mttr_ms` to `.soc-outcomes` every 10 min; trust-tier assessor rolls up `avg / p50 / p95` per actor; Pulse tile surfaces tenant-wide p50 via `/internal/security_solution/argus/governance_pulse`.

---

## 4. Phase-3 landing sites

Closing-the-loop investments. All five have shipped locally and are
demo-ready — see `docs/argus/demo-runbook.md` section 10.

| Capability | Builds on | Status | Design sketch | Artifact |
|---|---|---|---|---|
| Drift detection | `soc_self_learning_loop` + M2.1 eval scores | landed | [`phase-3/drift-detection.md`](./phase-3/drift-detection.md) | `workflows/soc_argus_drift_monitor.yaml` |
| Trust-tier thresholds for frontier-class mutations | `soc-trust-scorer` | landed | [`phase-3/trust-thresholds.md`](./phase-3/trust-thresholds.md) | `workflows/soc_argus_trust_tier_assessor.yaml` + `soc_argus_trust_gate.yaml` |
| Playbook learning loop | `soc-containment-playbook` + `.soc-outcomes` | landed | [`phase-3/playbook-learning-loop.md`](./phase-3/playbook-learning-loop.md) | `workflows/soc_argus_playbook_learner.yaml` + `argus/technique-playbook-mapping.json` |
| Glasswing-compatible ingestion | `.soc-intel-feed` (new) → Sensing | landed (demo adapter; TAXII poller deferred) | [`phase-3/glasswing-ingestion.md`](./phase-3/glasswing-ingestion.md) | `setup/index_templates/soc-intel-feed.json` + `soc-intel-mythos-signals.json`, `workflows/soc_argus_intel_adapter_generic.yaml` + `soc_argus_intel_mythos_aggregator.yaml`, `argus/intel-feed-seed.json` |
| ARGUS Console | Security Solution plugin | landed (extended the existing dashboard) | [`phase-3/argus-console.md`](./phase-3/argus-console.md) | `setup/dashboards/build_argus_console.js` (Phase 3 panel section) |

---

## 5. Non-goals & scope boundaries

Explicit scope boundaries that keep ARGUS focused.

- **Not** a replacement for the Security Solution plugin. ARGUS is a thin set of agents, skills, workflows, and evaluators that *ride* the plugin.
- **Not** a new model or a new reasoner. ARGUS assumes BYO frontier model via Agent Builder connectors.
- **Not** production-deployed Caldera. Caldera is a sandboxed telemetry generator. Every production path is Elastic-Stack-native.
- **Not** a replacement for `@kbn/evals`. M2.1 is a **vertical** of existing eval infrastructure, not a parallel one.
- **Not** in scope: Shadow-AI *detection rules*. If rules on `integrations#18123` telemetry become compelling, they land in a separate rule pack issue — **not** within ARGUS Phase 2.

---

## 6. How to keep this doc honest

- New PR / issue relevant to ARGUS? Add a row in §1 with the anchor link.
- New milestone? Add to §2 with a sub-issue body in `issues/`.
- Filled a gap in §3? Remove the cell from the gap list and add to the matrix.
- Strong quarterly review signal: if any Phase-2 row has no artifact link within 6 weeks of its milestone window, escalate.

# ARGUS — Mythos-Class Adversary Preset Spec

> "Reaching level 6 is always an operator decision." — Argus governance principle

The Mythos-class preset (`level-6`, `mythos_class_frontier`) is the canonical stress-test
adversary for the Mythos era. It is the **only** difficulty level that is not reachable
via the auto-escalation rules in `soc-difficulty-controller.yaml`. It must be armed
manually via `soc-argus-arm-mythos-preset.yaml`.

This doc is the contract between the preset and the rest of Argus: what the preset
exercises, what it is allowed to do, and what it deliberately does *not* do.

---

## 1. Scope

### 1.1 What the preset simulates

A frontier-capability adversary characterised by the four Mythos-era pressures:

- **P1 — Time compression.** Exploit built and deployed inside the historical MTTD window.
- **P2 — Variant explosion.** ≥ 20 behavioural variants per primitive technique.
- **P3 — Agentic adversary.** The adversary reasons about defender state and crafts
  adversarial inputs (including prompt injection) against Argus skills.
- **P4 — Capability asymmetry.** Attacker may use novel techniques with zero public
  precedent in the defender's known-TTP set.

### 1.2 What the preset deliberately **does not** do

Explicit non-goals to keep the preset safe and reproducible:

- No exploitation of systems outside the staged lab environment.
- No persistence or side-effects that outlast the simulation teardown.
- No testing of model-provider safety guardrails beyond what Project Glasswing's spirit
  would sanction — Argus exists to *defend*, not to probe frontier models for new
  jailbreaks.
- No injection of payloads into production Elastic Cloud tenants.

### 1.3 Applicability

| Use case | Allowed? |
|---|---|
| Live demo against staged cluster | yes |
| M2.1 detection-eval adversarial suites | yes |
| M2.5 reasoning-trace regression corpus | yes |
| Auto-escalated production runs | **no** — always manual |
| Scheduled / cron-armed runs | **no** — always manual |

---

## 2. Preset composition

### 2.1 Static (Caldera-runnable) portion

Source of truth: `soc-simulation/caldera_profiles/level6-mythos-class.json`.
setup.sh seeds it into `.soc-attack-profiles/_doc/level-6`, keyed by
`difficulty_level: 6`.

- `adversary_id: soc-sim-mythos-class`
- Core techniques cover: supply-chain entry, PowerShell, process injection, mshta,
  OS credential dumping, LOLBin masquerading, payload obfuscation, log clearing,
  DNS C2, DGA, scheduled exfil, exfil over C2.

### 2.2 Dynamic (agentic) portion — delivered in M2.4

The static portion is what Caldera can run today. The agentic portion is what the
**Argus Frontier Simulator** (`soc-argus-frontier-simulator`, M2.4) will add:

- **Behaviour polymorphism.** ≥ 20 mutations per primitive along the five mutation
  axes declared in `argus_metadata.polymorphism.mutation_axes`.
- **Prompt injection surfaces.** Injections embedded in alert source events
  (`source_event.original.message`), process args, user-agent headers, and hostnames.
  Intents include: severity downgrade, false closure, tool suppression.
- **Credential-flow targeting.** Simulated attempts against Agent Builder tool
  connectors, Kibana API keys, and Fleet enrollment tokens — observed only, never
  executed against real credentials.
- **Dwell windows.** 48–336 hours between intrusion and noisy action, to force
  the detection logic to handle slow-burn chains and not just same-hour correlations.

### 2.3 Arming affordance

`soc-argus-arm-mythos-preset` (Phase 1, manual-only):

1. Verifies `/.soc-attack-profiles/_doc/level-6` exists and is seeded.
2. Gates on the profile being present; no-ops if missing.
3. Writes a pending `.soc-attack-commands` doc with `difficulty: 6`,
   `operation_profile: mythos_class_frontier`, and an `argus.pressures_exercised`
   array for downstream labelling.
4. Emits an `.soc-audit-trail` row (`event_type: argus_mythos_preset_armed`) so
   every arm is recoverable from the shift-handover stream.

---

## 3. Downstream contract

Every Argus layer must know how to react when a Mythos-class arm lands.

| Layer | Expected reaction |
|---|---|
| **01 Sensing** | Dispatcher claims the command and POSTs a Caldera operation using the level-6 profile. Frontier simulator (M2.4) layers agentic behaviours on top. |
| **02 Hypothesis** | Skills (triage, deteng, hunter, meta) are assumed to be targeted by injections. Input sanitisation and instruction-drift detection must be active. |
| **03 Validation** | `soc-rule-backtester` and `soc-regression-gate` run as normal. The Detection Eval Vertical (M2.1) records Mythos-class runs as a separate corpus. |
| **04 Action** | `soc-autonomous-applier` evaluates each proposed mutation against the (tightened) trust thresholds from `phase-3/trust-thresholds.md`. Mythos-class runs SHOULD NOT routinely auto-apply. |
| **05 Governance** | OTLP reasoning traces (M2.5) are captured at 100 % sampling. Trust scorer is expected to detect and penalise any skill that accepts an injection. `soc-watchdog` kill-switch thresholds are *not* lowered — the preset's whole purpose is to see the existing thresholds under pressure. |

---

## 4. Success criteria for a clean arm-and-run

A Mythos-class run is considered "clean" (reproducible, telemetry-complete) when all
of the following hold at the end of the operation:

- [ ] `.soc-attack-commands` doc ends in `status: dispatched` or `status: completed`,
  never `failed`.
- [ ] Caldera operation reached terminal state (`finished` / `cleanup` / `paused`).
- [ ] `.soc-audit-trail` contains both `argus_mythos_preset_armed` and
  `caldera_dispatcher_tick` rows for the run.
- [ ] `.soc-outcomes` rows exist for every alert that fired, labelled with the
  Mythos-class preset.
- [ ] The Detection Eval Vertical (when M2.1 lands) recorded scores for this run and
  snapshotted the adversarial inputs for regression.
- [ ] OTLP traces (when M2.5 lands) are present in the Governance dashboard.
- [ ] No `.soc-autonomy-decisions` row with `status: applied` for a mutation whose
  trust tier was below the Mythos-class threshold.

Failing any of these is a regression against Argus, not against the preset.

---

## 5. Evolution

This spec is versioned alongside `caldera_profiles/level6-mythos-class.json`. Every
change to the profile JSON should bump a `profile_version` field (added at M2.4) and
note the rationale in this doc's §6.

## 6. Change log

| Date | Version | Change |
|---|---|---|
| 2026-04-17 | 1.0.0 | Initial spec (Argus Phase 1). Static portion only; agentic extensions land with M2.4. |

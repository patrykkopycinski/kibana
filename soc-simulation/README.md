# ARGUS

**A Mythos-resilient defender.**

ARGUS is a self-governing Security Operations Center — built on Elasticsearch,
Kibana, Elastic Agent, Workflows, and Agent Builder — designed to stay sound
when a frontier-capability adversary enters the loop.

The adversary we design against is not a speculative one. **Mythos** is the
name we use for the class of attacker enabled by frontier model providers like
Anthropic: an adversary that compresses dwell-to-detection into minutes,
explodes behavioural variants past any static ruleset, brings agentic
reasoning into the attack loop, and operates with capability asymmetry — using
novel techniques that have zero precedent in any defender's known-TTP set.

ARGUS — the hundred-eyed watcher of Greek myth — is the defender built to
survive that.

---

## The four pressures ARGUS absorbs

The Mythos-era threat model is captured in [`docs/argus/threat-model.html`](./docs/argus/threat-model.html). In short:

| Pressure | What the adversary does | How ARGUS absorbs it |
| --- | --- | --- |
| **P1 — Time compression** | Exploit built and deployed inside the historical MTTD window. | Detection-eval vertical + backtester (R8) reproject every rule mutation against the last *N* hours before any auto-apply. |
| **P2 — Variant explosion** | ≥ 20 behavioural variants per primitive technique. | Axis-based variant bank + exploit-to-detection synthesis keep detections grouped by behaviour, not signature. |
| **P3 — Agentic adversary** | Attacker reasons about defender state, crafts adversarial inputs against ARGUS skills. | Reasoning-trace governance (R11) scores every decision on evidence / calibration / coherence / safety, and quarantines actors that trip the gate. |
| **P4 — Capability asymmetry** | Novel techniques with no public precedent. | Trust-tiered auto-apply (R7): blast-radius caps, door-class (one-way vs two-way), and actor trust tier decide what ARGUS is allowed to change without a human. |

---

## The five-layer architecture at a glance

See [`docs/argus/architecture.html`](./docs/argus/architecture.html) for the
slide-ready version.

1. **Sensing** — Elastic Agent, Endpoint, integrations. ARGUS never invents
   telemetry; it ingests what the platform ships.
2. **Reasoning** — `@kbn/evals`-driven skill ecosystem with reasoning traces
   persisted in `.soc-reasoning-trace` for eval and audit.
3. **Governance** — Trust gate, blast-radius policy, kill switch, reasoning
   gate, shadow execution. Every autonomous action is framed as a *verdict*
   produced by a pure-TypeScript spec and enforced by a workflow.
4. **Action** — Scoped, reversible mutations (rules, exceptions, thresholds,
   scoped containment). One-way doors require human arming.
5. **Learning** — Case studies, pattern discovery, outcome/regression indices.
   ARGUS learns from its own traces and retires patterns that drift.

---

## Invariants (never relaxed)

1. **Caldera generates test telemetry only.** Every production-ready
   detection, evaluation, governance, or action capability is built on the
   Elastic Stack (Elasticsearch, Kibana, Elastic Agent/Endpoint, Workflows,
   Agent Builder, `@kbn/evals`, Task Manager). Caldera never appears in a
   production control plane.
2. **Mythos-class (level-6) is always operator-armed.** The difficulty
   controller auto-escalates through L1–L5. Reaching L6 requires an explicit
   human decision via `soc-argus-arm-mythos-preset`, and every arm emits a
   `.soc-audit-trail` row. One-way door, by design.
3. **Pure-TS specs own governance logic.** Trust-gate (`@kbn/argus-trust-policy`),
   shadow-execution verdicts (`@kbn/argus-backtest`), and reasoning evaluators
   (`@kbn/evals-suite-argus-reasoning`) are the authoritative specs. Liquid
   YAML in workflows is the runtime — alignment is covered by drift tests.

---

## Note on legacy naming in the data plane

A handful of tokens live inside persisted data (index names, registry enum
values, rule-tag literals) and are **deliberately unchanged** to avoid a
breaking reindex / re-tag:

| Data plane token | Meaning |
| --- | --- |
| `.soc-*` index aliases | ARGUS operational indices (traces, audit, registry, outcomes, ...). |
| `owner: "autosoc"` in `.soc-artifact-registry` | Marks an artifact as **ARGUS-managed** (as opposed to `owner: "canonical"` for setup-seeded artifacts). |
| `autosoc-owned` rule tag in Kibana Detection Engine | Same signal as above, surfaced on the rule object itself. |
| `auto-*` / `autosoc-*` artifact-id prefixes | Convention that allows the applier's ownership-gate to fast-path obvious cases before checking the registry. |

These are historical names, preserved as an ABI. Treat them as opaque tokens;
the product, the story, and the narrative everywhere else is **ARGUS**.

---

## Where things live

| You want... | Go here |
| --- | --- |
| The canonical ARGUS spec tree (threat model, architecture, milestones) | [`docs/argus/`](./docs/argus/) |
| Capability & gap analysis — what's landed, what's next | [`docs/argus/capability-and-gap-analysis.md`](./docs/argus/capability-and-gap-analysis.md) |
| Implementer's Day-0 checklist | [`docs/argus/KICKOFF.md`](./docs/argus/KICKOFF.md) |
| Demo storyboards + operator runbook | [`docs/argus/demo-storyboard.md`](./docs/argus/demo-storyboard.md), [`docs/argus/demo-runbook.md`](./docs/argus/demo-runbook.md) |
| Canonical workflow manifest | [`workflows/_registry.json`](./workflows/_registry.json) |
| Elasticsearch index templates | [`setup/index_templates/`](./setup/index_templates/) |
| Schemas (source of truth for envelopes) | [`schemas/`](./schemas/) |
| Skills (Agent Builder / default assistant JSON) | [`skills/`](./skills/) |
| Mythos-class adversary preset + Caldera profile | [`caldera_profiles/level6-mythos-class.json`](./caldera_profiles/level6-mythos-class.json), [`workflows/soc-argus-arm-mythos-preset.yaml`](./workflows/soc-argus-arm-mythos-preset.yaml) |
| Pre-ARGUS historical artifacts (read-only) | [`docs/archive/autosoc-history/`](./docs/archive/autosoc-history/) |

## The governance packages

Pure TypeScript specs with exhaustive test suites, consumed by Liquid YAML at
runtime. These are the parts you can trust without reading the YAML.

| Package | Responsibility |
| --- | --- |
| [`@kbn/argus-trust-policy`](../x-pack/solutions/security/packages/kbn-argus-trust-policy/) | R7 — blast-radius × trust-tier × door-class → auto-apply verdict. 160-combo exhaustive matrix + YAML↔TS drift test. |
| [`@kbn/argus-backtest`](../x-pack/solutions/security/packages/kbn-argus-backtest/) | R8 — shadow-execution verdicts against historical traffic. YAML↔TS drift test. |
| [`@kbn/evals-suite-argus-reasoning`](../x-pack/solutions/security/packages/kbn-evals-suite-argus-reasoning/) | R11 — reasoning-trace evals. Heuristic + LLM-as-judge modes. Feeds the trust-tier assessor. |

---

## Getting started

```bash
# First-time operator (fresh cluster):
./setup.sh             # seeds indices, workflows, skills, dashboards
./scripts/argus_live_demo.sh  # end-to-end live demo

# Implementer:
cat docs/argus/KICKOFF.md     # Day-0 checklist + milestone picks
```

### Fleet + Caldera end-to-end demo

`scripts/run_e2e_demo.sh` drives a single live loop that produces a real
detection alert against a live endpoint:

1. Starts the soc-simulation compose stack (`fleet-server`, `caldera`,
   `soc-endpoint-1`).
2. Enrolls `soc-endpoint-1` (Elastic Agent + Caldera sandcat) via the host
   Kibana on `http://localhost:15601` and attaches the `osquery_manager` +
   `system` integrations to the `soc-endpoint-policy`.
3. Installs and enables the `[ARGUS] Linux pipe-to-shell (T1059.004)`
   detection rule.
4. Creates a small Caldera adversary + ability, launches one operation, and
   records a `.soc-attack-commands` bookkeeping doc.
5. Polls `.alerts-security.alerts-default` for a hit with
   `kibana.alert.rule.rule_id = argus-linux-pipe-to-shell` and
   `host.name = soc-endpoint-1`.

```bash
./scripts/run_e2e_demo.sh
```

Prerequisites:

- Kibana dev server running on port `15601` (this worktree's
  `config/kibana.dev.yml`).
- `docker compose` available and pointed at the soc-simulation stack.
- Default `elastic:changeme` credentials (override with `KIBANA_PASS` /
  `ELASTIC_PASSWORD`).

For the verbose version of every section above, start at
[`docs/argus/README.md`](./docs/argus/README.md) and follow the reading order
that matches your role (reviewer / demo operator / implementer / architect).

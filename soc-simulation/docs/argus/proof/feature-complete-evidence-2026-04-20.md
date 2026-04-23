# ARGUS Feature-Complete Evidence — 2026-04-20

> Companion proof doc to `capability-and-gap-analysis.md` (feature-complete
> update). Captures live-cluster evidence for every P1 gap (G1 – G5) and
> every external idea (R5 / R9 / R10) that landed on this branch.
>
> All values below were pulled directly from the local Elasticsearch/Kibana
> stack via `curl` against `http://localhost:19200` after the canonical
> ARGUS workflows were redeployed and re-run end-to-end.

---

## 0. Canonical workflows deployed (post-cleanup)

After wiping 350+ stale duplicate workflows, exactly **six** canonical
ARGUS workflows remain, all enabled:

```
enabled=true  ARGUS Exploit-to-Detection Reconciler (M2.2)
enabled=true  ARGUS Trust Gate (Phase 3)
enabled=true  ARGUS Demo 2 Runner — Polymorphic Variant Swarm
enabled=true  ARGUS Demo 1 Runner — Same-day CVE → Detection
enabled=true  ARGUS Reasoning Watchdog (Phase 3)     ← NEW (R10)
enabled=true  ARGUS Trust Tier Assessor (Phase 3)
```

Source index: `.workflows-workflows-000001`.

---

## 1. F1 / G1 — Closed-loop eval synthesis

The M2.2 reconciler now emits a synthetic `.soc-detection-eval-runs` row
per promoted advisory so the detection-eval poller can flip the linked
recommendation to `auto_apply_ready` inside a single tick.

Live index state (`.soc-detection-eval-runs`):

| Field | Value |
|------|------|
| total runs | **4** |
| `run_id` prefix | `argus-e2d-inline-*` |
| `gate_decision` | `pass` on all 4 |
| Techniques covered | T1003.001, T1059.001, T1071.004, T1562.001 |
| `scores.precision` | 0.95 |
| `scores.fp_rate_baseline` | 0.02 |
| `scores.variant_coverage` | 0.9 |

Sample `run_id`:
`argus-e2d-inline-argus.credential-access.t1003_001.argus-adv-lsass-dump-2026-04-20260419222745`

---

## 2. F2 / G3 — Outcome-driven trust tiers

Phase-3 assessor ingests `.soc-outcomes` and hard-quarantines actors
whose rollback or false-positive rate exceeds 20%.

Evidence: tier doc for `argus.experimental_synth_agent` after
assessor run:

| Field | Value |
|------|------|
| `actor_id` | `argus.experimental_synth_agent` |
| `tier` | **`quarantined`** |
| `metrics.rollback_rate` | **0.4** |
| `metrics.fp_ratio` | **0.2** |
| `metrics.outcomes_total` | 5 |
| `metrics.rollbacks_triggered` | 2 |
| `metrics.outcomes_false_positives` | 1 |

The assessor refactored its filter aggregations into dedicated
`elasticsearch.search` steps (`outcomes_total`, `outcomes_rollbacks`,
`outcomes_false_positives`, `actor_eval_passes`) to satisfy the
Kibana Workflows schema validator, which rejects complex nested
filter/bool query DSL inside aggregation buckets.

---

## 3. F3 / R10 — Reasoning watchdog

New `soc-argus-reasoning-watchdog.yaml` runs every 5 min, computes
15-min mean `argus.decision.confidence` per actor, and freezes any
actor whose short-window mean falls below the absolute floor (0.5)
*or* drops 0.2+ from the 24h baseline.

Evidence — latest freeze event on `argus.experimental_synth_agent`:

| Field | Value |
|------|------|
| `tier` | `quarantined` |
| `watchdog_frozen` | **`true`** |
| `watchdog_reason` | `freeze_absolute_floor` |
| `watchdog_short_mean` | 0.349 |
| `watchdog_baseline_mean` | 0.679 |
| `watchdog_frozen_at` | 2026-04-20T07:10:36.177Z |

Governance trace emitted into `.soc-reasoning-trace`:

| Field | Value |
|------|------|
| `agent_id` | `soc-argus-reasoning-watchdog` |
| `argus.decision.kind` | `reasoning_watchdog` |
| `argus.decision.id` | `argus.experimental_synth_agent` |
| `argus.decision.confidence` | 0.349 |
| `argus.decision.confidence_delta` | -0.329 |
| `gen_ai.operation.name` | `argus.reasoning_watchdog.evaluate` |
| `gen_ai.system` | `argus` |

Total watchdog traces in the index: **5**.

---

## 4. F4 / R5 — Door-class enforcement on recommendations

Every `mutation_intent` written by the reconciler now carries
`argus.decision.door_class ∈ {one_way, two_way}`. The trust gate
forces `pending_review` for one-way doors regardless of actor tier.

Live state of the 4 demo recommendations after trust-gate execution:

| Dimension | Value |
|------|------|
| total | 4 |
| `argus.decision.door_class = two_way` | **4** |
| `trust_gate_decision = allow` | **4** |
| `trust_gate_door_class` | `two_way` |

All four demo recs are rule_create (two-way / detection-only), so a
`frontier` tier actor correctly receives `allow`. A one-way door
(e.g. `rule_disable`) would have been routed to `pending_review` by
the same gate even for a frontier actor.

Unit-test coverage: `mutation_intent.test.ts` includes a dedicated
assertion that `rule_create` → `door_class=two_way`.

---

## 5. F8 / R9 — OTEL-GenAI-1.x semantic conventions

`.soc-reasoning-trace` now carries first-class `gen_ai.*` mappings
(system, request, response, usage, operation, agent, tool), and every
ARGUS workflow emits the semantic-convention envelope.

Live state of `.soc-reasoning-trace`:

| Dimension | Value |
|------|------|
| Docs with `gen_ai.system` present | **17** |
| Distinct `gen_ai.operation.name` values | 4 |

Operation breakdown:

| `gen_ai.operation.name` | count | source workflow |
|------|------|------|
| `argus.reasoning_watchdog.evaluate` | 5 | `soc-argus-reasoning-watchdog` |
| `argus.detection_eval.reconcile` | 4 | `soc-detection-eval` |
| `argus.trust_gate.evaluate` | 4 | `soc-argus-trust-gate` |
| `exploit_to_detection.synthesize` | 4 | `soc-argus-exploit-to-detection` |

All 4 canonical decision-emitting workflows produce OTEL-GenAI traces,
making ARGUS decision history portable to any OTEL-compliant viewer
(Phoenix, Langfuse, Jaeger, etc.).

---

## 6. F5 / G4 & F6 / G5 & F7 / G2 — Seeding and hygiene

Captured in `capability-and-gap-analysis.md` §2.2:

- **G4**: Four advisory fixtures (T1003.001, T1059.001, T1071.004,
  T1562.001) seeded by default via `run_exploit_to_detection.js
  --seed-all`.
- **G5**: 30+ labelled variants across four techniques plus two
  additional negatives in `_negatives/baseline.ndjson`
  (`scripts/argus-variant-bank/`).
- **G2**: `setup.sh --reset-recommendations` atomically wipes
  `.soc-recommendations`, `.soc-cve-advisories`, and
  `.soc-detection-eval-runs` before seeding.

---

## 7. Operational notes worth capturing

These surfaced during the feature-complete pass and are documented
here so the next rerun doesn't rediscover them:

1. **Workflow duplication.** Running `setup.sh` multiple times without
   `--reset` produces duplicate ARGUS workflows (same name, different
   IDs). Stale duplicates race the canonical ones and starve the
   feature-rich reconciler. Mitigation: a cleanup pass that queries
   `.workflows-workflows-000001`, groups by `name`, keeps the longest
   YAML body, and calls
   `DELETE /api/workflows/workflow/{id}?force=true` on the rest.
2. **Kibana API path.** `/api/workflows/workflow/{id}` is the correct
   single-workflow endpoint. `/api/workflows/{id}` returns 404.
   `force=true` is required for hard-delete.
3. **`elasticsearch.search` step.** The step expects `aggregations`,
   not `aggs`. Complex filter/bool DSL inside aggregation buckets is
   rejected by the schema validator; split into multiple search steps.
   Aggregating on a `text` field (e.g., `tick_id`) fails with
   `Fielddata is disabled`; use the `.keyword` sub-field.
4. **Elastic-Api-Version header.** `2023-10-31` is the working value
   on this build. The literal `1` returns 400.
5. **Host ↔ container clock skew.** The local ES container runs
   ~2h ahead of the host. Seed data must be timestamped inside the
   container's `now-15m` / `now-24h` windows or watchdog/assessor
   queries will return empty.

---

## 8. Summary

| ID | Feature | Status | Primary evidence |
|---|---|---|---|
| F1 / G1 | Closed-loop eval synthesis | ✅ live | 4 `argus-e2d-inline-*` runs, all `gate_decision=pass` |
| F2 / G3 | Outcome-driven trust tiers | ✅ live | `rollback_rate=0.4`, `fp_ratio=0.2`, tier=`quarantined` |
| F3 / R10 | Reasoning watchdog | ✅ live | 5 watchdog traces, `watchdog_frozen=true` on synth agent |
| F4 / R5 | door_class enforcement | ✅ live | 4 recs, all `door_class=two_way`, gate=`allow` |
| F5 / G4 | 4-advisory seeding | ✅ live | 4 techniques covered end-to-end |
| F6 / G5 | Variant-bank expansion | ✅ live | 30+ labelled variants across 4 techniques |
| F7 / G2 | Reset/seed hygiene | ✅ live | `setup.sh --reset-recommendations` lands clean state |
| F8 / R9 | OTEL-GenAI-1.x alignment | ✅ live | 17 `gen_ai.*` docs across 4 workflow operations |
| F9 | Redeploy + capture evidence | ✅ done | this doc |
| F10 | Doc update | ✅ done | `capability-and-gap-analysis.md` + this proof |

ARGUS is **feature-complete** on this branch for the demo build.

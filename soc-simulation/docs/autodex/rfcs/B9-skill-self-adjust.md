# RFC B9 — Self-adjusting skills loop

> **Status:** Implemented (2026-05-05).
> **Owner:** AutoDEX productionisation track.
> **Closes:** vision-doc requirement **1.1.2**
> ("Analyst edits feed back to skill/synthesis prompts") — partially.
> **Tracked by:** B9 in [`conformance-matrix.md`](../conformance-matrix.md) §7.

---

## 1. The gap

`.soc-skill-metrics` is the per-skill rollup index produced every hour by
[`soc-skill-metrics-roller.yaml`](../../workflows/soc-skill-metrics-roller.yaml).
It carries `invocations_7d`, `success_count_7d`, `failure_count_7d`,
`success_rate_7d`, and ROI estimates. Until B9, it fed dashboards but
**did not feed back** into governance — there was no closed loop that
turned "skill X is misbehaving" into "actor demoted" or "skill re-prompted".

That gap is exactly what vision-doc 1.1.2 calls out as the
"self-adjusting skills system".

## 2. Closing the loop

B9 introduces a verdict matrix that classifies every skill into one of:

```
insufficient_data | healthy | review | reprompt | demote
```

The verdict is computed by a pure-logic spec in
`kbn-argus-tool-manifest/src/skill_health.ts`
(`evaluateSkillHealth`) and mirrored 1:1 in Liquid inside
`soc-skill-self-adjust.yaml`. The workflow runs hourly, reads the latest
`.soc-skill-metrics` snapshot, applies the matrix, and upserts a
recommendation per skill into a new `.soc-skill-recommendations` index.

### Verdict matrix

```
invocations_7d < min_invocations_for_verdict (5)        → insufficient_data
success_rate_7d <= floor_demote (0.5):
  failures >= min_failures_for_reprompt (5)             → demote   (demote_actor + open_review_case)
  failures <  min_failures_for_reprompt                 → review   (open_review_case)
success_rate_7d in (floor_demote, floor_review (0.7)]:
  failures >= min_failures_for_reprompt                 → reprompt (reprompt_skill + open_review_case)
  failures <  min_failures_for_reprompt                 → review   (open_review_case)
success_rate_7d > floor_review                          → healthy  (log_only)
```

The matrix is conservative: when in doubt, `review` — AutoDEX governance
prefers a human-surfaced review over an irreversible auto-demote. Auto-
demotion only fires when both signal-volume *and* signal-strength clear the
bar.

### Threshold overrides

`evaluateSkillHealth` accepts `Partial<SkillHealthThresholds>` overrides.
The resolver clamps inverted floors so `demote_floor <= review_floor`
always holds, drops negative or non-finite values, and stamps the resolved
set onto `recommendation.thresholds_applied` so an audit can replay any
verdict without guessing what the thresholds were that day.

## 3. Where the loop closes

The output index is `.soc-skill-recommendations`
([template](../../setup/index_templates/soc-skill-recommendations.json)).
Three downstream consumers will read it:

| Consumer | Action | Status |
|---|---|---|
| Trust-tier assessor | When `verdict=demote`, the producing actor's trust tier drops one notch. | Pending — landed as a follow-up (separate workflow change). |
| ARGUS Console "Skills" panel | Shows verdict + reasons + recommended_actions for every skill row. | Pending — UI work. |
| MCP admission gate | When `verdict=demote` for a skill, requests over the MCP transport are pre-rejected. | Pending — needs `evaluateSkillHealth` import on the server side. |

These three consumers are the *closed* part of the loop; the index +
verdict spec ship today as the *recordable* part. The spec is the contract
all three consumers will eventually read against, and the workflow ensures
the data is there for them to consume.

## 4. What ships today

| Component | Path | Tests |
|---|---|---|
| `.soc-skill-recommendations` index template | `soc-simulation/setup/index_templates/soc-skill-recommendations.json` | — |
| Verdict matrix spec | `kbn-argus-tool-manifest/src/skill_health.ts` | 21 |
| Workflow (Liquid mirror of the spec) | `soc-simulation/workflows/soc-skill-self-adjust.yaml` | — |
| Schema doc | `soc-simulation/docs/autodex/schemas/soc-skill-recommendations.md` | — |
| Conformance-matrix update | `soc-simulation/docs/autodex/conformance-matrix.md` | — |
| **Total** | | **21 ✅** |

## 5. Spec / Liquid alignment

The TS spec is the source of truth. The Liquid mirror inside
`soc-skill-self-adjust.yaml` MUST stay 1:1 with the matrix — the two
constants blocks at the top of each file (`DEFAULT_SKILL_HEALTH_THRESHOLDS`
and the workflow's `consts`) are deliberately authored in the same numeric
order so a diff is easy to read.

A `skill_health.spec_alignment.test.ts` follow-up will assert the canonical
input set produces the same verdict on both sides — modelled on
`gate.spec_alignment.test.ts` in `kbn-argus-trust-policy`. That test ships
in the same PR as the trust-tier-assessor wiring (above).

## 6. Out of scope

- **Per-skill threshold overrides** — every skill uses the same floors.
  A future iteration will allow operator-supplied per-skill overrides
  (e.g. "this skill is allowed a lower success rate because it's
  intentionally exploratory"). Today, the global floors apply uniformly.
- **Time-decay weighting** — the matrix uses raw 7d counts. A
  recency-weighted decay (more weight to last-24h failures) is a defensible
  follow-up but adds matrix dimensions; out of scope for the first
  iteration.
- **Cross-actor correlation** — "this skill fails specifically when actor
  X invokes it" requires per-(actor, skill) breakdowns. The matrix here is
  per-skill aggregate; per-actor evaluation is a follow-up that piggy-backs
  on `.soc-actor-trust-tiers`.

## 7. References

- vision-doc 1.1.2 — security-team#16978
- conformance-matrix §1.1 + §7 (B9 row)
- `kbn-argus-trust-policy/src/gate.ts` — the spec/Liquid mirror pattern
  this RFC follows
- `soc-skill-metrics-roller.yaml` — the upstream rollup that feeds B9

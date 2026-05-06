# `.soc-skill-recommendations`

> **Owner:** `argus-governance` ·
> **Schema version:** 1 (introduced 2026-05-05) ·
> **Source workflow:**
> [`soc_skill_self_adjust.yaml`](../../../workflows/soc_skill_self_adjust.yaml) ·
> **Spec:**
> [`kbn-argus-tool-manifest/src/skill_health.ts`](../../../../x-pack/solutions/security/packages/kbn-argus-tool-manifest/src/skill_health.ts) ·
> **RFC:** [`rfcs/B9-skill-self-adjust.md`](../rfcs/B9-skill-self-adjust.md)

Per-skill health verdicts produced by the AutoDEX self-adjusting skills
loop (B9). Each row is a single decision against the latest
`.soc-skill-metrics` snapshot, with a verdict in
`{healthy, review, reprompt, demote, insufficient_data}` and a closed set
of recommended actions.

## Field reference

| Field | Type | Notes |
|---|---|---|
| `@timestamp` | `date` | When the verdict was produced. |
| `skill_id` | `keyword` | Skill identifier; matches `.soc-skill-metrics.skill_id`. Doc id equals `skill_id` so the latest verdict is upserted in place. |
| `verdict` | `keyword` | One of `healthy`, `review`, `reprompt`, `demote`, `insufficient_data`. |
| `reasons` | `keyword[]` | Human-readable rationale strings produced by the verdict matrix. |
| `recommended_actions` | `keyword[]` | Closed set: `log_only`, `open_review_case`, `reprompt_skill`, `demote_actor`, `freeze_skill`. |
| `metrics_snapshot.invocations_7d` | `integer` | Normalised invocation count fed into the matrix. |
| `metrics_snapshot.success_count_7d` | `integer` | |
| `metrics_snapshot.failure_count_7d` | `integer` | |
| `metrics_snapshot.success_rate_7d` | `float` | Always in `[0, 1]`. Re-derived from counts when the input field was missing or non-finite. |
| `metrics_snapshot.last_run_ts` | `date` | Last invocation observed before the verdict. |
| `thresholds_applied.*` | various | The exact thresholds used to produce this verdict — stamped on the doc so an audit can replay decisions without guessing. |
| `generated_by` | `keyword` | Always `soc_skill_self_adjust` for now; future MCP-side gate may emit `argus-mcp-server`. |
| `generated_at` | `date` | When the workflow / gate produced the verdict. |
| `schema_version` | `integer` | Currently `1`. Bump on any field-shape change. |

## Verdict semantics

| Verdict | Meaning | Default actions |
|---|---|---|
| `insufficient_data` | Below `min_invocations_for_verdict`. | `log_only` |
| `healthy` | `success_rate_7d > floor_review`. | `log_only` |
| `review` | Rate at or below `floor_review`, but absolute failures too thin to demote / reprompt. | `open_review_case` |
| `reprompt` | Rate between floors with enough failure volume to justify a prompt-edit cycle. | `reprompt_skill`, `open_review_case` |
| `demote` | Rate at or below `floor_demote` with enough failures. The producing actor should be demoted one tier. | `demote_actor`, `open_review_case` |

The matrix is conservative: when in doubt, **review** — AutoDEX
governance prefers a human-surfaced review over an irreversible
auto-demote. Auto-demotion only fires when both signal-volume *and*
signal-strength clear the bar.

## Drift / migration history

| Date | Change | Owner |
|---|---|---|
| 2026-05-05 | Initial schema (B9). | argus-governance |

## How to query

```bash
# All current verdicts
GET .soc-skill-recommendations/_search

# Just demote-tier verdicts (operator response queue)
GET .soc-skill-recommendations/_search
{ "query": { "term": { "verdict": "demote" } } }

# Per-skill latest decision (doc id is skill_id, so just GET it)
GET .soc-skill-recommendations/_doc/argus.assess_cve
```

## Relationship to other indices

- **Reads** `.soc-skill-metrics` (input).
- **Writes** to itself.
- **Future readers**: trust-tier assessor (will demote actors on
  `verdict=demote`), ARGUS Console Skills panel (renders verdict per row),
  MCP admission gate (pre-rejects skill calls when `verdict=demote`).

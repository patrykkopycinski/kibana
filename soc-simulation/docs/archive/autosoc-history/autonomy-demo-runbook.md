# Autonomous SOC — Demo Runbook

End-to-end demo script showing how a Caldera attack propagates through the
autonomy-first loop: **detect → tune → backtest → auto-apply → observe → rollback**.

Every step includes (a) what the human operator sees, (b) what the system is
doing underneath, and (c) the backing query you can re-run live.

---

## Environment

| Component | URL | Credentials |
|-----------|-----|-------------|
| Elasticsearch | `http://localhost:19200` | `elastic` / `changeme` |
| Kibana | `http://localhost:15601` | `elastic` / `changeme` |
| Autonomous SOC dashboard | `http://localhost:15601/app/security/autonomous_soc` | same |
| Caldera (attack generator) | `http://localhost:8888` | admin / admin |

Demo data is already seeded (59 recommendations, 77 backtests, 140 autonomy
decisions, 35 snapshots, 6 trust scores). To reseed from scratch:

```bash
cd soc-simulation
python3 scripts/seed/seed_autonomy_demo.py \
  --es-url http://localhost:19200 \
  --es-user elastic --es-pass changeme
```

---

## The Story Arc (10 minutes, 6 beats)

| Beat | Tab | Story | Duration |
|------|-----|-------|----------|
| 1. Caldera fires | (Caldera UI) | An Active Directory enumeration op lands on a lab endpoint. | 45s |
| 2. Detection | Overview | Alert appears; triage agent classifies as TP. | 1m |
| 3. Proposal | Recommendations | `soc-signal-quality-agent` proposes threshold raise with structured patch. | 1m |
| 4. Backtest | **Autonomy Feed** | Backtester returns `projection_safe` (68% FP reduction, 96% TP preservation). | 1m |
| 5. Auto-apply | **Autonomy Feed** | Applier gate cascade passes; rule updated in Kibana without human click. | 2m |
| 6. Observer rollback | **Autonomy Feed** | On a separate rule, observer detects TP regression and auto-reverts. | 2m 30s |
| Closing | **Autonomy Feed** | Per-agent trust table; `experimental-tuner-v3` is quarantined. | 1m 45s |

---

## Beat 1 — Caldera Fires an Attack

**What the operator sees:**
A Caldera operation ("AD Enum — T1018") is launched against a Windows
endpoint in the GCE lab fleet. Adversary runs `net view`, `nltest`, and a
handful of `Get-ADComputer` cmdlets.

**What the system is doing:**
Elastic Agent on the endpoint ships events. The `Windows — Net view` and
`Suspicious AD discovery via PowerShell` rules fire.

**Live check:**

```bash
curl -u elastic:changeme \
  "http://localhost:19200/.siem-signals-*/_count?q=rule.name:*AD*Enum*"
```

---

## Beat 2 — AutoSOC Detects and Classifies

**What the operator sees:**
Open `http://localhost:15601/app/security/autonomous_soc` → **Overview** tab.
New entries in "Triage Results" with classification `TRUE_POSITIVE`, MITRE
technique `T1018`, confidence 0.88.

**What the system is doing:**
`soc-triage-agent` reads signals, attaches MITRE mapping, and writes to
`.soc-triage-results`. Output flows through `soc-meta.yaml`, which can emit
`mutation_intent` for detection engineering.

**Live check:**

```bash
curl -u elastic:changeme \
  "http://localhost:19200/.soc-triage-results/_search?size=3&sort=@timestamp:desc" \
  -H 'Content-Type: application/json' -d '{"_source": ["@timestamp","triage_output"]}'
```

---

## Beat 3 — Signal Quality Agent Proposes a Rule Patch

**What the operator sees:**
**Recommendations** tab shows a new item:
`mutation_intent` · artifact_type `rule` · action `raise_threshold` ·
source agent `soc-signal-quality-agent` · track `agentic` · status
`pending_backtest`.

The recommendation card contains the **structured patch**:

```json
{
  "patch_fields": {"threshold": 5},
  "current_values": {"threshold": 3},
  "impact_prediction": {
    "expected_fp_reduction_pct": 70,
    "expected_tp_impact": "preserve"
  }
}
```

**What the system is doing:**
- Agent called with prompt that mandates emitting a structured patch (no free-form text instructions).
- Document written to `.soc-recommendations` and goes through
  `soc-mutation-intent-envelope-validator` ingest pipeline. Anything malformed
  would land in `.soc-dead-letter` (94 such docs this week — validator working).

**Live check:**

```bash
curl -u elastic:changeme "http://localhost:19200/.soc-recommendations/_search?size=1&sort=@timestamp:desc" \
  -H 'Content-Type: application/json' \
  -d '{"query":{"bool":{"must":[{"term":{"type":"mutation_intent"}},{"term":{"details.artifact_type":"rule"}}]}}}'
```

---

## Beat 4 — Backtester Projects Impact

Switch to the **Autonomy Feed** tab. This is the autonomy-first story in one place.

**What the operator sees:**
- "Recent backtest verdicts" panel shows a new row:
  - Verdict: `projection_safe`
  - FP reduction: 68%
  - TP preserved: 96%
  - Reason: "Historical outcomes show the higher threshold would have dropped 17/25 known-FP hits and kept 24/25 known-TP hits."
- Decision feed receives a new row with status `auto_apply_ready` and a `backtest: projection_safe` badge.

**What the system is doing:**
`soc-rule-backtester.yaml` ran when the recommendation hit `pending_backtest`.
It pulls historical alert + outcome data from `.soc-outcomes`, applies the
proposed patch mathematically, computes the delta, and writes a verdict to
`.soc-backtests`. The recommendation's status is promoted to
`auto_apply_ready`.

**Live check:**

```bash
curl -u elastic:changeme \
  "http://localhost:19200/.soc-backtests/_search?size=1&sort=@timestamp:desc"
```

Aggregate for the demo opener:

```bash
curl -u elastic:changeme "http://localhost:19200/.soc-backtests/_search?size=0" \
  -H 'Content-Type: application/json' -d '{
  "aggs": {
    "by_verdict": {"terms": {"field": "verdict"}},
    "avg_fp_reduction": {"avg": {"field": "metrics.delta.fp_reduction_pct"}},
    "avg_tp_preserve": {"avg": {"field": "metrics.delta.tp_preservation_pct"}}
  }
}'
```

Expected: avg FP reduction ~61%, avg TP preservation ~94%, 39 safe / 10
concerning / 4 unsafe.

---

## Beat 5 — Applier Auto-Applies

**What the operator sees:**
Within seconds, the decision feed row transitions:
`auto_apply_ready` → `applying` → `applied`
with a green `auto-applied` badge. The KPI cards at the top update: **Applied
autonomously** ticks up, **Auto-apply rate** inches higher. Zero clicks.

Switch over to **Security → Detection rules** and find the rule — the threshold
field shows the new value (5 instead of 3).

**What the system is doing (gate cascade):**

1. **`backtest_required`** — passes (verdict exists and is not unsafe).
2. **`backtest_verdict`** — passes (`projection_safe`).
3. **`drift_check`** — applier-agent reads live rule state, compares to
   `current_values` in the intent; no drift → pass.
4. **`trust_tier`** — agent is `trusted` → pass.
5. **Snapshot** — immutable copy of the pre-patch rule written to
   `.soc-snapshots`.
6. **Apply** — structured `patch_fields` merged into the rule via Kibana
   detection-rules API.
7. **Decision row** — full envelope written to `.soc-autonomy-decisions` (data
   stream, `op_type: create`).

**Live check:**

```bash
curl -u elastic:changeme \
  "http://localhost:19200/.soc-autonomy-decisions/_search?size=1&sort=@timestamp:desc" \
  -H 'Content-Type: application/json' \
  -d '{"query":{"term":{"final_status":"applied"}}}'
```

Aggregate for the KPI card:

```bash
curl -u elastic:changeme "http://localhost:19200/.soc-autonomy-decisions/_search?size=0" \
  -H 'Content-Type: application/json' -d '{
  "query": {"range": {"@timestamp": {"gte": "now-7d"}}},
  "aggs": {
    "auto_applied": {"filter": {"term": {"auto_applied": true}}},
    "human_review": {"filter": {"term": {"required_human": true}}},
    "total": {"value_count": {"field": "rec_id"}}
  }
}'
```

Expected talking point: **97.5% of decisions did not require human review**.

---

## Beat 6 — Observer Detects Regression and Auto-Rolls-Back

Switch to a prepared scenario where a prior applied patch over-tuned a rule
(TP rate dropped). The observer catches it on the next cadence.

**What the operator sees:**
- Decision feed row for the original apply now shows `rolled_back` badge.
- A new `post_apply_tp_regression` entry in the "Why did the system stop?" panel
  (left side of the feed page).
- "Auto-rolled back by observer" KPI increments.

**What the system is doing:**
- `soc-post-apply-observer.yaml` runs every 5 minutes.
- For each `applied` decision in the last window, it compares post-apply KPIs
  against the snapshot baseline (from `.soc-snapshots`): alert volume, TP rate
  from `.soc-outcomes`, confidence drift.
- Regression detected → call Kibana detection-rules API with the snapshot
  payload → restore original threshold.
- Write a new decision document with `final_status: rolled_back` and
  `first_failing_gate: post_apply_tp_regression`.
- Flag the source agent in `.soc-trust-scores` as a negative signal.

**Live check:**

```bash
curl -u elastic:changeme \
  "http://localhost:19200/.soc-autonomy-decisions/_search?size=5&sort=@timestamp:desc" \
  -H 'Content-Type: application/json' \
  -d '{"query":{"term":{"final_status":"rolled_back"}}}'
```

---

## Closing Beat — Trust Calibration

Still on **Autonomy Feed**. Scroll to the **Per-agent trust tiers** table.

**What the operator sees:**

| Agent | Tier | Score | Rollbacks 24h |
|-------|------|-------|---------------|
| `soc-signal-quality-agent` | trusted | 0.94 | 0 |
| `soc-triage-agent` | probationary | 0.81 | 0 |
| `soc-deteng-agent` | probationary | 0.78 | 1 |
| `soc-meta-agent` | observing | 0.62 | 1 |
| `experimental-tuner-v3` | **quarantined** | 0.35 | 3 |

**Narrative:**
The experimental agent accumulated 3 rollbacks, score dropped below the
quarantine threshold, and it is now **blocked from auto-apply entirely**. Every
future intent it emits routes to `pending_review`. This happened with no human
gatekeeping — the system caught and isolated its own unreliable component.

**Live check:**

```bash
curl -u elastic:changeme "http://localhost:19200/.soc-trust-scores/_search?size=20&sort=@timestamp:desc" \
  -H 'Content-Type: application/json' \
  -d '{"query":{"term":{"scope":"per_agent"}}}'
```

---

## Fallback Scripts (if live beat fails)

If Caldera or a workflow is slow, switch to prerecorded narrative from the
already-seeded data:

1. Open the **Autonomy Feed** tab directly.
2. Point at the "6 auto-rolled back by observer" KPI: *"In the last 7 days the
   system caught and reverted 6 bad changes without a human in the loop."*
3. Point at "Blocked at gate: 7" and the gate breakdown: *"These are the
   specific autonomy exits — trust tier too low, drift detected, backtester
   vetoed. Every decision is visible and reproducible."*
4. Open `soc-simulation/docs/autonomy-first-verification-2026-04-17.html` in a
   browser tab — every number in that report is pulled live from the cluster.

---

## What Makes This Demo Valuable

- **No click-through theater.** The dashboard is read-only; the system does
  not wait for you.
- **Numbers are reproducible.** Every KPI on every panel maps to one of the
  curl queries above.
- **Safety is first-class.** Rollbacks are a feature, not an embarrassment —
  they prove the observer is working.
- **Trust is measured.** An agent misbehaving is contained automatically; the
  operator's job is to monitor, not to gate.

---

## Appendix — Artifact Map

| Wave 1 primitive | Path | Role |
|---|---|---|
| Schema | `soc-simulation/setup/index_templates/soc-autonomy-decisions.json` | Gate-decision audit trail (data stream) |
| Schema | `soc-simulation/setup/index_templates/soc-backtests.json` | Backtest verdict archive |
| Schema | `soc-simulation/setup/index_templates/soc-snapshots.json` | Pre-mutation artifact snapshots |
| Schema | `soc-simulation/setup/index_templates/soc-trust-scores.json` | Per-agent trust history |
| Schema | `soc-simulation/setup/index_templates/soc-recommendations.json` | `mutation_intent` source of truth |
| Pipeline | `soc-simulation/setup/ingest_pipelines/soc-mutation-intent-envelope-validator.json` | Write-time schema enforcement |
| Workflow | `soc-simulation/workflows/soc-rule-backtester.yaml` | Projects impact of rule patches |
| Workflow | `soc-simulation/workflows/soc-autonomous-applier.yaml` | Gate cascade + apply |
| Workflow | `soc-simulation/workflows/soc-post-apply-observer.yaml` | Rollback watchdog |
| Workflow | `soc-simulation/workflows/soc-trust-scorer.yaml` | Per-agent trust computation |
| Agent | `soc-simulation/agents/soc-autonomous-applier-agent.json` | Executes the patch (drift-check + merge) |
| Agent | `soc-simulation/agents/soc-signal-quality-agent.json` | Emits structured rule patches |
| UI | `x-pack/solutions/security/plugins/security_solution/public/autonomous_soc/pages/autonomy_feed_panel.tsx` | In-Kibana Autonomy Feed |
| Seeder | `soc-simulation/scripts/seed/seed_autonomy_demo.py` | Reproducible demo data |
| Report | `soc-simulation/docs/autonomy-first-verification-2026-04-17.html` | Standalone verification artifact |
| Runbook | `soc-simulation/docs/autonomy-demo-runbook.md` | This file |

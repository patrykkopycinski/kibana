# ARGUS Demo Runbook — End-to-End

A concrete, step-by-step runbook for driving the ARGUS Phase 2 + Phase 3 demo
against a local Kibana + Elasticsearch stack. This is the companion of
[`demo-storyboard.md`](./demo-storyboard.md) — the storyboard is what the
audience sees; this runbook is what the demo operator types.

Everything here is reproducible from a seeded dataset. If any step produces a
different output than is documented, treat the difference as a defect and fix
it before the live demo.

> **Drift notice (2026-04-20).** This runbook was walked end-to-end on the
> autonomous-soc-simulation worktree and updated against the current state of
> `soc-simulation/`. The most material corrections vs. earlier revisions are
> (a) stack ports are `19200` / `15601` over HTTP, not `9220` / `5620` over
> HTTPS; (b) workflows are triggered by UUID with
> `POST /api/workflows/workflow/{id}/run`, not by slug with `/api/workflows/run`;
> (c) the Frontier Simulator writes to the corpus `-live` sidecar and the
> audit trail, not to `logs-*`; (d) Phase 3 outputs land in `.soc-intel-feed`
> / `.soc-autonomy-decisions` / `.soc-outcomes` / `.soc-recommendations`, not
> in `.soc-intel-adapters` or `.soc-playbook-learnings`; (e) Kibana's bulk
> workflow import drops the `name:` field from some YAMLs, leaving them as
> "Untitled workflow" and **disabled** (see §11 for the workaround).

## 0. Prerequisites

| Requirement | Command | Verification |
|---|---|---|
| Kibana + Elasticsearch running | — | `curl -u elastic:$ES_PASS http://localhost:19200/_cluster/health` returns `"status":"green"` or `"yellow"` |
| ARGUS stack bootstrapped | `./soc-simulation/setup.sh` | Last line prints `Setup complete` |
| Detection rules loaded | (included in `setup.sh`) | `GET kbn:/api/detection_engine/rules/_find?per_page=1` returns ≥ 1 rule |
| `.soc-*` index templates installed | (included in `setup.sh`) | `GET .soc_detection_eval-runs` returns the index (auto-created on first write) |
| Labelled corpus seeded | (included in `setup.sh`, pulls from `scripts/argus-variant-bank/`) | `GET .soc-eval-corpus-argus-corpus-mythos-2026-04/_count` returns ≥ 13 |
| ARGUS Console imported | (included in `setup.sh`) | Kibana → Dashboards → "ARGUS Console — Mythos-Resilience Invariants" |
| (Optional) ARGUS React app-route | `argusConsoleEnabled: true` in Kibana config | Kibana side-nav → Security → **ARGUS**; deep-links from alert flyouts |

Set the environment variables used by the commands below. The local
`docker-compose.yml` exposes Elasticsearch on `19200` and Kibana on `15601`
**over HTTP** (no TLS); the canonical `9200`/`5601` ports are deliberately
avoided so the demo stack can coexist with a dev Kibana.

```bash
export ES_URL=http://localhost:19200
export ES_USER=elastic
export ES_PASS=changeme
export KBN_URL=http://localhost:15601
export KBN_USER=elastic
export KBN_PASS=changeme
```

Every Kibana call below includes the required headers:

```
-H 'kbn-xsrf: true'
-H 'Elastic-Api-Version: 2023-10-31'
```

## 1. Sanity-check the seeded corpus (30 s)

```bash
curl -s -u "$ES_USER:$ES_PASS" \
  "$ES_URL/.soc-eval-corpus-argus-corpus-mythos-2026-04/_search?size=0" \
  -H 'Content-Type: application/json' \
  -d '{"aggs":{"by_primitive":{"terms":{"field":"_argus.primitive_id"}}}}' \
  | jq '.aggregations.by_primitive.buckets'
```

Expect at minimum the three canonical buckets `T1003.001`, `T1059.001`,
`T1071.004`. The current seeded corpus carries additional buckets
(`T1068`, `T1059.003`, `T1219` and friends) — any superset is fine, the
Detection Eval Vertical only grades the rules registered in
`kbn-evals-suite-argus-detection`.

## 2. Run the Detection Eval Vertical (M2.1) — CLI path

This is the fastest way to drive evaluation without booting Scout/Playwright.
Same core logic as the Playwright suite; shared code lives in
`x-pack/solutions/security/packages/kbn-evals-suite-argus-detection/src/`.

`@kbn/babel-register` is a CommonJS `require`-hook; invoke it with
`--require` (not `--import`, which is ESM-only) and include the explicit
`.js` extension so Node resolves the published bundle:

```bash
cd /path/to/kibana

node --require @kbn/babel-register/install.js \
  x-pack/solutions/security/packages/kbn-evals-suite-argus-detection/scripts/run_detection_eval.ts \
  --es-url  "$ES_URL" \
  --es-user "$ES_USER" \
  --es-pass "$ES_PASS" \
  --corpus-id argus-corpus-mythos-2026-04
```

**Expected output (last lines):**

```
[info] argus-detection-vertical run complete
[info]   run_id=<uuid>
[info]   rows=<rule-count>
[info]   gate_decisions={"pass":<n>,"marginal":<n>,"fail":<n>}
```

The *shape* of the output is stable, but the concrete gate-decision mix
changes as the corpus grows and rules evolve. On the 2026-04 seeded corpus
a healthy run should produce **at least one** `pass` verdict and zero
hard infrastructure errors (`rows=0` or ES connection failures are the
only unconditional red flags). A run where every rule evaluates `fail`
with zero recall usually means a corpus/rule mismatch — re-run `setup.sh`
and re-seed the corpus before investigating the rules themselves.

The CLI writes one document per rule into `.soc_detection_eval-runs`. Confirm:

```bash
curl -s -u "$ES_USER:$ES_PASS" \
  "$ES_URL/.soc_detection_eval-runs/_search?size=3&sort=@timestamp:desc" \
  -H 'Content-Type: application/json' \
  | jq '.hits.hits[]._source | {rule_id, gate_decision, scores}'
```

If you prefer the Playwright/Scout path:

```bash
node scripts/scout run-tests \
  --arch stateful --domain classic \
  --config x-pack/solutions/security/packages/kbn-evals-suite-argus-detection/evals/detection_rule_vertical.spec.ts
```

## 3. Drive the Frontier Simulator (M2.4)

The frontier simulator picks a random variant from the seeded corpus and
re-emits it into the corpus `-live` sidecar index, so the detection pipeline
sees a live stream of Mythos-tier behaviour without tripping Elasticsearch's
read-from-the-corpus / write-back-to-the-corpus loop check.

Kibana's workflow run API is **UUID-addressed**, not slug-addressed, and the
route is `POST /api/workflows/workflow/{id}/run`. Resolve the UUID first:

```bash
FRONTIER_ID=$(curl -s -u "$KBN_USER:$KBN_PASS" \
  -H 'kbn-xsrf: true' -H 'Elastic-Api-Version: 2023-10-31' \
  "$KBN_URL/api/workflows?size=200" \
  | jq -r '.results[] | select(.name | startswith("SOC ARGUS — Frontier Simulator")) | .id')
echo "$FRONTIER_ID"
```

Trigger a tick:

```bash
EXEC_ID=$(curl -s -u "$KBN_USER:$KBN_PASS" \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  -H 'Elastic-Api-Version: 2023-10-31' \
  -X POST "$KBN_URL/api/workflows/workflow/$FRONTIER_ID/run" \
  -d '{"inputs":{}}' \
  | jq -r '.workflowExecutionId')
echo "$EXEC_ID"
```

Confirm the execution completed:

```bash
curl -s -u "$KBN_USER:$KBN_PASS" \
  -H 'kbn-xsrf: true' -H 'Elastic-Api-Version: 2023-10-31' \
  "$KBN_URL/api/workflows/executions/$EXEC_ID" \
  | jq '{status, error, finishedAt}'
```

Verify a new emission landed with a recent timestamp. The simulator writes
to the corpus `-live` sidecar (**not** `logs-*`):

```bash
curl -s -u "$ES_USER:$ES_PASS" \
  "$ES_URL/.soc-eval-corpus-argus-corpus-mythos-2026-04-live/_search?size=1&sort=@timestamp:desc" \
  -H 'Content-Type: application/json' \
  | jq '.hits.hits[0]._source | {"@timestamp", _argus}'
```

The document's `_argus.emission_source` is `soc_argus_frontier_simulator` and
`_argus.is_simulation_emission` is `true`. A heartbeat row also lands in
`.soc-audit-trail` with `source: "soc_argus_frontier_simulator"`.

> If the workflow is disabled on your stack, first `PUT /api/workflows/{id}`
> with `{"enabled": true}` — fresh imports default to disabled.

## 4. Re-run the eval poller (soc_detection_eval)

`soc_detection_eval.yaml` polls `.soc_detection_eval-runs` every 2 minutes
and reconciles any unreconciled rows back onto `.soc-recommendations`,
emitting an ARGUS governance trace per reconciled run. Trigger it manually
to avoid waiting for the scheduler:

```bash
POLLER_ID=$(curl -s -u "$KBN_USER:$KBN_PASS" \
  -H 'kbn-xsrf: true' -H 'Elastic-Api-Version: 2023-10-31' \
  "$KBN_URL/api/workflows?size=200" \
  | jq -r '.results[] | select(.name == "SOC Detection Eval (ARGUS M2.1)") | .id')

curl -s -u "$KBN_USER:$KBN_PASS" \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  -H 'Elastic-Api-Version: 2023-10-31' \
  -X POST "$KBN_URL/api/workflows/workflow/$POLLER_ID/run" \
  -d '{"inputs":{}}'
```

Confirm that at least some rows are now marked reconciled (the count is
cumulative across reruns):

```bash
curl -s -u "$ES_USER:$ES_PASS" \
  "$ES_URL/.soc_detection_eval-runs/_count?q=reconciled:true"
```

## 5. Observe the reasoning-trace governance signal (M2.5)

Every decision now carries an `argus.*` block. Query the most recent
decisions and confirm the contract is populated:

```bash
curl -s -u "$ES_USER:$ES_PASS" \
  "$ES_URL/.soc-reasoning-trace/_search?size=5&sort=@timestamp:desc" \
  -H 'Content-Type: application/json' \
  | jq '.hits.hits[]._source | {agent_id, "argus.decision.kind": .argus.decision.kind, "argus.decision.confidence": .argus.decision.confidence, "argus.actor.trust_tier": .argus.actor.trust_tier}'
```

Expect `argus.decision.kind` values drawn from the open set
`{rule_eval, rule_update, rule_create, triage_verdict, reasoning_watchdog, …}`
— the exact mix depends on which workflows have fired. The ARGUS Console
dashboard aggregates this index under *ARGUS decisions — last 24h by kind*.

## 6. Open the ARGUS Console

Two surfaces now render the same underlying data — pick whichever best
matches the story you're telling.

### 6a. Classic dashboard (always available)

1. Kibana → Dashboards → **"ARGUS Console — Mythos-Resilience Invariants"**.
2. Confirm the four top-row metrics render:
   - **Latest eval — precision** (≥ 0.8 after step 2 on the seeded corpus)
   - **Latest eval — recall** (≥ 0.8)
   - **Variant coverage** (> 0)
   - **Gate pass-rate (24h)** (> 0)
3. Scroll to the **Recent detection-eval runs** table: each row shows
   `rule_id`, `gate_decision`, and the three score columns.
4. **ARGUS decisions — last 24h by kind** shows counts per
   `argus.decision.kind`. If the table is empty, no workflows have fired yet
   — trigger steps 3 and 4 again.
5. **Low-confidence decisions (<0.5)** should be empty on a healthy seeded
   run. Decisions appearing here are the human-in-the-loop queue.

### 6b. React app-route — `/app/security/argus` (behind `argusConsoleEnabled`)

When the `argusConsoleEnabled` experimental flag is on, the Security Solution
plugin mounts a dedicated **ARGUS** page at `/app/security/argus` that tells
the complete ARGUS story across a tab bar. Tabs are grouped into **read
surfaces** and **write surfaces**:

**Read surfaces**

- **Pulse** — cross-layer health summary, follows the global time picker.
  Includes a **Rollback MTTR (p50)** tile that reads live from
  `.soc-outcomes` via `/internal/security_solution/argus/governance_pulse`
  (see §6c).
- **Activity feed** — chronological stream of escalations / suppressions /
  mutation intents; each row deep-links to the matching reasoning or
  lineage.
- **Mutation lineage** — hand-rolled SVG graph of the mutation stages ARGUS
  traversed (primitive → variant → injection surface → verdict).
- **Reasoning drill-down** — ordered reasoning steps for an alert or run,
  including verdict, trust tier, and any `injection_surface_flags`.
- **Mutations** — ledger of per-mutation verdicts (applied / rolled back /
  blocked) with filter tabs and 24 h / 7 d time window toggle. Blocked
  mutations (`pending_review`) surface the Approve / Reject row-actions —
  see **write surfaces** below.
- **Exploit → Detection (E2D)** — full flow from ingested CVE through
  adapter, proposal, backtest, applied rule, and 24 h live hits.
- **Proposals** — Pareto-optimized rule candidates: chosen / frontier /
  dominated, each with a "dominated by X on axis Y" explanation.
- **Autonomy decisions** (Phase C) — recent auto-applied, deferred,
  required-human, rejected, and rolled-back decisions from
  `.soc-autonomy-decisions`.
- **Coverage gaps** (Phase C) — severity-classified detection-coverage
  gaps from `.soc-coverage-gaps` (occurrence × avg confidence).
- **Caldera queue** (Phase C) — live Caldera attack-command queue,
  seeded adversary profiles, and current difficulty level from
  `.soc-attack-commands`, `.soc-attack-profiles`, and
  `.soc-difficulty-state`.

**Write surfaces (Phase C)**

- **Kill-switch chip** in the console header — always-visible state from
  `.soc-kill-switch`. Clicking opens a confirmation modal; the UI applies
  the toggle optimistically and rolls back on failure. Every toggle
  appends an `.soc-audit-trail` row (actor, from/to, reason, correlation
  id).
- **Approve / Reject** row-actions on the Mutations tab — only visible
  for blocked mutations. Rejections require a reason. Optimistic UI with
  rollback on server failure. Approved mutations transition to
  `approved_by_human` in `.soc-recommendations`; rejections to
  `rejected_by_human`. Each action appends to `.soc-audit-trail`.

Write affordances (kill-switch, Approve / Reject) are gated in the UI on
`capabilities[siemV5].argus_all` and server-side on the
`securitySolution-argus_write` API capability, both added to the base
`siemV5` Kibana feature. Read-only users never see the write controls; a
forged client call without the API capability is rejected.

Enter the page from three places:

- **Side nav**: Security → **ARGUS** (the link is visible when the flag is
  on and the user has `siem.show`).
- **Deep-link with a subject**: `/app/security/argus?alert_id=<id>` or
  `?run_id=<id>` or `?rule_id=<id>` (mix-and-match — `alert_id` seeds both
  reasoning and lineage panels; `run_id` overrides reasoning; `rule_id`
  overrides lineage). Deep-linking to a specific tab is also supported
  via `?tab=mutations|e2d|proposals|autonomy|coverage|caldera`.
- **Alert flyout**: open any detection alert, click **Take action →
  Show ARGUS reasoning**. The action only appears for alerts (never for
  non-alert events) and is gated on the same experimental flag.

Server-side, both panels read from internal HTTP routes and the exact same
builder helpers exposed to the Agent Builder skill (see §12):

- `GET /internal/security_solution/argus/reasoning_chain?subject_kind=alert&subject_id=<id>`
- `GET /internal/security_solution/argus/mutation_lineage?subject_kind=alert&subject_id=<id>`

Sanity-check one of them against a real alert id:

```bash
ALERT_ID=$(curl -s -u "$ES_USER:$ES_PASS" \
  "$ES_URL/.alerts-security.alerts-*/_search?size=1&sort=@timestamp:desc" \
  | jq -r '.hits.hits[0]._id')

curl -s -u "$KBN_USER:$KBN_PASS" \
  -H 'kbn-xsrf: true' -H 'Elastic-Api-Version: 2023-10-31' \
  "$KBN_URL/internal/security_solution/argus/reasoning_chain?subject_kind=alert&subject_id=$ALERT_ID" \
  | jq '{subject, verdict, trust_tier, steps: (.steps // [] | length), reason_code}'
```

An alert with no ARGUS run returns
`{"subject":..., "reason_code":"no_trace"}` — that's the expected degraded
payload the React panel renders as "No reasoning trace available".

### 6c. Governance signal — Rollback MTTR (R6)

ARGUS R6 closes the governance loop: every rolled-back mutation now produces
a time-to-rollback measurement that flows all the way to the Pulse tile.

The emission chain:

1. **`soc_recovery.yaml`** (10 min tick) — finds `.soc-recommendations` rows with
   `status: rolled_back` and `applied_at` set but no `rollback_mttr_emitted_at`.
   For each, computes `rolled_back_at - applied_at` via a painless one-liner and
   writes a deterministic `mttr-<rec_id>` row into `.soc-outcomes` carrying
   `rollback_mttr_ms`, `actor_id`, `rollback_reason`, and `false_positive`. The
   rec is stamped so the next tick is a no-op (idempotent by design).

2. **`soc_argus_trust_tier_assessor.yaml`** (1h tick) — aggregates
   `rollback_mttr_ms` per actor into `.soc-actor-trust-tiers.metrics` as
   `avg_rollback_mttr_ms`, `p50_rollback_mttr_ms`, and `p95_rollback_mttr_ms`
   alongside the existing rollback_rate / fp_ratio signals.

3. **`/internal/security_solution/argus/governance_pulse`** — tenant-wide
   aggregation of the same field over the time-picker window.

4. **Pulse tile** — renders `p50` as the headline, with `count · avg · p95` in
   the subline. Tone degrades `success → warning → danger` at 1 min / 5 min
   thresholds.

Verify the chain end-to-end:

```bash
# Force a recovery tick (triggers MTTR emission for any rolled-back recs).
RECOVERY_ID=$(curl -s -u "$KBN_USER:$KBN_PASS" -H 'kbn-xsrf: true' \
  -H 'Elastic-Api-Version: 2023-10-31' \
  "$KBN_URL/api/workflows?size=200" \
  | jq -r '.results[] | select(.name == "SOC Recovery") | .id')

curl -s -u "$KBN_USER:$KBN_PASS" -X POST -H 'kbn-xsrf: true' \
  -H 'Content-Type: application/json' -H 'Elastic-Api-Version: 2023-10-31' \
  "$KBN_URL/api/workflows/workflow/$RECOVERY_ID/run" -d '{}'

# Confirm MTTR outcomes exist in .soc-outcomes.
curl -s -u "$ES_USER:$ES_PASS" \
  "$ES_URL/.soc-outcomes/_search?size=3" \
  -H 'Content-Type: application/json' \
  -d '{"query":{"bool":{"filter":[{"term":{"rolled_back":true}},{"exists":{"field":"rollback_mttr_ms"}}]}},"sort":[{"@timestamp":"desc"}]}' \
  | jq '.hits.hits[]._source | {actor_id, rec_id, rollback_mttr_ms, rollback_reason, "@timestamp"}'

# Sanity-check the governance-pulse route the Pulse tile reads from.
curl -s -u "$KBN_USER:$KBN_PASS" -H 'kbn-xsrf: true' \
  -H 'Elastic-Api-Version: 2023-10-31' \
  "$KBN_URL/internal/security_solution/argus/governance_pulse?window_start=now-7d&window_end=now" \
  | jq
```

Expected pulse payload (cold start returns `rollback_mttr: null`):

```json
{
  "window_start": "now-7d",
  "window_end": "now",
  "rollback_mttr": {
    "rollback_count": 4,
    "avg_ms": 52134,
    "p50_ms": 41200,
    "p95_ms": 128050
  }
}
```

Open `/app/security/argus` and the Pulse panel should now show a
**Rollback MTTR (p50)** tile alongside the existing six tiles. Hover the tile
to see the full emission chain in the tooltip.

## 7. End-to-end demo beats

Drive the demo in this order so the Console lights up naturally:

1. **Open the ARGUS Console.** If you have the React app-route, open
   `/app/security/argus` and leave it on the Pulse panel — panels populate
   from the seeded data and the audience sees green metrics immediately.
   Otherwise open the classic dashboard (§6a).
2. **Step 3** (Frontier Simulator) — explain M2.4: "A Mythos-tier adversary
   never replays the same trick twice. Every tick, the frontier simulator
   draws a fresh variant from the labelled corpus."
3. **Step 2** (Detection Eval Vertical) — explain M2.1: "Every rule change
   now has a gate verdict before it can ship. Here is the precision / recall
   / variant-coverage cascade, deterministic, reproducible, test-covered."
4. **Step 4** (eval poller) — explain the reconciliation loop: "The gate
   verdict lands on the recommendation, and the autonomous-applier picks it
   up only if `status=auto_apply_ready`."
5. **Step 5** (governance trace) — explain M2.5: "Every agent decision is
   attributable to an agent, a decision kind, and a trust tier. Here is the
   audit trail a CISO can hand to an auditor."
6. Open a seeded alert, click **Take action → Show ARGUS reasoning**, and
   close on the React app-route's reasoning drill-down: the audience sees
   the *same* payload an autonomous agent reasons over (§12).

## 8. Reset between demos

```bash
./soc-simulation/teardown.sh --hard
./soc-simulation/setup.sh
```

`--hard` drops every `.soc-*` index, forces the index templates to reapply,
and re-seeds the labelled corpus from `scripts/argus-variant-bank/`. Plan for
~90 s between teardown and a fully-ready stack.

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `curl: (7) Failed to connect` on `$KBN_URL` | Kibana container exited (watch for OOM on the first bootstrap) | `docker compose -f soc-simulation/docker-compose.yml up -d kibana` then poll `GET $KBN_URL/api/status` until `available` |
| `curl: (35) SSL_ERROR_SYSCALL` or `Connection refused` on `9200` / `5601` | You're hitting the canonical ports, not the demo ports | Use `19200` / `15601` over HTTP (see §0) |
| Kibana workflow run returns `404 Not Found` | You passed a slug (`"workflow_id"`) to the old `/api/workflows/run` route | Resolve the UUID and use `POST /api/workflows/workflow/{uuid}/run` (see §3) |
| `jq: Cannot iterate over null` listing workflows | You used `?limit=`; the API expects `?size=` | Use `?size=200` |
| CLI runner exits with `ERR_MODULE_NOT_FOUND` on `@kbn/babel-register/install` | You used `--import` (ESM) or dropped the `.js` suffix | Use `--require @kbn/babel-register/install.js` (see §2) |
| CLI runner exits with `loadCorpusLabels found zero documents` | Corpus index empty | Re-run `setup.sh` to re-ingest the variant bank |
| Gate pass-rate is `0` | No eval runs in the last 24h | Trigger step 2; wait for the poller or trigger step 4 |
| ARGUS Console panels are empty (dashboard) | Data views missing | `GET kbn:/api/data_views` should include `.soc-reasoning-trace`, `.soc_detection_eval-runs`, `.soc-eval-corpus-*`; re-run `setup.sh` if missing |
| React app-route link not visible in side nav | `argusConsoleEnabled` flag off or user lacks `siem.show` | Enable the flag in `kibana.yml`: `xpack.securitySolution.enableExperimental: ['argusConsoleEnabled']` and re-login |
| Eval poller reports "0 new eval-run row(s)" | All runs already reconciled | Trigger step 2 again to create new rows |
| `argus.decision.confidence` missing on a span | Workflow used an older template | Re-run `setup.sh` to re-apply the `.soc-reasoning-trace` index template and regenerate traces |

## 10. Phase 3 — Adaptive ARGUS demo

Phase 3 turns ARGUS from a static gate into an adaptive system. Four
workflows and one new intel index drive the loop; all are demo-ready
locally and surface in the ARGUS Console.

> **Naming note.** Kibana's bulk workflow import currently drops the `name:`
> field from some YAMLs, so the Drift Monitor and Intel Mythos Aggregator
> land as `Untitled workflow` with `enabled: false`. See §11 for a reliable
> import workaround; resolve UUIDs by inspecting the `yaml` of each
> "Untitled" row.

### 10.1 Seed the intel feed (M3 / intel ingestion)

The generic adapter upserts a bundled `intel-feed-seed.json` on first run so
the demo has Mythos-era intel immediately.

```bash
INTEL_ID=$(curl -s -u "$KBN_USER:$KBN_PASS" \
  -H 'kbn-xsrf: true' -H 'Elastic-Api-Version: 2023-10-31' \
  "$KBN_URL/api/workflows?size=200" \
  | jq -r '.results[] | select(.name | startswith("ARGUS Intel Adapter")) | .id')

curl -s -u "$KBN_USER:$KBN_PASS" \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  -H 'Elastic-Api-Version: 2023-10-31' \
  -X POST "$KBN_URL/api/workflows/workflow/$INTEL_ID/run" \
  -d '{"inputs":{"force_seed":true}}'
```

Verify rows landed in `.soc-intel-feed`:

```bash
curl -s -u "$ES_USER:$ES_PASS" \
  "$ES_URL/.soc-intel-feed/_search?size=0" \
  -H 'Content-Type: application/json' \
  -d '{"aggs":{"by_cve":{"terms":{"field":"reference.cve"}}}}' \
  | jq '.aggregations.by_cve.buckets'
```

Expect at least two CVEs (e.g. `CVE-2025-M1001`, `CVE-2025-M1002`) with
multiple rows each.

### 10.2 Aggregate the Mythos signal

```bash
AGG_ID=$(curl -s -u "$KBN_USER:$KBN_PASS" \
  -H 'kbn-xsrf: true' -H 'Elastic-Api-Version: 2023-10-31' \
  "$KBN_URL/api/workflows?size=200" \
  | jq -r '.results[] | select(.name | test("Intel Mythos Aggregator|Untitled"; "i")) | "\(.id) \(.name)"' \
  | grep -iE 'aggregator' | head -1 | awk '{print $1}')

curl -s -u "$KBN_USER:$KBN_PASS" \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  -H 'Elastic-Api-Version: 2023-10-31' \
  -X POST "$KBN_URL/api/workflows/workflow/$AGG_ID/run" \
  -d '{"inputs":{}}'
```

Check the per-CVE signal:

```bash
curl -s -u "$ES_USER:$ES_PASS" \
  "$ES_URL/.soc-intel-mythos-signals/_search?size=5&sort=mythos_signal:desc" \
  -H 'Content-Type: application/json' \
  | jq '.hits.hits[]._source | {cve_id, mythos_signal, evidence_count}'
```

Each CVE should carry a bounded `mythos_signal ∈ [0, 1]` and a positive
`evidence_count`. The console's **Top CVEs by Mythos signal** panel reads
this index directly.

### 10.3 Drive the drift monitor

The drift monitor scans `.soc_detection_eval-runs` for rule-level eval-score
drift and `.soc-actor-trust-tiers` for actor-trust trajectory, then files a
`mutation_intent` rec for any entity that moved past its threshold.

```bash
DRIFT_ID=$(curl -s -u "$KBN_USER:$KBN_PASS" \
  -H 'kbn-xsrf: true' -H 'Elastic-Api-Version: 2023-10-31' \
  "$KBN_URL/api/workflows?size=200" \
  | jq -r '.results[] | select(.name | test("Drift Monitor|Untitled"; "i")) | .id' \
  | head -1)

curl -s -u "$KBN_USER:$KBN_PASS" \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  -H 'Elastic-Api-Version: 2023-10-31' \
  -X POST "$KBN_URL/api/workflows/workflow/$DRIFT_ID/run" \
  -d '{"inputs":{}}'
```

Inspect any intents it filed (cooldown-gated, so may be empty on a fresh
stack):

```bash
curl -s -u "$ES_USER:$ES_PASS" \
  "$ES_URL/.soc-recommendations/_search?size=5&sort=@timestamp:desc&q=source:soc_argus_drift_monitor" \
  | jq '.hits.hits[]._source | {title, status, "origin": .argus.origin, "drift": .argus.drift}'
```

### 10.4 Drive the playbook learner

Correlates outcomes + autonomy decisions + post-apply observations per
(technique, playbook_step) pair against the static mapping in
`soc-simulation/argus/technique-playbook-mapping.json`. It writes across
four indices — `.soc-autonomy-decisions`, `.soc-outcomes`,
`.soc-post-apply-observations`, and `.soc-recommendations`.

```bash
LEARNER_ID=$(curl -s -u "$KBN_USER:$KBN_PASS" \
  -H 'kbn-xsrf: true' -H 'Elastic-Api-Version: 2023-10-31' \
  "$KBN_URL/api/workflows?size=200" \
  | jq -r '.results[] | select(.name | startswith("ARGUS Playbook Learner")) | .id')

curl -s -u "$KBN_USER:$KBN_PASS" \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  -H 'Elastic-Api-Version: 2023-10-31' \
  -X POST "$KBN_URL/api/workflows/workflow/$LEARNER_ID/run" \
  -d '{"inputs":{}}'
```

```bash
curl -s -u "$ES_USER:$ES_PASS" \
  "$ES_URL/.soc-recommendations/_search?size=5&sort=@timestamp:desc&q=source:soc_argus_playbook_learner" \
  | jq '.hits.hits[]._source | {title, status, "patch": .details.patch}'
```

### 10.5 Phase 3 panel walk-through

On the classic ARGUS Console, scroll past Phase 2 to the **Phase 3 —
Adaptive ARGUS** banner:

- **Drift intents (24h)** / **Playbook remap intents (24h)** — the two
  adaptive loops' output volume; each should increment after steps 10.3
  and 10.4.
- **Intel rows (14d)** — non-zero after step 10.1.
- **Top CVEs by Mythos signal** — per-CVE signal ranking from step 10.2.
- **Recent drift & playbook mutation intents** — one row per adaptive-loop
  rec; `status` = `eval_requested` until the recommender re-evaluates.
- **Actor trust-tier distribution** — frontier-tier actors are the only
  cohort whose outcomes feed the playbook learner; this panel surfaces
  how many exist.

### 10.6 Demo beats (Phase 3)

After the Phase 2 beats (section 7), extend the narrative:

1. **Step 10.1** — "ARGUS now ingests Mythos-era intel through a feed
   abstraction. The generic adapter has seed data today; swapping in a
   Glasswing TAXII poller is a drop-in addition."
2. **Step 10.2** — "The aggregator turns per-row intel into a bounded
   per-CVE signal. The same `mythos_signal` contract that M2.3 consumes
   from Shadow-AI also has a CVE-level complement from feeds."
3. **Step 10.3** — "The drift monitor catches rule precision decaying
   under adversary mutation and files a `mutation_intent` for
   re-evaluation — no human hand on the keyboard."
4. **Step 10.4** — "The playbook learner is the feedback arrow — when a
   (technique, step) pair underperforms on frontier-tier outcomes, ARGUS
   remaps it to a safer candidate."
5. **Close** on the Phase 3 panels (or, if using the React app-route, on
   the **Mutation lineage** panel with a recent drift intent in view).
   The adaptive loops are how ARGUS stays ahead of a Mythos-tier adversary
   that changes the game every day.

## 11. Re-importing workflows manually

Kibana's `POST /api/workflows?overwrite=true` expects a `{ "workflows": [
{ "yaml": "<yaml>" }, … ] }` payload. If some workflows land as
"Untitled workflow" with `enabled: false` after a bootstrap, import them
one-by-one with the expected envelope:

```bash
for f in \
  soc-simulation/workflows/soc_argus_drift_monitor.yaml \
  soc-simulation/workflows/soc_argus_playbook_learner.yaml \
  soc-simulation/workflows/soc_argus_intel_adapter_generic.yaml \
  soc-simulation/workflows/soc_argus_intel_mythos_aggregator.yaml; do
  python3 -c "
import json, sys
with open('$f') as fh: y = fh.read()
print(json.dumps({'workflows': [{'yaml': y}]}))" > /tmp/payload.json

  curl -s -u "$KBN_USER:$KBN_PASS" \
    -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
    -H 'Elastic-Api-Version: 2023-10-31' \
    -X POST "$KBN_URL/api/workflows?overwrite=true" \
    -d @/tmp/payload.json \
    | jq -c '{id: (.workflows[0].id // "err"), name: (.workflows[0].name // "err"), err: (.error // null)}'
done
```

Then flip any freshly-created workflows to `enabled`:

```bash
curl -s -u "$KBN_USER:$KBN_PASS" \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  -H 'Elastic-Api-Version: 2023-10-31' \
  -X PUT "$KBN_URL/api/workflows/<id>" \
  -d '{"enabled":true}'
```

## 12. Agent-native parity — `security.argus.explain_decision`

Any reasoning chain a human can inspect in the React app-route is also
addressable by an autonomous agent via the Agent Builder skill
`security.argus.explain_decision` (gated on the same
`argusConsoleEnabled` flag). The skill delegates to the same
`fetchReasoningChain` helper that backs the internal HTTP route, so UI
and agent payloads never diverge.

Typical prompt for the ARGUS agent:

> "Why did ARGUS escalate alert `<alert_id>`? Return the reasoning chain."

The agent returns the ordered reasoning steps, verdict, trust tier, and
any `injection_surface_flags` — exactly the payload rendered in the
**Reasoning drill-down** panel. This is the parity guarantee:
every explanation surfaced to a human is, by construction, legible to
an agent.

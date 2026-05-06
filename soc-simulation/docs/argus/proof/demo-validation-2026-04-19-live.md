# ARGUS — Live End-to-End Demo Validation (2026-04-19)

> Supersedes the mirror-mode proof in
> [`demo-validation-2026-04-17.md`](./demo-validation-2026-04-17.md). That
> run was forced through CLI mirrors because the Kibana Workflows runtime
> executor was not reachable on the local build. This run is a **true
> runtime execution**: every workflow below was triggered through
> `POST /api/workflows/{id}/run`, the workflow engine scheduled and
> advanced the steps, and the results were captured back from
> `.workflows-executions` (and from the side-effects the workflows wrote
> into Elasticsearch).
>
> Driver: [`soc-simulation/scripts/argus_live_demo.sh`](../../../scripts/argus_live_demo.sh)
> Log bundle: `.soc-runtime-logs/argus-live-demo-20260419-212003/`
>
> Kibana: `http://localhost:15601` · ES: `http://localhost:19200` · single branch.

---

## 1. Summary

| | Value |
|---|---|
| Workflows triggered | **8** |
| Workflows completed (`status=completed`, `error=null`) | **8** |
| Workflows failed / other | **0** |
| Wall-clock span | `2026-04-19T19:20:15.369Z` → `2026-04-19T19:22:05.496Z` (≈1m50s) |
| Driver exit code | `0` |

Every ARGUS-owned workflow in the active demo set executed end-to-end on
the runtime. Runtime itself is no longer a demo risk — downgrading
`G-demo-1` from P0 in
[`capability-and-gap-analysis.md`](../capability-and-gap-analysis.md).

---

## 2. Per-workflow verbatim results

All eight rows below were copy-pasted from the live-demo driver output
and cross-checked against the archived `exec_*.json` pulls from
`.workflows-executions`.

### 2.1 SOC ARGUS — Arm Mythos-Class Preset
```
wid=workflow-d95fae9e-375e-4dc3-9a28-5a28d7901d23
trigger HTTP=200
exec=838770d2-181c-4fb0-8270-be986625ec95
status=completed started=2026-04-19T19:20:15.369Z finished=2026-04-19T19:20:15.602Z duration=233 error=None
steps=6
  - verify_profile_seeded          type=elasticsearch.request  status=completed
  - gate_profile_found             type=console                status=completed
  - if_arm_attack_command          type=if                     status=completed
  - arm_attack_command             type=elasticsearch.index    status=completed
  - audit_arm                      type=elasticsearch.index    status=completed
  - log_done                       type=console                status=completed
```
Side-effect: `.soc-difficulty-state.preset_armed = "level-6"`, a pending
attack command is queued, and an `argus_preset_armed` audit event
landed.

### 2.2 SOC ARGUS — Frontier Simulator (M2.4)
```
wid=workflow-78bf010b-e86c-4827-aa0c-7cfdf72c5a7f
trigger HTTP=200
exec=fe29d4f0-8445-486b-89e4-78e9f21977c8
status=completed started=2026-04-19T19:20:35.329Z finished=2026-04-19T19:20:35.676Z duration=347 error=None
stepExecutionIds=8   # preset_state, gate_preset_armed, pick_variant_when_armed,
                     # pick_variant, emit_variant, heartbeat, log_done, skipped_heartbeat
```
Verified emission landed in the sibling live-emissions index:

```json
GET /.soc-eval-corpus-argus-corpus-mythos-2026-04-live/_search?size=1
{
  "_id": "1776626435-T1003.001",
  "_source": {
    "@timestamp": "2026-04-19T21:20:35Z",
    "host":  { "name": "win-argus-03" },
    "event": { "action": "process-started" },
    "_argus": {
      "corpus_id": "argus-corpus-mythos-2026-04",
      "primitive_id": "T1003.001",
      "expected_rule_ids": ["mythos.cred-dumping.lsass"],
      "variant_axis": "process_ancestry",
      "mutation_axes": ["process_ancestry"],
      "variant_index": 0,
      "should_fire": true,
      "is_simulation_emission": true,
      "source": "soc_argus_frontier_simulator",
      "emission_id": "1776626435-T1003.001"
    }
  }
}
```
> Nested ECS objects (`host`, `event`, `_argus`) round-tripped intact.
> This confirms the `_reindex`+inline-Painless emitter is a drop-in
> replacement for the earlier `elasticsearch.index` step that was
> losing nested objects to Liquid stringification.

Audit heartbeat written:

```json
{ "@timestamp": "2026-04-19T21:20:35Z",
  "event_type": "argus_frontier_simulator_tick",
  "source": "soc_argus_frontier_simulator",
  "primitive_id": "T1003.001",
  "emission_id": "1776626435-T1003.001" }
```

### 2.3 ARGUS Exploit-to-Detection Reconciler (M2.2)
```
wid=workflow-369b6c28-fa8b-48c1-9fb6-0b131ed35351
trigger HTTP=200
exec=50a614e3-fb14-4612-9e00-25d12d254343
status=completed started=2026-04-19T19:20:55.354Z finished=2026-04-19T19:20:55.485Z duration=131 error=None
steps=9
  - fetch_synthesized_advisories  type=elasticsearch.search  status=completed
  - promote_to_detected           type=foreach               status=completed
  - fetch_detected_advisories     type=elasticsearch.search  status=completed
  - reflect_eval_verdict          type=foreach               status=completed
  - find_linked_rec               type=elasticsearch.search  status=completed
  - has_linked_rec_gate           type=console               status=completed
  - if_update_advisory_with_eval  type=if                    status=completed
  - heartbeat                     type=elasticsearch.index   status=completed
  - log_done                      type=console               status=completed
```

### 2.4 SOC Detection Eval (ARGUS M2.1)
```
wid=workflow-4b60bfe0-7908-4c5f-9200-eb6dc6940a70
trigger HTTP=200
exec=3dbaacdc-1dc0-43da-9d51-7cb85416c71f
status=completed started=2026-04-19T19:21:15.337Z finished=2026-04-19T19:21:15.416Z duration=79 error=None
steps=4
  - fetch_new_eval_runs  type=elasticsearch.request  status=completed
  - reconcile            type=foreach                status=completed
  - heartbeat            type=elasticsearch.index    status=completed
  - log_done             type=console                status=completed
```
> `fetch_new_eval_runs` was migrated from `elasticsearch.search` to
> `elasticsearch.request` so the object-form `sort` on `@timestamp` and
> the `must_not: term.reconciled` clause go to ES as raw JSON — the
> engine's `.search` schema had been rejecting both.

### 2.5 ARGUS Trust Tier Assessor (Phase 3)
```
wid=workflow-3f1d283b-aa8f-476b-a161-a22f73d5102f
trigger HTTP=200
exec=c223f72e-37f0-45f9-8f22-c67e6e562175
status=completed started=2026-04-19T19:21:25.353Z finished=2026-04-19T19:21:25.478Z duration=125 error=None
stepExecutionIds=5   # discover_actors, actors_gate, process_actors (guarded),
                     # heartbeat, log_done
```
> The `actors_gate`+`if` guard added in this cycle prevents the
> previous `"Foreach expression … resolved to undefined"` runtime fault
> when `aggregations.actors.buckets` is absent on cold clusters.

### 2.6 ARGUS Trust Gate (Phase 3)
```
wid=workflow-19d49383-5b6d-4ebc-803c-beed71763a3a
trigger HTTP=200
exec=a276cb02-00dd-4696-9254-c0e0fd5c5682
status=completed started=2026-04-19T19:21:35.349Z finished=2026-04-19T19:21:35.454Z duration=105 error=None
steps=4
  - fetch_candidates    type=elasticsearch.search  status=completed
  - gate_each_rec       type=foreach               status=completed
  - heartbeat           type=elasticsearch.index   status=completed
  - log_done            type=console               status=completed
```

### 2.7 ARGUS Demo 1 Runner — Same-day CVE → Detection
```
wid=workflow-5377d223-f07e-4f36-a507-85ac3cbc713b
trigger HTTP=200
exec=208a7441-8236-4fca-b82b-2292479cf2d4
status=completed started=2026-04-19T19:21:55.365Z finished=2026-04-19T19:21:55.551Z duration=186 error=None
steps=11
  - fetch_demo_advisory             type=elasticsearch.search   status=completed
  - precondition_gate               type=console                status=completed
  - if_log_precondition_missing     type=if                     status=completed
  - if_fetch_e2d_heartbeat          type=if                     status=completed
  - fetch_e2d_heartbeat             type=elasticsearch.request  status=completed
  - if_fetch_trust_gate_heartbeat   type=if                     status=completed
  - fetch_trust_gate_heartbeat      type=elasticsearch.request  status=completed
  - if_fetch_scenario_recommendation type=if                    status=completed
  - fetch_scenario_recommendation   type=elasticsearch.request  status=completed
  - heartbeat                       type=elasticsearch.index    status=completed
  - log_done                        type=console                status=completed
```
> Runner now **observes** the M2.2 reconciler and the Phase-3 trust
> gate via their `.soc-audit-trail` heartbeats instead of trying to
> resolve them by display name through `workflow.execute`. The demo
> driver is responsible for kicking the upstream workflows explicitly,
> which is exactly what this run does at 19:20:55 (E2D) and 19:21:35
> (trust gate).

### 2.8 ARGUS Demo 2 Runner — Polymorphic Variant Swarm
```
wid=workflow-2c10c045-419a-4c44-9113-3e86d41b1876
trigger HTTP=200
exec=1d1a9111-b017-4316-a1cc-dc55998b022c
status=completed started=2026-04-19T19:22:05.355Z finished=2026-04-19T19:22:05.496Z duration=141 error=None
stepExecutionIds=7   # fetch_latest_eval_run, fetch_variant_count, fetch_e2d_heartbeat,
                     # compute_swarm_score, heartbeat, log_done, (plus one audit write)
```

---

## 3. Cross-check: audit trail + live emissions

Direct ES queries against the live cluster (authoritative ground truth,
not demo-driver output):

### 3.1 ARGUS heartbeats in the last 30 minutes
```
GET /.soc-audit-trail/_search
{ "query": { "bool": { "filter": [
    { "prefix": { "event_type": "argus_" } },
    { "range":  { "@timestamp": { "gte": "now-30m" } } }
] } } }
→ 61 hits
```
Most recent events:

| `@timestamp` | `event_type` | `source` |
|---|---|---|
| 2026-04-19T21:22:35.797Z | `argus_detection_eval_tick`        | `soc_detection_eval`            |
| 2026-04-19T21:22:35.795Z | `argus_trust_gate_tick`            | `soc_argus_trust_gate`          |
| 2026-04-19T21:22:05.355Z | `argus_demo_run`                   | `soc_demo_2_runner`             |
| 2026-04-19T21:21:55.365Z | `argus_demo_run`                   | `soc_demo_1_runner`             |
| 2026-04-19T21:21:45.416Z | `argus_exploit_to_detection_tick`  | `soc_argus_exploit_to_detection`|
| 2026-04-19T21:21:35.349Z | `argus_trust_gate_tick`            | `soc_argus_trust_gate`          |
| 2026-04-19T21:21:25.353Z | `argus_trust_tier_assessor_tick`   | `soc_argus_trust_tier_assessor` |
| 2026-04-19T21:21:15.337Z | `argus_detection_eval_tick`        | `soc_detection_eval`            |
| 2026-04-19T21:20:56.117Z | `argus_exploit_to_detection_tick`  | `soc_argus_exploit_to_detection`|
| 2026-04-19T21:20:55.354Z | `argus_exploit_to_detection_tick`  | `soc_argus_exploit_to_detection`|
| 2026-04-19T21:20:35Z     | `argus_frontier_simulator_tick`    | `soc_argus_frontier_simulator`  |

Both demo runners' `argus_demo_run` heartbeats are present with the
correct `source`, and every upstream ARGUS workflow they observe has a
matching heartbeat within the same minute — i.e. the orchestration
chain closed without manual intervention.

### 3.2 Live emissions index
```
GET /.soc-eval-corpus-argus-corpus-mythos-2026-04-live/_count → { "count": 1 }
```
The single document is the emission shown in §2.2 above. The sibling
index pattern avoids Elasticsearch's `"reindex cannot write into an
index its reading from"` guard — the Detection Eval suite already
queries both `.soc-eval-corpus-argus-corpus-mythos-2026-04` **and**
`.soc-eval-corpus-argus-corpus-mythos-2026-04-live` because they share
the `_argus.corpus_id` tag.

---

## 4. Changes since the 2026-04-17 mirror-mode run

| File | Why the change was required |
|---|---|
| `soc_argus_frontier_simulator.yaml` | Replaced `elasticsearch.index` emitter with a `_reindex + inline Painless` step so nested ECS fields (`host`, `process`, `event`) stop being Liquid-stringified. Added dedicated `emissions_index` (`…-live`) to sidestep ES's read-from/write-to same-index guard. `refresh=true` (not `wait_for`). |
| `soc_detection_eval.yaml` | Migrated `fetch_new_eval_runs` to `elasticsearch.request` so object-form `sort: [{ "@timestamp": { order: asc } }]` and `must_not: term.reconciled` go through raw — the engine's `.search` schema was rejecting both. |
| `soc_argus_trust_tier_assessor.yaml` | Added `actors_gate` + `if` guard around the `process_actors` foreach; previously failed at runtime with `"Foreach expression … resolved to undefined"` when `aggregations.actors.buckets` was absent on a cold cluster. |
| `soc_argus_trust_gate.yaml` | `find_actor_tier` → `elasticsearch.request` to use object-form `sort: [{ "@timestamp": { order: desc } }]`. |
| `soc_demo_1_runner.yaml` | Removed the two `workflow.execute` calls (engine could not resolve targets by display name reliably). Runner now **observes** the E2D and trust-gate heartbeats; driver kicks the workflows explicitly. `fetch_scenario_recommendation` → `elasticsearch.request`. |
| `soc_demo_2_runner.yaml` | Same observer-pattern refactor for the E2D dependency. `fetch_latest_eval_run` → `elasticsearch.request`. |
| `soc-triage.yaml` | *(Historical.)* Removed empty `consts:` block that failed YAML schema validation. The `soc-triage` workflow was later removed; triage is handled by `soc_alert_sweeper.yaml`. |
| `scripts/argus_live_demo.sh` | Removed `SOC Triage` from the live-demo target list — it is not an ARGUS workflow, depends on a live Inference connector, and stalls the driver when triggered without real alert input. Documented inline. |

Schema/runtime discrepancy summary: any step that needs object-form
`sort` on `@timestamp`, or that writes via `_reindex` with an inline
Painless script, uses `elasticsearch.request` (raw HTTP to ES). The
higher-level `elasticsearch.search` / `elasticsearch.index` steps are
retained wherever their schemas accept the payload, because they play
better with the Workflows UI.

---

## 5. Repro

From a clean `yarn kbn bootstrap` + running ES (9.2 snapshot) + Kibana
(local build exposing the Workflows runtime):

```bash
# 1) seed all ARGUS state
./soc-simulation/setup.sh

# 2) reinstall the eight demo YAMLs in-place (idempotent PUT by ID)
python3 /tmp/update_wf.py        # script referenced above; uses /api/workflows/workflow/{id}

# 3) trigger the full ARGUS demo end-to-end
bash ./soc-simulation/scripts/argus_live_demo.sh

# 4) inspect runtime logs
ls .soc-runtime-logs/argus-live-demo-20260419-212003/
```

Expected terminal output (reproduced above) ends with:

```
=== Summary ===
completed=8 failed/other=0
```

---

## 6. What this proof covers — and what it doesn't

✅ Covered
- The ARGUS Workflows runtime can **create, schedule, advance, and
  complete** the entire ARGUS demo chain on a local stateful cluster.
- All eight ARGUS-owned demo workflows finish with `status=completed`
  and `error=null`.
- Nested-ECS polymorphic emissions are written correctly.
- Audit-trail heartbeats close the observation loop for both demo
  runners (`argus_demo_run` references valid upstream ticks in the same
  minute).
- Phase-3 trust policy gate runs without the cold-cluster regression.

⚠ Not covered by this run
- `SOC Triage` is executed by its own upstream (alert sweeper +
  inference connector), not by this driver — see the comment in
  `scripts/argus_live_demo.sh`.
- The M2.2 → M2.1 *closed-loop* (synthesized rule → re-run eval → flip
  advisory to `eval_pass`) is still open and tracked as P1 `G1` in
  `capability-and-gap-analysis.md`.
- Scenario-3 (frontier reasoning watchdog) remains a teaser; it uses
  the Mythos preset + frontier simulator shown here but has no
  dedicated watchdog workflow yet (`R10`).

This is the live replacement for §7 of `demo-validation-2026-04-17.md`.
The branch is now demo-ready against a real Workflows runtime.

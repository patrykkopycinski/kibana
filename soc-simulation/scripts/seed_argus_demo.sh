#!/usr/bin/env bash
#
# Seed the Argus Console demo data plane so every panel renders populated
# state end-to-end:
#
#   - Pulse panel: live "Rollback MTTR (p50)" tile
#     → requires `.soc-outcomes` docs with rolled_back=true + rollback_mttr_ms
#       in the last 24h.
#
#   - Mutation lineage panel (subject: rule:rule-soc-1024)
#     → requires a `.soc-mutation-intents` doc linking rule-soc-1024 → mut-intent-42
#       plus per-stage docs in .soc-detection-eval-runs, .soc-backtest-results,
#       .soc-recommendations, and .soc-outcomes keyed on mutation_intent_id.
#
#   - Reasoning drill-down panel (subject: run:run-7a3 and run:run-9c1)
#     → requires ordered span docs in `.soc-reasoning-trace` for each run_id.
#
# All subject ids here match the fixtures in
#   x-pack/solutions/security/packages/kbn-argus-console/src/hooks/use_activity_feed.ts
# so that clicking "Lineage" / "Reasoning" on the activity feed resolves to
# populated panels.
#
# Re-runnable: every doc is either upserted by a stable _id or appended to a
# data stream. Running twice produces idempotent state for the three demo
# subjects (rule-soc-1024, run-7a3, run-9c1) and a rolling MTTR window.
#
# Usage:
#   soc-simulation/scripts/seed_argus_demo.sh
#
# Env overrides:
#   ES_URL   (default http://localhost:19200)
#   ES_AUTH  (default elastic:changeme)

set -euo pipefail

ES_URL="${ES_URL:-http://localhost:19200}"
ES_AUTH="${ES_AUTH:-elastic:changeme}"

CURL=(curl -sS -u "${ES_AUTH}" -H 'Content-Type: application/json' -H 'Connection: close' --max-time 15)
# Bulk API calls use a different media type (application/x-ndjson); we can't
# just append another -H because curl would then send TWO Content-Type headers
# and ES rejects the request. This second array is identical except it never
# sets Content-Type globally, so the bulk-site can add its own header.
CURL_BULK=(curl -sS -u "${ES_AUTH}" -H 'Content-Type: application/x-ndjson' -H 'Connection: close' --max-time 30)

now_iso() {
  # ISO-8601 in UTC, second precision. `-u` is portable on macOS/BSD.
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

iso_minutes_ago() {
  # $1 = minutes ago (integer).
  local mins=$1
  # macOS (BSD) vs Linux date flags differ; handle both.
  if date -u -v-1M +"%Y-%m-%dT%H:%M:%SZ" >/dev/null 2>&1; then
    date -u -v-"${mins}"M +"%Y-%m-%dT%H:%M:%SZ"
  else
    date -u -d "${mins} minutes ago" +"%Y-%m-%dT%H:%M:%SZ"
  fi
}

iso_seconds_offset() {
  # $1 = seconds relative to now (can be negative).
  local secs=$1
  if date -u -v"${secs}"S +"%Y-%m-%dT%H:%M:%SZ" >/dev/null 2>&1; then
    date -u -v"${secs}"S +"%Y-%m-%dT%H:%M:%SZ"
  else
    date -u -d "${secs} seconds" +"%Y-%m-%dT%H:%M:%SZ"
  fi
}

echo "[argus-seed] ES: ${ES_URL}"

# ---------------------------------------------------------------------------
# 1. Ensure the two indices we need that don't exist yet.
#    (.soc-outcomes, .soc-reasoning-trace, .soc-detection-eval-runs,
#     .soc-recommendations, .soc-actor-trust-tiers all already exist.)
# ---------------------------------------------------------------------------

ensure_index() {
  local name=$1
  local body=$2
  local code
  code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "${ES_URL}/${name}")
  if [[ "${code}" == "200" ]]; then
    echo "[argus-seed] index ${name} already exists"
    return 0
  fi
  echo "[argus-seed] creating index ${name}"
  "${CURL[@]}" -X PUT "${ES_URL}/${name}" -d "${body}" >/dev/null
}

MUTATION_INTENTS_MAPPING='{
  "mappings": {
    "properties": {
      "@timestamp":         { "type": "date" },
      "mutation_intent_id": { "type": "keyword" },
      "rule_id":            { "type": "keyword" },
      "label":              { "type": "text" },
      "subtitle":           { "type": "text" },
      "status":             { "type": "keyword" },
      "metadata":           { "type": "object", "dynamic": true }
    }
  }
}'

BACKTEST_RESULTS_MAPPING='{
  "mappings": {
    "properties": {
      "@timestamp":         { "type": "date" },
      "mutation_intent_id": { "type": "keyword" },
      "rule_id":            { "type": "keyword" },
      "label":              { "type": "text" },
      "subtitle":           { "type": "text" },
      "status":             { "type": "keyword" },
      "metadata":           { "type": "object", "dynamic": true }
    }
  }
}'

ensure_index ".soc-mutation-intents"  "${MUTATION_INTENTS_MAPPING}"
ensure_index ".soc-backtest-results"  "${BACKTEST_RESULTS_MAPPING}"

# ---------------------------------------------------------------------------
# 2. Demo-subject stage docs (mutation_intent_id = mut-intent-42,
#    rule_id = rule-soc-1024).
# ---------------------------------------------------------------------------

MUTATION_INTENT_ID="mut-intent-42"
RULE_ID="rule-soc-1024"

T_SYNTHESIS=$(iso_minutes_ago 180)
T_EVAL=$(iso_minutes_ago 175)
T_BACKTEST=$(iso_minutes_ago 170)
T_APPLY=$(iso_minutes_ago 120)
T_OBSERVE=$(iso_minutes_ago 60)
NOW=$(now_iso)

echo "[argus-seed] upserting mutation_intent ${MUTATION_INTENT_ID} (rule=${RULE_ID})"
# NOTE: governance_gate + actor + source_signal + proposed_rule_delta +
# backtest_preview + argus.* are what the Mutation Detail flyout reads
# for the "Governance gate", "Actor", "Source signal", "Proposed rule
# change", and "Backtest preview" sections. Keep them populated so the
# flagship demo subject renders fully rather than showing "—".
"${CURL[@]}" -X PUT "${ES_URL}/.soc-mutation-intents/_doc/${MUTATION_INTENT_ID}?refresh=true" -d "{
  \"@timestamp\":         \"${T_SYNTHESIS}\",
  \"mutation_intent_id\": \"${MUTATION_INTENT_ID}\",
  \"rule_id\":            \"${RULE_ID}\",
  \"label\":              \"Rule synthesis — Pareto-optimal candidate chosen\",
  \"subtitle\":           \"10 candidates · frontier=4 · weights p=0.45 r=0.35 fp=0.15 axis=0.05\",
  \"status\":             \"done\",
  \"actor_id\":           \"argus-orchestrator\",
  \"actor_trust_tier\":   \"trusted\",
  \"governance_gate\": {
    \"status\":    \"approved\",
    \"reason\":    \"eval + backtest clean; canary watch armed on FP surge\",
    \"policy_id\": \"policy-canary-watch-v2\",
    \"thresholds\": {
      \"min_precision\":        0.9,
      \"max_fp_rate\":          0.005,
      \"max_alerts_per_hour\":  200,
      \"canary_watch_minutes\": 60
    }
  },
  \"source_signal\": {
    \"type\":           \"exploit_advisory\",
    \"description\":    \"CVE-2026-12345 — PowerShell encoded-command abuse tied to LSASS credential dumping precursor\",
    \"evidence_count\": 14,
    \"first_seen\":     \"${T_SYNTHESIS}\"
  },
  \"proposed_rule_delta\": {
    \"change_type\":      \"tune\",
    \"mitre_technique\":  \"T1059.001\",
    \"severity_before\":  \"medium\",
    \"severity_after\":   \"high\",
    \"threshold_before\": 5,
    \"threshold_after\":  2,
    \"query_before\":     \"process.name:powershell.exe AND process.args:*\",
    \"query_after\":      \"process.name:powershell.exe AND process.args:*-EncodedCommand* AND host.os.type:windows\",
    \"rationale\":        \"Anchor on -EncodedCommand + windows hosts to cut FPs while preserving TP recall on encoded-PS precursors\"
  },
  \"backtest_preview\": {
    \"tp\":            38,
    \"fp\":            0,
    \"windows\":       30,
    \"precision\":     1.0,
    \"fp_rate\":       0.0,
    \"gate_decision\": \"pass\"
  },
  \"argus\": {
    \"actor\": {
      \"confidence_score\":  0.92,
      \"recent_mutations\":  12,
      \"trust_tier\":        \"trusted\"
    },
    \"pattern_id\":          \"pattern-encoded-ps-lsass\",
    \"procedure_clusters\":  [\"encoded-command-exec\", \"lsass-dump-precursor\"],
    \"coverage_delta\": {
      \"newly_covered_techniques\": [\"T1059.001\", \"T1003.001\"],
      \"newly_covered_procedures\": [\"encoded-ps-to-lsass\"],
      \"now_redundant_rule_ids\":   [\"rule-legacy-ps-noise\"],
      \"snapshot_ts\":              \"${T_SYNTHESIS}\"
    }
  },
  \"metadata\": {
    \"candidate_count\": 10,
    \"frontier_size\": 4,
    \"chosen\": { \"id\": \"c-07\", \"precision\": 0.93, \"recall\": 0.84, \"fp_rate\": 0.004 },
    \"axis_fn_mean\": 0.08,
    \"composition\": {
      \"must_anchor_subset\": [\"process.name\", \"process.command_line\"],
      \"wildcard_retention\": 0.3,
      \"minimum_should_match\": 2
    }
  }
}" >/dev/null

echo "[argus-seed] upserting eval run for ${MUTATION_INTENT_ID}"
"${CURL[@]}" -X PUT "${ES_URL}/.soc-detection-eval-runs/_doc/argus-demo-eval-${MUTATION_INTENT_ID}?refresh=true" -d "{
  \"@timestamp\":         \"${T_EVAL}\",
  \"mutation_intent_id\": \"${MUTATION_INTENT_ID}\",
  \"rule_id\":            \"${RULE_ID}\",
  \"label\":              \"Offline eval passed\",
  \"subtitle\":           \"PR@k=0.91 · recall=0.83 · fp_rate=0.004 on golden corpus\",
  \"status\":             \"done\",
  \"metadata\": {
    \"corpus_id\":      \"argus-corpus-mythos-2026-04\",
    \"precision\":       0.91,
    \"recall\":          0.83,
    \"fp_rate\":         0.004,
    \"true_positives\":  37,
    \"false_positives\": 1,
    \"false_negatives\": 7
  }
}" >/dev/null

echo "[argus-seed] upserting backtest for ${MUTATION_INTENT_ID}"
# 30-day backtest window used in the "Query that ran" + "Backtest samples"
# sections of the Mutation Detail flyout. Sample events are illustrative
# points from the FP/TP pools the rule would have matched; the UI surfaces
# them so reviewers can inspect *why* the backtester flagged a window.
BACKTEST_WINDOW_START=$(iso_seconds_offset $((-30 * 86400)))
BACKTEST_WINDOW_END="${T_BACKTEST}"
"${CURL[@]}" -X PUT "${ES_URL}/.soc-backtest-results/_doc/argus-demo-backtest-${MUTATION_INTENT_ID}?refresh=true" -d "{
  \"@timestamp\":         \"${T_BACKTEST}\",
  \"mutation_intent_id\": \"${MUTATION_INTENT_ID}\",
  \"rule_id\":            \"${RULE_ID}\",
  \"label\":              \"Historical backtest clean\",
  \"subtitle\":           \"30-day replay · 0 FPs on benign slice · 38/44 TPs recovered\",
  \"status\":             \"done\",
  \"windows_tested\":     30,
  \"true_positives\":     38,
  \"false_positives\":    0,
  \"precision\":          1.0,
  \"fp_rate\":            0.0,
  \"gate_decision\":      \"pass\",
  \"query\":              \"process.name:powershell.exe AND process.args:*-EncodedCommand* AND host.os.type:windows\",
  \"window_start\":       \"${BACKTEST_WINDOW_START}\",
  \"window_end\":         \"${BACKTEST_WINDOW_END}\",
  \"tp_samples\": [
    {
      \"event_id\":           \"bt-tp-${MUTATION_INTENT_ID}-1\",
      \"@timestamp\":         \"${BACKTEST_WINDOW_END}\",
      \"host_name\":          \"prod-dc-02\",
      \"user_name\":          \"svc-backup\",
      \"process_executable\": \"C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe\",
      \"command_line\":       \"powershell.exe -EncodedCommand JABhAD0AJwBoAG\",
      \"classification\":     \"tp\",
      \"reason\":             \"Matched encoded-PS precursor to LSASS dump seen on endpoint-27\"
    },
    {
      \"event_id\":           \"bt-tp-${MUTATION_INTENT_ID}-2\",
      \"@timestamp\":         \"${BACKTEST_WINDOW_END}\",
      \"host_name\":          \"dmz-web-05\",
      \"user_name\":          \"www-data\",
      \"process_executable\": \"powershell.exe\",
      \"command_line\":       \"powershell.exe -EncodedCommand ZQB4AHAAbABvAGkAdAA=\",
      \"classification\":     \"tp\",
      \"reason\":             \"Encoded payload pivot from web-shell RCE\"
    }
  ],
  \"fp_samples\": [],
  \"metadata\": {
    \"window_days\":   30,
    \"benign_events\": 1825432,
    \"false_positives\": 0,
    \"true_positives_recovered\": 38,
    \"true_positives_total\":     44
  }
}" >/dev/null

echo "[argus-seed] upserting apply recommendation for ${MUTATION_INTENT_ID}"
# `.soc-recommendations` ships with a `default_pipeline` that validates
# real mutation-intent envelopes and routes anything else to `.soc-dead-letter`.
# Our demo apply doc is a deliberately simplified stage marker, so we bypass
# the validator with `pipeline=_none`.
"${CURL[@]}" -X PUT "${ES_URL}/.soc-recommendations/_doc/argus-demo-apply-${MUTATION_INTENT_ID}?refresh=true&pipeline=_none" -d "{
  \"@timestamp\":         \"${T_APPLY}\",
  \"mutation_intent_id\": \"${MUTATION_INTENT_ID}\",
  \"rule_id\":            \"${RULE_ID}\",
  \"label\":              \"Canary applied\",
  \"subtitle\":           \"5% → 25% → 100% rollout · no guardrail breaches\",
  \"status\":             \"done\",
  \"type\":               \"rule_application\",
  \"metadata\": {
    \"strategy\": \"canary\",
    \"stages\": [
      { \"percent\": 5,   \"passed\": true },
      { \"percent\": 25,  \"passed\": true },
      { \"percent\": 100, \"passed\": true }
    ]
  }
}" >/dev/null

# ---------------------------------------------------------------------------
# 3. .soc-outcomes: observe + outcome stage for mut-intent-42, plus a rolling
#    MTTR window (5 rolled-back docs over the last 6 hours so the governance
#    pulse tile shows a meaningful p50/p95).
#
#    `.soc-outcomes` is a data stream, so we POST to /_doc (auto-create op).
# ---------------------------------------------------------------------------

echo "[argus-seed] writing observe/outcome + rollback MTTR window to .soc-outcomes"

# `.soc-outcomes` is a data stream — we can't PUT by _id, so to keep the
# script idempotent we first delete previously-seeded demo docs (our demo
# subject plus the rule-rollback-sample-* MTTR window).
"${CURL[@]}" -X POST "${ES_URL}/.soc-outcomes/_delete_by_query?refresh=true" -d '{
  "query": {
    "bool": {
      "should": [
        { "term":     { "mutation_intent_id": "mut-intent-42" } },
        { "prefix":   { "rule_id":            "rule-rollback-sample-" } }
      ],
      "minimum_should_match": 1
    }
  }
}' >/dev/null || true

# The observe/outcome stage doc for the demo subject. rolled_back=true so the
# lineage renders a rollback edge AND contributes to the pulse p50.
"${CURL[@]}" -X POST "${ES_URL}/.soc-outcomes/_doc?refresh=true" -d "{
  \"@timestamp\":           \"${T_OBSERVE}\",
  \"mutation_intent_id\":   \"${MUTATION_INTENT_ID}\",
  \"rule_id\":              \"${RULE_ID}\",
  \"label\":                \"Post-apply observation rolled back\",
  \"subtitle\":             \"FP spike detected at 60m mark · auto-rollback complete\",
  \"status\":               \"done\",
  \"rolled_back\":          true,
  \"rollback_mttr_ms\":     120000,
  \"applied_at\":           \"${T_APPLY}\",
  \"rolled_back_at\":       \"${T_OBSERVE}\",
  \"metadata\": {
    \"trigger\":        \"fp_rate_guardrail\",
    \"guardrail_value\": 0.012,
    \"guardrail_limit\": 0.010
  }
}" >/dev/null

# Four additional rollback outcomes spread over the last 6 hours so the
# p50/p95 tile has a stable, meaningful distribution.
MTTR_SAMPLES=(45000 90000 180000 240000)
MTTR_MINS=(30 90 210 330)

for i in "${!MTTR_SAMPLES[@]}"; do
  mttr_ms="${MTTR_SAMPLES[$i]}"
  mins_ago="${MTTR_MINS[$i]}"
  ts=$(iso_minutes_ago "${mins_ago}")
  applied_ts=$(iso_seconds_offset -$(( mins_ago * 60 + mttr_ms / 1000 )))
  rule_ref="rule-rollback-sample-${i}"
  mut_ref="mut-sample-${i}"

  "${CURL[@]}" -X POST "${ES_URL}/.soc-outcomes/_doc?refresh=true" -d "{
    \"@timestamp\":         \"${ts}\",
    \"mutation_intent_id\": \"${mut_ref}\",
    \"rule_id\":            \"${rule_ref}\",
    \"rolled_back\":        true,
    \"rollback_mttr_ms\":   ${mttr_ms},
    \"applied_at\":         \"${applied_ts}\",
    \"rolled_back_at\":     \"${ts}\",
    \"status\":             \"done\",
    \"label\":              \"Rollback sample ${i}\"
  }" >/dev/null
done

# ---------------------------------------------------------------------------
# 4. .soc-reasoning-trace — populate the two runs referenced by the activity
#    feed (run-7a3 for the mutation eval chain, run-9c1 for the governance
#    demotion).
#
#    `.soc-reasoning-trace` is a data stream, so we POST to /_doc for each
#    span. `step_index` drives the render order.
# ---------------------------------------------------------------------------

echo "[argus-seed] writing reasoning-trace spans for run-7a3 and run-9c1"

# `.soc-reasoning-trace` is a data stream, so we can't PUT by _id. Delete
# prior demo spans first to keep every re-run producing an exact 6+3 chain.
"${CURL[@]}" -X POST "${ES_URL}/.soc-reasoning-trace/_delete_by_query?refresh=true" -d '{
  "query": {
    "terms": { "run_id": ["run-7a3", "run-9c1"] }
  }
}' >/dev/null || true

write_span() {
  local payload=$1
  "${CURL[@]}" -X POST "${ES_URL}/.soc-reasoning-trace/_doc?refresh=true" -d "${payload}" >/dev/null
}

T7A3_BASE=$(iso_minutes_ago 175)
T7A3_S0=$(iso_seconds_offset -10500)  # -175m
T7A3_S1=$(iso_seconds_offset -10440)  # -174m
T7A3_S2=$(iso_seconds_offset -10380)
T7A3_S3=$(iso_seconds_offset -10320)
T7A3_S4=$(iso_seconds_offset -10260)
T7A3_S5=$(iso_seconds_offset -10200)

write_span "{
  \"run_id\":            \"run-7a3\",
  \"step_index\":        0,
  \"step_type\":         \"thought\",
  \"@timestamp\":        \"${T7A3_S0}\",
  \"actor_id\":          \"argus-orchestrator\",
  \"actor_trust_tier\":  \"trusted\",
  \"confidence\":        0.62,
  \"title\":             \"Evaluating alert alert-abc\",
  \"body\":              \"Suspicious process chain (powershell → rundll32 → msiexec) on endpoint-27. Exploit probability 0.83 puts this above the high-pressure threshold.\"
}"

write_span "{
  \"run_id\":            \"run-7a3\",
  \"step_index\":        1,
  \"step_type\":         \"tool_call\",
  \"@timestamp\":        \"${T7A3_S1}\",
  \"actor_id\":          \"argus-orchestrator\",
  \"actor_trust_tier\":  \"trusted\",
  \"tool_name\":         \"fetch_alert_context\",
  \"tool_args_ref\":     \"alert-abc\",
  \"title\":             \"fetch_alert_context(alert-abc)\",
  \"body\":              \"Pulling host, user, and process-chain context for alert-abc.\"
}"

write_span "{
  \"run_id\":            \"run-7a3\",
  \"step_index\":        2,
  \"step_type\":         \"tool_result\",
  \"@timestamp\":        \"${T7A3_S2}\",
  \"actor_id\":          \"argus-orchestrator\",
  \"actor_trust_tier\":  \"trusted\",
  \"tool_name\":         \"fetch_alert_context\",
  \"tool_result_ref\":   \"alert-context-abc\",
  \"title\":             \"context resolved\",
  \"body\":              \"Host endpoint-27 is production Windows server · user svc-backup · command-line contains -EncodedCommand payload matching known LSASS-dump precursor.\"
}"

write_span "{
  \"run_id\":            \"run-7a3\",
  \"step_index\":        3,
  \"step_type\":         \"thought\",
  \"@timestamp\":        \"${T7A3_S3}\",
  \"actor_id\":          \"argus-orchestrator\",
  \"actor_trust_tier\":  \"trusted\",
  \"confidence\":        0.81,
  \"confidence_delta\":  0.19,
  \"title\":             \"Pressure classified as high\",
  \"body\":              \"KEV hit + production host + encoded payload → eval-gated mutation is warranted. Generating 10 candidate rule variants (R3 Pareto synthesis).\"
}"

write_span "{
  \"run_id\":            \"run-7a3\",
  \"step_index\":        4,
  \"step_type\":         \"decision\",
  \"@timestamp\":        \"${T7A3_S4}\",
  \"actor_id\":          \"argus-orchestrator\",
  \"actor_trust_tier\":  \"trusted\",
  \"confidence\":        0.88,
  \"confidence_delta\":  0.07,
  \"title\":             \"Queue mutation_intent mut-intent-42\",
  \"body\":              \"Chose candidate c-07 (precision 0.93, recall 0.84, fp_rate 0.004) — dominated 6 candidates on weighted score, on Pareto frontier against 3 peers.\",
  \"source_doc_id\":     \"mut-intent-42\"
}"

write_span "{
  \"run_id\":            \"run-7a3\",
  \"step_index\":        5,
  \"step_type\":         \"recommendation\",
  \"@timestamp\":        \"${T7A3_S5}\",
  \"actor_id\":          \"argus-orchestrator\",
  \"actor_trust_tier\":  \"trusted\",
  \"confidence\":        0.9,
  \"title\":             \"Apply via canary 5% → 25% → 100%\",
  \"body\":              \"Eval PR@k=0.91 and backtest 0 FPs cleared all gates. Recommend canary rollout with automatic rollback on FP-rate guardrail.\",
  \"status\":            \"success\"
}"

T9C1_S0=$(iso_seconds_offset -3600)   # -60m
T9C1_S1=$(iso_seconds_offset -3570)
T9C1_S2=$(iso_seconds_offset -3540)

write_span "{
  \"run_id\":            \"run-9c1\",
  \"step_index\":        0,
  \"step_type\":         \"tool_call\",
  \"@timestamp\":        \"${T9C1_S0}\",
  \"actor_id\":          \"argus-governance\",
  \"actor_trust_tier\":  \"system\",
  \"tool_name\":         \"check_actor_trust\",
  \"tool_args_ref\":     \"m2.5-default\",
  \"title\":             \"check_actor_trust(m2.5-default)\",
  \"body\":              \"Running trust-tier check on external-observation contributor m2.5-default.\"
}"

write_span "{
  \"run_id\":            \"run-9c1\",
  \"step_index\":        1,
  \"step_type\":         \"decision\",
  \"@timestamp\":        \"${T9C1_S1}\",
  \"actor_id\":          \"argus-governance\",
  \"actor_trust_tier\":  \"system\",
  \"confidence\":        0.72,
  \"injection_surface_flags\": [
    { \"code\": \"system_prompt_mirror\", \"severity\": \"warn\",  \"reason\": \"Observation text echoed system-prompt tokens back into the eval window.\" },
    { \"code\": \"tool_name_injection\",  \"severity\": \"error\", \"reason\": \"Observation attempted to coerce tool name delete_index.\" }
  ],
  \"title\":             \"Injection surface flagged\",
  \"body\":              \"2 injection-surface signals detected in external observation. Trust drops below probationary floor.\"
}"

write_span "{
  \"run_id\":            \"run-9c1\",
  \"step_index\":        2,
  \"step_type\":         \"recommendation\",
  \"@timestamp\":        \"${T9C1_S2}\",
  \"actor_id\":          \"argus-governance\",
  \"actor_trust_tier\":  \"system\",
  \"confidence\":        0.86,
  \"title\":             \"Demote m2.5-default to quarantined\",
  \"body\":              \"Reject observation, demote actor from probationary → quarantined, flag run for human review.\",
  \"status\":            \"success\"
}"

# ---------------------------------------------------------------------------
# 7. Seed the canonical demo alert doc.
#
# Clicking "Lineage" or "Reasoning" on the activity-feed rows wired to
# alert-abc (evt-001, evt-002) fires the Argus backend routes with
# subject_kind=alert&subject_id=alert-abc. Both routes resolve that
# alert through `.alerts-security.alerts-*` and read the nested
# `kibana.alert.argus.{mutation_intent_id,rule_id,run_id}` keys to pivot
# into the mutation-lineage / reasoning-chain data plane.
#
# Without this doc, alert-subject clicks hit the "No lineage available /
# No mutation intent found for this subject" fallback even though the
# rest of the demo data is fully populated.
#
# The index is `dynamic: false` — we write the nested structure so that
# `_source` filtering with dot-notation paths hydrates correctly on read.
# ---------------------------------------------------------------------------

ALERT_ID="alert-abc"
ALERTS_INDEX=".internal.alerts-security.alerts-default-000001"

# Only seed if the concrete rollover index already exists; otherwise this is
# a fresh cluster without Detection Engine bootstrap and the demo alert lookup
# simply returns `reason_code: not_found`, which is acceptable.
code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "${ES_URL}/${ALERTS_INDEX}")
if [[ "${code}" == "200" ]]; then
  echo "[argus-seed] upserting demo alert ${ALERT_ID} into ${ALERTS_INDEX}"
  "${CURL[@]}" -X PUT "${ES_URL}/${ALERTS_INDEX}/_doc/${ALERT_ID}?refresh=true" -d "{
    \"@timestamp\": \"2026-03-14T12:00:00.000Z\",
    \"kibana\": {
      \"space_ids\": [\"default\"],
      \"alert\": {
        \"uuid\": \"${ALERT_ID}\",
        \"status\": \"active\",
        \"workflow_status\": \"open\",
        \"rule\": {
          \"uuid\": \"${RULE_ID}\",
          \"name\": \"[SOC-Sim] Mutation intent demo\"
        },
        \"argus\": {
          \"mutation_intent_id\": \"${MUTATION_INTENT_ID}\",
          \"rule_id\": \"${RULE_ID}\",
          \"run_id\": \"run-7a3\"
        }
      }
    }
  }" >/dev/null

  # ------------------------------------------------------------------
  # Post-apply observation alerts for mut-intent-42 (rolled-back demo).
  #
  # These fire inside `[T_APPLY, T_OBSERVE]` so the Mutation Detail
  # flyout's "Post-apply observation" section shows the FPs that tripped
  # the guardrail + the 1 TP that justified the original mutation. The
  # server helper `fetchPostApplyObservation` aggregates these by
  # `argus.classification.keyword` and surfaces the top sample events.
  #
  # We delete by intent id first so re-runs stay idempotent.
  # ------------------------------------------------------------------
  "${CURL[@]}" -X POST "${ES_URL}/${ALERTS_INDEX}/_delete_by_query?refresh=true" -d "{
    \"query\": {
      \"bool\": {
        \"should\": [
          { \"term\": { \"argus.mutation_intent_id\": \"${MUTATION_INTENT_ID}\" } },
          { \"term\": { \"argus.mutation_intent_id.keyword\": \"${MUTATION_INTENT_ID}\" } }
        ],
        \"minimum_should_match\": 1,
        \"must_not\": [ { \"term\": { \"kibana.alert.uuid\": \"${ALERT_ID}\" } } ]
      }
    }
  }" >/dev/null || true

  T_APPLY_PLUS_10=$(iso_seconds_offset -$(( 120 * 60 - 10 * 60 )))   # -110m
  T_APPLY_PLUS_25=$(iso_seconds_offset -$(( 120 * 60 - 25 * 60 )))   # -95m
  T_APPLY_PLUS_40=$(iso_seconds_offset -$(( 120 * 60 - 40 * 60 )))   # -80m
  T_APPLY_PLUS_55=$(iso_seconds_offset -$(( 120 * 60 - 55 * 60 )))   # -65m

  POST_APPLY_ALERTS=(
    "fp|pa-${MUTATION_INTENT_ID}-fp-1|${T_APPLY_PLUS_10}|noisy-admin-shell-01|svc-it-automation|C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe|powershell.exe -EncodedCommand BASE64AUTOMATION==|Scheduled IT automation matched by broadened -enc arg pattern"
    "fp|pa-${MUTATION_INTENT_ID}-fp-2|${T_APPLY_PLUS_25}|noisy-admin-shell-04|svc-backup|C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe|powershell.exe -EncodedCommand QmFja3VwRW5jb2RlZA==|Nightly backup using encoded-args — benign"
    "fp|pa-${MUTATION_INTENT_ID}-fp-3|${T_APPLY_PLUS_40}|jump-box-02|admin-richard|C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe|powershell.exe -EncodedCommand UGFja2FnZUluc3RhbGw=|Admin-orchestrated software push — matches known IT change CHG-00742"
    "tp|pa-${MUTATION_INTENT_ID}-tp-1|${T_APPLY_PLUS_55}|endpoint-27|svc-backup|C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe|powershell.exe -EncodedCommand TFNBU1NEdW1w|True positive — encoded LSASS-dump precursor, matches exploit"
  )

  for entry in "${POST_APPLY_ALERTS[@]}"; do
    classification="${entry%%|*}"; rest="${entry#*|}"
    alert_id="${rest%%|*}"; rest="${rest#*|}"
    ts="${rest%%|*}"; rest="${rest#*|}"
    host_name="${rest%%|*}"; rest="${rest#*|}"
    user_name="${rest%%|*}"; rest="${rest#*|}"
    process_exe="${rest%%|*}"; rest="${rest#*|}"
    cmd_line="${rest%%|*}"; rest="${rest#*|}"
    reason="${rest}"
    "${CURL[@]}" -X PUT "${ES_URL}/${ALERTS_INDEX}/_doc/${alert_id}?refresh=true" -d "{
      \"@timestamp\": \"${ts}\",
      \"host\":    { \"name\": \"${host_name}\" },
      \"user\":    { \"name\": \"${user_name}\" },
      \"process\": { \"executable\": \"${process_exe}\", \"command_line\": \"${cmd_line}\" },
      \"kibana\": {
        \"space_ids\": [\"default\"],
        \"alert\": {
          \"uuid\": \"${alert_id}\",
          \"status\": \"active\",
          \"workflow_status\": \"open\",
          \"rule\": {
            \"uuid\":    \"${RULE_ID}\",
            \"rule_id\": \"${RULE_ID}\",
            \"name\":    \"[SOC-Sim] Mutation intent demo\"
          },
          \"argus\": {
            \"mutation_intent_id\": \"${MUTATION_INTENT_ID}\",
            \"rule_id\":            \"${RULE_ID}\",
            \"classification\":     \"${classification}\",
            \"reason\":             \"${reason}\"
          }
        }
      },
      \"argus\": {
        \"mutation_intent_id\": \"${MUTATION_INTENT_ID}\",
        \"rule_id\":            \"${RULE_ID}\",
        \"classification\":     \"${classification}\",
        \"reason\":             \"${reason}\"
      }
    }" >/dev/null
  done
  echo "[argus-seed] wrote ${#POST_APPLY_ALERTS[@]} post-apply alerts for ${MUTATION_INTENT_ID}"
else
  echo "[argus-seed] skipping alert seed — ${ALERTS_INDEX} not present (status ${code})"
fi

# ---------------------------------------------------------------------------
# 8. Rich demo data — enough volume to populate every Pulse tile, the
#    activity feed filters (layers + pressure + actor + tier), and the
#    reasoning-drilldown subject picker with non-trivial chains.
#
#    Per-section counts (on a clean run):
#      .soc-mutation-intents   → 24 docs (mixed applied / blocked / drift)
#      .soc-outcomes           → 50 additional rollback MTTR samples
#      .soc-actor-trust-tiers  → 10 actors × 1 current tier
#      .soc-reasoning-trace    → 3 extra runs × 10 spans = 30 spans
#      .soc-detection-eval-runs→ 15 eval runs
#      .soc-backtest-results   → 15 backtest runs
#      .soc-recommendations    → 15 rule-application recommendations
#
#    Everything is idempotent: bulk payloads upsert by deterministic _id,
#    data streams are cleared by tag first.
# ---------------------------------------------------------------------------

echo "[argus-seed] generating rich demo volume"

# ----- 8a. 24 mutation intents with varied statuses -----------------------
#
# Spread across the last 24h so the `@timestamp` window catches every doc.
# Statuses:
#   - 14 `applied`   (contribute to mutation_throughput.applied / throughput)
#   -  6 `blocked`   (governance_gate.status=blocked → throughput.blocked)
#   -  4 `drift`     (drift_detected=true, 3 open + 1 resolved)

MUT_LABELS=(
  "Persistence via scheduled task"
  "DLL sideloading on signed binary"
  "Credential dumping via LSASS"
  "Suspicious powershell EncodedCommand"
  "SMB lateral via admin$ share"
  "OAuth consent phishing"
  "Kerberoasting via SPN enumeration"
  "Cloud IAM privilege escalation"
  "Suspicious rundll32 LoadLibrary"
  "Brute force on RDP endpoint"
  "Encoded cmd via wmic"
  "Azure AD risky sign-in"
  "GCP service-account key exfil"
  "S3 bucket made public"
  "Kubernetes pod breakout"
  "SMB signing disabled on server"
  "msiexec install from tmp path"
  "Unusual parent process for cmd"
  "Suspicious scheduled task creation"
  "DNS tunnel exfiltration"
  "ADFS token replay"
  "Okta session hijack"
  "CVE-2024-9999 exploit attempt"
  "Backdoor in pipeline artifact"
)

# We build bulk payloads as real NDJSON files — NOT as shell strings.
# `$(cat <<HEREDOC …)` strips trailing newlines, which silently collapses
# the action metadata line and the data line onto one line and causes ES
# to reject the whole batch with `Malformed action/metadata line`.
BULK_TMPDIR="$(mktemp -d -t argus-seed-bulk-XXXXXX)"
trap 'rm -rf "${BULK_TMPDIR}"' EXIT

# Helper: POST a bulk file and surface item-level errors. Many ingest
# setups keep HTTP 200 while rejecting individual items, so we have to
# peek at the response body.
post_bulk_file() {
  local label=$1
  local url=$2
  local file=$3
  local resp
  resp=$("${CURL_BULK[@]}" -X POST "${url}" --data-binary "@${file}")
  if [[ "${resp}" == *'"errors":true'* ]]; then
    echo "[argus-seed] ${label} bulk returned errors:" >&2
    echo "${resp}" | head -c 2000 >&2
    echo >&2
  fi
}

mutation_bulk_file="${BULK_TMPDIR}/mutation_intents.ndjson"
: >"${mutation_bulk_file}"

# Trust-tier roster — aligned with ACTOR_TIERS below so every flyout's
# Actor section agrees with the governance-pulse tier mix.
DEMO_TIERS=("system" "trusted" "trusted" "trusted" "trusted" "trusted" "probationary" "probationary" "untrusted" "quarantined")
DEMO_CONF_BP=(98 90 91 92 93 94 75 72 55 42)
DEMO_RECENT=(24 14 12 16 11 18 5 4 2 1)

# Policy catalogue for governance_gate.policy_id + matching reason. The
# "approved" and "blocked" branches pick from disjoint pools so a blocked
# sample doesn't claim a canary-watch policy that only applies post-apply.
DEMO_APPROVED_POLICIES=(
  "policy-canary-watch-v2"
  "policy-fp-guardrail-v3"
  "policy-precision-floor-v1"
  "policy-alert-volume-cap-v1"
)
DEMO_APPROVED_REASONS=(
  "eval + backtest clean; canary watch armed on FP surge"
  "FP rate below 0.005 guardrail on 30d backtest"
  "precision ≥ 0.9 cleared; recall trade-off within budget"
  "alert-volume cap within budget on production-shape traffic"
)
DEMO_BLOCKED_POLICIES=(
  "policy-precision-floor-v1"
  "policy-fp-guardrail-v3"
  "policy-coverage-regression-v1"
  "policy-actor-trust-v1"
)
DEMO_BLOCKED_REASONS=(
  "precision below 0.9 floor on golden corpus"
  "FP rate above 0.005 guardrail on 30d backtest"
  "would retire a rule still carrying unique coverage"
  "actor trust tier below threshold for auto-apply"
)

for i in "${!MUT_LABELS[@]}"; do
  mins_ago=$(( (i + 1) * 55 ))      # spread 24 docs over ~22h
  ts=$(iso_minutes_ago "${mins_ago}")
  mid=$(printf 'mut-demo-%03d' "${i}")
  rid=$(printf 'rule-soc-%04d' "$(( 2000 + i ))")
  label="${MUT_LABELS[$i]}"

  # Status distribution:
  #   indices  0..13  → applied        (14)
  #   indices 14..19  → blocked        ( 6)
  #   indices 20..22  → applied+drift_detected open   ( 3)
  #   index   23      → applied+drift_detected+resolved ( 1)
  if (( i < 14 )); then
    status="applied"
    gate_status="approved"
    drift_detected="false"
    drift_resolved="false"
  elif (( i < 20 )); then
    status="blocked"
    gate_status="blocked"
    drift_detected="false"
    drift_resolved="false"
  elif (( i < 23 )); then
    status="applied"
    gate_status="approved"
    drift_detected="true"
    drift_resolved="false"
  else
    status="applied"
    gate_status="approved"
    drift_detected="true"
    drift_resolved="true"
  fi

  actor_idx=$(( i % 10 ))
  actor_id=$(printf 'actor-%02d' "${actor_idx}")
  tier="${DEMO_TIERS[$actor_idx]}"
  conf_bp="${DEMO_CONF_BP[$actor_idx]}"
  recent="${DEMO_RECENT[$actor_idx]}"
  candidates=$(( 4 + i % 8 ))
  precision=$(( 80 + i % 15 ))
  fp_rate=$(( i % 9 ))

  if [[ "${gate_status}" == "blocked" ]]; then
    pol_idx=$(( i % 4 ))
    policy_id="${DEMO_BLOCKED_POLICIES[$pol_idx]}"
    gate_reason="${DEMO_BLOCKED_REASONS[$pol_idx]}"
  else
    pol_idx=$(( i % 4 ))
    policy_id="${DEMO_APPROVED_POLICIES[$pol_idx]}"
    gate_reason="${DEMO_APPROVED_REASONS[$pol_idx]}"
  fi

  printf '{"index":{"_id":"%s"}}\n' "${mid}" >>"${mutation_bulk_file}"
  printf '{"@timestamp":"%s","mutation_intent_id":"%s","rule_id":"%s","label":"%s","subtitle":"auto-generated demo mutation #%d","status":"%s","actor_id":"%s","actor_trust_tier":"%s","governance_gate":{"status":"%s","reason":"%s","policy_id":"%s","thresholds":{"min_precision":0.9,"max_fp_rate":0.005,"max_alerts_per_hour":200,"canary_watch_minutes":60}},"argus":{"actor":{"confidence_score":0.%d,"recent_mutations":%d,"trust_tier":"%s"}},"drift_detected":%s,"drift_resolved":%s,"metadata":{"candidate_count":%d,"chosen_id":"c-%d","precision":0.%d,"fp_rate":0.00%d}}\n' \
    "${ts}" "${mid}" "${rid}" "${label}" "${i}" "${status}" "${actor_id}" "${tier}" "${gate_status}" "${gate_reason}" "${policy_id}" \
    "${conf_bp}" "${recent}" "${tier}" \
    "${drift_detected}" "${drift_resolved}" "${candidates}" "${i}" "${precision}" "${fp_rate}" \
    >>"${mutation_bulk_file}"
done

post_bulk_file "mutation_intents" \
  "${ES_URL}/.soc-mutation-intents/_bulk?refresh=true" \
  "${mutation_bulk_file}"

# ----- 8b. 50 extra MTTR rollback samples in .soc-outcomes ----------------
#
# .soc-outcomes is a data stream, so clear previously-seeded demo rows by
# rule_id prefix, then append.

"${CURL[@]}" -X POST "${ES_URL}/.soc-outcomes/_delete_by_query?refresh=true" -d '{
  "query": { "prefix": { "rule_id": "rule-mttr-" } }
}' >/dev/null || true

outcomes_bulk_file="${BULK_TMPDIR}/outcomes.ndjson"
: >"${outcomes_bulk_file}"
for ((i=0; i<50; i++)); do
  # Cycle MTTR values across a wide distribution to exercise p50/p95:
  #   30% ≤ 60s (fast)
  #   40% 60–180s (typical)
  #   20% 180–600s (slow)
  #   10% 600–1200s (tail)
  case $(( i % 10 )) in
    0|1|2)     mttr_ms=$(( 15000  + (i * 1000) ))        ;;  #  15–60s
    3|4|5|6)   mttr_ms=$(( 60000  + (i * 3000) ))        ;;  #  1–3m
    7|8)       mttr_ms=$(( 180000 + (i * 8000) ))        ;;  #  3–10m
    *)         mttr_ms=$(( 600000 + (i * 10000) ))       ;;  # 10–20m tail
  esac
  mins_ago=$(( (i * 27) % 1420 + 5 ))                     # spread over ~24h
  ts=$(iso_minutes_ago "${mins_ago}")
  applied_ts=$(iso_seconds_offset -$(( mins_ago * 60 + mttr_ms / 1000 )))
  rule_ref=$(printf 'rule-mttr-%03d' "${i}")
  mut_ref=$(printf 'mut-mttr-%03d' "${i}")
  actor_idx=$(( i % 10 ))
  actor_id=$(printf 'actor-%02d' "${actor_idx}")
  mttr_secs=$(( mttr_ms / 1000 ))

  printf '{"create":{}}\n' >>"${outcomes_bulk_file}"
  printf '{"@timestamp":"%s","mutation_intent_id":"%s","rule_id":"%s","rolled_back":true,"rollback_mttr_ms":%d,"applied_at":"%s","rolled_back_at":"%s","status":"done","actor_id":"%s","label":"Auto-rollback sample %d","subtitle":"guardrail breach auto-recovered in %ds"}\n' \
    "${ts}" "${mut_ref}" "${rule_ref}" "${mttr_ms}" "${applied_ts}" "${ts}" "${actor_id}" "${i}" "${mttr_secs}" \
    >>"${outcomes_bulk_file}"
done

post_bulk_file "outcomes" \
  "${ES_URL}/.soc-outcomes/_bulk?refresh=true" \
  "${outcomes_bulk_file}"

# ----- 8b'. Companion mutation_intent docs for every mut-mttr-NNN ---------
#
# The Mutation Detail / Mutation Lineage / Autonomy Decision flyouts source
# the "Governance gate" and "Actor" sections from `.soc-mutation-intents`.
# Without an intent doc, those sections render "—" even though we have rich
# outcome data. Seed one intent per MTTR sample, aligned by
# `mutation_intent_id`, so every rolled-back sample carries a meaningful
# gate + actor payload when a reviewer opens the flyout.

# actor-idx → trust tier / confidence (bp) / recent_mutations (24h)
#   Mirrors ACTOR_TIERS below so the flyout's Actor section is consistent
#   with the trust-tier roster used by the governance pulse.
MTTR_TIERS=("system" "trusted" "trusted" "trusted" "trusted" "trusted" "probationary" "probationary" "untrusted" "quarantined")
MTTR_CONF_BP=(98 90 91 92 93 94 75 72 55 42)
MTTR_RECENT=(24 14 12 16 11 18 5 4 2 1)

# 5 policies × 5 matching rationales; pick by (i % 5) so every policy
# shows up ~10 times across the 50-sample set.
MTTR_POLICIES=(
  "policy-canary-watch-v2"
  "policy-fp-guardrail-v3"
  "policy-precision-floor-v1"
  "policy-alert-volume-cap-v1"
  "policy-coverage-regression-v1"
)
MTTR_GATE_REASONS=(
  "canary watch armed on FP surge — clean eval + backtest"
  "canary watch armed on FP-rate guardrail — precision floor cleared"
  "canary watch armed on precision floor — backtest PR=1.0 on 30d window"
  "canary watch armed on alert-volume cap — recall trade-off accepted"
  "canary watch armed on coverage regression — no redundant rules"
)

"${CURL[@]}" -X POST "${ES_URL}/.soc-mutation-intents/_delete_by_query?refresh=true" -d '{
  "query": { "prefix": { "mutation_intent_id": "mut-mttr-" } }
}' >/dev/null || true

mttr_intents_bulk_file="${BULK_TMPDIR}/mttr_mutation_intents.ndjson"
: >"${mttr_intents_bulk_file}"
for ((i=0; i<50; i++)); do
  case $(( i % 10 )) in
    0|1|2)     mttr_ms=$(( 15000  + (i * 1000) ))        ;;
    3|4|5|6)   mttr_ms=$(( 60000  + (i * 3000) ))        ;;
    7|8)       mttr_ms=$(( 180000 + (i * 8000) ))        ;;
    *)         mttr_ms=$(( 600000 + (i * 10000) ))       ;;
  esac
  mins_ago=$(( (i * 27) % 1420 + 5 ))
  applied_ts=$(iso_seconds_offset -$(( mins_ago * 60 + mttr_ms / 1000 )))
  rule_ref=$(printf 'rule-mttr-%03d' "${i}")
  mut_ref=$(printf 'mut-mttr-%03d' "${i}")
  mttr_secs=$(( mttr_ms / 1000 ))
  actor_idx=$(( i % 10 ))
  actor_id=$(printf 'actor-%02d' "${actor_idx}")
  tier="${MTTR_TIERS[$actor_idx]}"
  conf_bp="${MTTR_CONF_BP[$actor_idx]}"
  recent="${MTTR_RECENT[$actor_idx]}"
  policy_idx=$(( i % 5 ))
  policy_id="${MTTR_POLICIES[$policy_idx]}"
  gate_reason="${MTTR_GATE_REASONS[$policy_idx]}"
  # Gate status is "approved" for all samples — the sample set models
  # mutations that *passed* the gate, were applied, and then rolled back
  # by the canary watch window (which the outcome doc captures). A stale
  # "blocked" here would contradict the outcome.
  printf '{"index":{"_id":"%s"}}\n' "${mut_ref}" >>"${mttr_intents_bulk_file}"
  printf '{"@timestamp":"%s","mutation_intent_id":"%s","rule_id":"%s","label":"Applied — auto-rolled back after %ds","subtitle":"%s","status":"applied","actor_id":"%s","actor_trust_tier":"%s","governance_gate":{"status":"approved","reason":"%s","policy_id":"%s","thresholds":{"min_precision":0.9,"max_fp_rate":0.005,"max_alerts_per_hour":200,"canary_watch_minutes":60}},"argus":{"actor":{"confidence_score":0.%d,"recent_mutations":%d,"trust_tier":"%s"}}}\n' \
    "${applied_ts}" "${mut_ref}" "${rule_ref}" "${mttr_secs}" "${gate_reason}" "${actor_id}" "${tier}" "${gate_reason}" "${policy_id}" "${conf_bp}" "${recent}" "${tier}" \
    >>"${mttr_intents_bulk_file}"
done

post_bulk_file "mttr_mutation_intents" \
  "${ES_URL}/.soc-mutation-intents/_bulk?refresh=true" \
  "${mttr_intents_bulk_file}"

# ----- 8c. 10 actors × current trust tier ---------------------------------
#
# `.soc-actor-trust-tiers` — write ONE current-tier row per actor with a
# recent @timestamp so the governance_pulse `by_actor.latest` sub-agg picks
# the right tier. Tier mix is roughly: 1 system · 5 trusted · 2 probationary ·
# 1 untrusted · 1 quarantined (quarantined is mapped into `untrusted` by
# the pulse tier-mix bucket, which is fine for display parity).

ensure_index ".soc-actor-trust-tiers" '{
  "mappings": {
    "properties": {
      "@timestamp": { "type": "date" },
      "actor_id":   { "type": "keyword" },
      "tier":       { "type": "keyword" },
      "reason":     { "type": "keyword" }
    }
  }
}'

ACTOR_TIERS=(
  "actor-00:system:bootstrap"
  "actor-01:trusted:sustained-eval-pass"
  "actor-02:trusted:sustained-eval-pass"
  "actor-03:trusted:sustained-eval-pass"
  "actor-04:trusted:sustained-eval-pass"
  "actor-05:trusted:sustained-eval-pass"
  "actor-06:probationary:recent-rollback"
  "actor-07:probationary:low-signal-confidence"
  "actor-08:untrusted:repeated-rollbacks"
  "actor-09:quarantined:injection-surface-flag"
)

trust_bulk_file="${BULK_TMPDIR}/trust_tiers.ndjson"
: >"${trust_bulk_file}"
for entry in "${ACTOR_TIERS[@]}"; do
  actor_id="${entry%%:*}"
  rest="${entry#*:}"
  tier="${rest%%:*}"
  reason="${rest#*:}"
  ts=$(iso_minutes_ago $(( RANDOM % 120 + 5 )))

  printf '{"index":{"_id":"tier-%s"}}\n' "${actor_id}" >>"${trust_bulk_file}"
  printf '{"@timestamp":"%s","actor_id":"%s","tier":"%s","reason":"%s"}\n' \
    "${ts}" "${actor_id}" "${tier}" "${reason}" \
    >>"${trust_bulk_file}"
done

post_bulk_file "actor_trust_tiers" \
  "${ES_URL}/.soc-actor-trust-tiers/_bulk?refresh=true" \
  "${trust_bulk_file}"

# ----- 8d. 3 extra reasoning runs × 10 spans = 30 extra spans -------------

"${CURL[@]}" -X POST "${ES_URL}/.soc-reasoning-trace/_delete_by_query?refresh=true" -d '{
  "query": { "prefix": { "run_id": "run-demo-" } }
}' >/dev/null || true

EXTRA_RUNS=("run-demo-ransom" "run-demo-identity" "run-demo-cloud")
EXTRA_RUN_TITLES=(
  "Ransomware precursor on endpoint-41"
  "Impossible travel for user jhaines@acme"
  "GCP service-account privilege escalation"
)
EXTRA_ACTORS=("argus-orchestrator" "argus-governance" "argus-sim")

reasoning_bulk_file="${BULK_TMPDIR}/reasoning_trace.ndjson"
: >"${reasoning_bulk_file}"
for r in "${!EXTRA_RUNS[@]}"; do
  run_id="${EXTRA_RUNS[$r]}"
  run_title="${EXTRA_RUN_TITLES[$r]}"
  actor_id="${EXTRA_ACTORS[$r]}"
  base_mins=$(( 30 + r * 20 ))

  # Deterministic 10-span chain:
  # 0 thought · 1 tool_call · 2 tool_result · 3 thought · 4 decision
  # 5 tool_call · 6 tool_result · 7 decision · 8 thought · 9 recommendation
  for s in 0 1 2 3 4 5 6 7 8 9; do
    secs=$(( (base_mins * 60) + (s * 30) ))
    ts=$(iso_seconds_offset -"${secs}")
    case $s in
      0) step_type="thought";        conf="0.55"; title="Triaging ${run_title}";             body="Initial scan flags this alert as high-pressure." ;;
      1) step_type="tool_call";      conf="0.55"; title="fetch_alert_context(${run_id})";    body="Pulling alert, host, identity, and recent audit trail." ;;
      2) step_type="tool_result";    conf="0.55"; title="context resolved";                  body="Identity anomalies + escalation signals present." ;;
      3) step_type="thought";        conf="0.72"; title="Classifying pressure";              body="Correlated signals indicate coordinated activity, not noise." ;;
      4) step_type="decision";       conf="0.78"; title="Queue mutation candidate synthesis"; body="10 candidates will be generated with Pareto weighting." ;;
      5) step_type="tool_call";      conf="0.78"; title="synthesize_candidates(top=10)";     body="Requesting rule candidates with precision/recall/fp weights." ;;
      6) step_type="tool_result";    conf="0.80"; title="candidates returned";               body="4 on frontier · top=c-03 (PR=0.93 recall=0.80)" ;;
      7) step_type="decision";       conf="0.86"; title="Chose c-03 for eval";               body="Dominates on precision and fp-rate axes; acceptable recall trade-off." ;;
      8) step_type="thought";        conf="0.88"; title="Eval+backtest both clean";          body="PR@k=0.90, 0 FPs on 14-day backtest." ;;
      9) step_type="recommendation"; conf="0.90"; title="Canary rollout 5→25→100";           body="Automatic rollback on FP guardrail breach." ;;
    esac

    printf '{"create":{}}\n' >>"${reasoning_bulk_file}"
    printf '{"run_id":"%s","step_index":%d,"step_type":"%s","@timestamp":"%s","actor_id":"%s","actor_trust_tier":"trusted","confidence":%s,"title":"%s","body":"%s"}\n' \
      "${run_id}" "${s}" "${step_type}" "${ts}" "${actor_id}" "${conf}" "${title}" "${body}" \
      >>"${reasoning_bulk_file}"
  done
done

post_bulk_file "reasoning_trace" \
  "${ES_URL}/.soc-reasoning-trace/_bulk?refresh=true" \
  "${reasoning_bulk_file}"

# ----- 8e. 15 detection eval runs -----------------------------------------
#
# Timing — all downstream docs in sections 8e / 8f / 8g are anchored to the
# parent mutation-intent timestamp so the demo narrative renders in the
# correct chronological order:
#
#   intent proposed         → (i+1)*55 min ago      (section 8a)
#   offline eval passed     → intent-20 min ago     (20m after intent)
#   historical backtest     → intent-30 min ago     (10m after eval)
#   canary rollout applied  → intent-40 min ago     (10m after backtest)
#   outcome steady-state    → intent-50 min ago     (10m after apply)
#
# Previously each stage used its own `(i+1)*K` offset (eval=70, backtest=75,
# apply=80) which made `backtest @ts > apply_rec @ts` — i.e. the "historical
# backtest" effectively ran AFTER the canary was already rolled out, which
# contradicts the whole "we backtest before we apply" story the demo is
# supposed to prove. The intent-relative offsets below guarantee backtest
# always precedes apply for every applied mut-demo-NNN row.

eval_bulk_file="${BULK_TMPDIR}/detection_eval_runs.ndjson"
: >"${eval_bulk_file}"
for ((i=0; i<15; i++)); do
  intent_mins_ago=$(( (i + 1) * 55 ))
  mins_ago=$(( intent_mins_ago - 20 ))
  ts=$(iso_minutes_ago "${mins_ago}")
  mid=$(printf 'mut-demo-%03d' "${i}")
  rid=$(printf 'rule-soc-%04d' "$(( 2000 + i ))")
  eid=$(printf 'eval-demo-%03d' "${i}")
  p=$(( 85 + (i % 14) ))
  r=$(( 70 + (i % 20) ))
  fp="0.00$(( (i % 9) + 1 ))"
  printf '{"index":{"_id":"%s"}}\n' "${eid}" >>"${eval_bulk_file}"
  printf '{"@timestamp":"%s","mutation_intent_id":"%s","rule_id":"%s","label":"Offline eval passed","subtitle":"PR=0.%d recall=0.%d fp=%s","status":"done","metadata":{"precision":0.%d,"recall":0.%d,"fp_rate":%s}}\n' \
    "${ts}" "${mid}" "${rid}" "${p}" "${r}" "${fp}" "${p}" "${r}" "${fp}" \
    >>"${eval_bulk_file}"
done

post_bulk_file "detection_eval_runs" \
  "${ES_URL}/.soc-detection-eval-runs/_bulk?refresh=true" \
  "${eval_bulk_file}"

# ----- 8f. 15 backtest results --------------------------------------------
#
# Field shape matches `DetailRawBacktestDoc` (see
# kbn-argus-console-common/src/builders/mutation_detail_builder.ts) so the
# Mutation Detail flyout's Backtest panel reads the counts correctly:
#
#   top-level: windows_tested / true_positives / false_positives /
#              precision / fp_rate / gate_decision / window_start /
#              window_end / query / tp_samples / fp_samples
#
# The older `metadata.{window_days, true_positives_recovered,
# true_positives_total, false_positives}` shape silently round-tripped as
# 0/0/0/— in the flyout (builder only reads top-level).
#
# All 15 demos model the "happy path" backtest — clean 30-day replay,
# zero FPs, gate decision `pass`. The first row (`backtest-demo-000`) also
# carries a `query` + three `tp_samples` so the flyout's evidence block
# has something to render for the canonical demo walkthrough.

backtest_bulk_file="${BULK_TMPDIR}/backtest_results.ndjson"
: >"${backtest_bulk_file}"
for ((i=0; i<15; i++)); do
  intent_mins_ago=$(( (i + 1) * 55 ))
  mins_ago=$(( intent_mins_ago - 30 ))
  ts=$(iso_minutes_ago "${mins_ago}")
  # 30-day historical replay window ending at the backtest @timestamp
  window_end="${ts}"
  window_start=$(iso_seconds_offset -$(( mins_ago * 60 + 30 * 86400 )))
  mid=$(printf 'mut-demo-%03d' "${i}")
  rid=$(printf 'rule-soc-%04d' "$(( 2000 + i ))")
  bid=$(printf 'backtest-demo-%03d' "${i}")
  tp=$(( 35 + (i % 15) ))
  printf '{"index":{"_id":"%s"}}\n' "${bid}" >>"${backtest_bulk_file}"
  if (( i == 0 )); then
    # TP sample timestamps spaced across the window (1d / 7d / 21d ago).
    tp_ts_1=$(iso_seconds_offset -$(( mins_ago * 60 + 1 * 86400 )))
    tp_ts_2=$(iso_seconds_offset -$(( mins_ago * 60 + 7 * 86400 )))
    tp_ts_3=$(iso_seconds_offset -$(( mins_ago * 60 + 21 * 86400 )))
    printf '{"@timestamp":"%s","mutation_intent_id":"%s","rule_id":"%s","label":"Historical backtest clean","subtitle":"30-day replay · 0 FPs · %d TPs recovered · gate pass","status":"done","windows_tested":30,"true_positives":%d,"false_positives":0,"precision":1.0,"fp_rate":0.0,"gate_decision":"pass","window_start":"%s","window_end":"%s","query":"process.executable:\\\"schtasks.exe\\\" and event.action:\\\"scheduled-task-created\\\" and not user.name:(SYSTEM or LOCAL\\\\ SERVICE)","tp_samples":[{"event_id":"evt-bt-demo-000-tp-1","timestamp":"%s","host_name":"WIN-FIN-042","user_name":"acme\\\\svc_accounting","process_executable":"C:\\\\Windows\\\\System32\\\\schtasks.exe","command_line":"schtasks /create /tn Updater /tr payload.exe /sc minute /mo 5","classification":"tp","reason":"red-team emulation rt-2026-041 (T1053.005)"},{"event_id":"evt-bt-demo-000-tp-2","timestamp":"%s","host_name":"WIN-DEV-017","user_name":"acme\\\\builder","process_executable":"C:\\\\Windows\\\\System32\\\\schtasks.exe","command_line":"schtasks /create /tn Maint /tr c:\\\\tmp\\\\x.ps1 /sc daily","classification":"tp","reason":"Caldera ability T1053.005 playbook"},{"event_id":"evt-bt-demo-000-tp-3","timestamp":"%s","host_name":"WIN-HR-003","user_name":"acme\\\\hr_service","process_executable":"C:\\\\Windows\\\\System32\\\\schtasks.exe","command_line":"schtasks /create /tn Sync /tr c:\\\\hr\\\\run.bat /sc onlogon","classification":"tp","reason":"red-team emulation rt-2026-038"}]}\n' \
      "${ts}" "${mid}" "${rid}" "${tp}" "${tp}" \
      "${window_start}" "${window_end}" \
      "${tp_ts_1}" "${tp_ts_2}" "${tp_ts_3}" \
      >>"${backtest_bulk_file}"
  else
    printf '{"@timestamp":"%s","mutation_intent_id":"%s","rule_id":"%s","label":"Historical backtest clean","subtitle":"30-day replay · 0 FPs · %d TPs recovered · gate pass","status":"done","windows_tested":30,"true_positives":%d,"false_positives":0,"precision":1.0,"fp_rate":0.0,"gate_decision":"pass","window_start":"%s","window_end":"%s"}\n' \
      "${ts}" "${mid}" "${rid}" "${tp}" "${tp}" \
      "${window_start}" "${window_end}" \
      >>"${backtest_bulk_file}"
  fi
done

post_bulk_file "backtest_results" \
  "${ES_URL}/.soc-backtest-results/_bulk?refresh=true" \
  "${backtest_bulk_file}"

# ----- 8g. 15 rule-application recommendations ----------------------------
#
# Bypass the envelope-validator pipeline with pipeline=_none, same as the
# canonical demo apply doc in section 2. Apply @ts is anchored 40 min after
# the parent intent (10 min after the backtest) so every canary rollout
# rec is strictly *newer* than its corresponding backtest row.

rec_bulk_file="${BULK_TMPDIR}/recommendations.ndjson"
: >"${rec_bulk_file}"
for ((i=0; i<15; i++)); do
  intent_mins_ago=$(( (i + 1) * 55 ))
  mins_ago=$(( intent_mins_ago - 40 ))
  ts=$(iso_minutes_ago "${mins_ago}")
  mid=$(printf 'mut-demo-%03d' "${i}")
  rid=$(printf 'rule-soc-%04d' "$(( 2000 + i ))")
  recid=$(printf 'rec-demo-%03d' "${i}")
  printf '{"index":{"_id":"%s"}}\n' "${recid}" >>"${rec_bulk_file}"
  printf '{"@timestamp":"%s","mutation_intent_id":"%s","rule_id":"%s","label":"Canary applied","subtitle":"5%% → 25%% → 100%% rollout","status":"done","type":"rule_application","metadata":{"strategy":"canary","stages":[{"percent":5,"passed":true},{"percent":25,"passed":true},{"percent":100,"passed":true}]}}\n' \
    "${ts}" "${mid}" "${rid}" \
    >>"${rec_bulk_file}"
done

post_bulk_file "recommendations" \
  "${ES_URL}/.soc-recommendations/_bulk?refresh=true&pipeline=_none" \
  "${rec_bulk_file}"

# ---------------------------------------------------------------------------
# 9. Coverage-gaps + community corpus + threat actors + threat profiles.
#
# These four indices power the new Argus Console surfaces shipped with the
# community-coverage-and-playbooks scope (Coverage panel, Actors flyout,
# Playbooks tab grouping, the `list_uncovered_techniques` /
# `list_actor_coverage` / `export_navigator_layer` Agent Builder tools, and
# the `soc-argus-playbook-datasource-gap` workflow). Without these seeds the
# new tools degrade to the empty-state payload and the Coverage panel renders
# all-grey cells.
# ---------------------------------------------------------------------------

echo "[argus-seed] seeding .soc-detection-corpus, .soc-threat-actors, .soc-threat-profiles"
# argus_seed_coverage.js is idempotent and safe to call repeatedly — each doc
# uses a deterministic _id. It lives at the repo root so the demo operator
# can call it directly when only the Tier-1 coverage surface needs a refresh.
if command -v node >/dev/null 2>&1; then
  SEED_COVERAGE_SCRIPT="$(cd "$(dirname "$0")/../.." && pwd)/scripts/argus_seed_coverage.js"
  if [[ -f "${SEED_COVERAGE_SCRIPT}" ]]; then
    ES_URL="${ES_URL}" ES_AUTH="${ES_AUTH}" node "${SEED_COVERAGE_SCRIPT}" || true
  else
    echo "[argus-seed] skipping coverage seed — ${SEED_COVERAGE_SCRIPT} not found"
  fi
else
  echo "[argus-seed] skipping coverage seed — node not on PATH"
fi

# ---------------------------------------------------------------------------
# 9b. `.soc-decision-graph` — seed a typed-edge neighborhood around the
#     canonical demo CVEs so the Tier-5 flyout + full-screen explorer have
#     data to render when the operator clicks "Show decision graph" in the
#     reasoning drill-down. Idempotent via `source=argus.demo-seed`.
# ---------------------------------------------------------------------------

echo "[argus-seed] seeding .soc-decision-graph demo edges"
if command -v node >/dev/null 2>&1; then
  SEED_GRAPH_SCRIPT="$(cd "$(dirname "$0")/../.." && pwd)/scripts/argus_seed_decision_graph.js"
  if [[ -f "${SEED_GRAPH_SCRIPT}" ]]; then
    ES_URL="${ES_URL}" ES_AUTH="${ES_AUTH}" node "${SEED_GRAPH_SCRIPT}" || true
  else
    echo "[argus-seed] skipping decision-graph seed — ${SEED_GRAPH_SCRIPT} not found"
  fi
else
  echo "[argus-seed] skipping decision-graph seed — node not on PATH"
fi

# ---------------------------------------------------------------------------
# 10. `.soc-coverage-gaps` — seed a realistic set of open gaps so the new
#     Agent Builder tools (`list_uncovered_techniques`, `list_actor_coverage`)
#     and the datasource-gap playbook have data to render against.
#
#     `.soc-coverage-gaps` is a data stream; we clear prior demo seeds by
#     `source: argus.demo-seed` then append. Each gap carries `technique_id`,
#     `severity`, `confidence`, `status`, `data_sources[]`, and a short
#     human-readable `note` — the canonical shape consumed by
#     `soc-argus-playbook-coverage-gap-triage`, `soc-meta`, `soc-deteng`, and
#     the new datasource-gap playbook.
# ---------------------------------------------------------------------------

echo "[argus-seed] seeding .soc-coverage-gaps demo rows"

"${CURL[@]}" -X POST "${ES_URL}/.soc-coverage-gaps/_delete_by_query?refresh=true" -d '{
  "query": { "term": { "source": "argus.demo-seed" } }
}' >/dev/null || true

gaps_bulk_file="${BULK_TMPDIR}/coverage_gaps.ndjson"
: >"${gaps_bulk_file}"

# (technique_id, severity, confidence, data_source, note)
GAP_ROWS=(
  "T1562.001|high|0.82|winlogbeat|Community-only coverage for disable-or-modify-tools; no Argus-authored rule"
  "T1490|high|0.78|winlogbeat|Inhibit-system-recovery: covered by sigma/escu but not by Argus"
  "T1555|high|0.74|system.auth|Credentials from password stores: gap on macOS+Linux endpoints"
  "T1110|med|0.62|okta.system|Brute-force on identity provider — community rule exists, not Argus-authored"
  "T1548.002|med|0.58|winlogbeat|UAC bypass: Splunk ESCU has coverage, Argus does not"
  "T1070.004|med|0.55|winlogbeat|File-deletion evasion: single community rule, no Argus-authored fallback"
  "T1021.002|high|0.80|winlogbeat|SMB admin-share lateral: Red Canary only, no Argus rule"
  "T1560|med|0.52|winlogbeat|Archive-collected-data: Red Canary only"
  "T1105|low|0.41|winlogbeat|Ingress tool transfer: narrow community rule, no Argus rule"
  "T1036|med|0.60|winlogbeat|Masquerading: single ESCU rule, low overlap with Argus corpus"
  "T1068|high|0.77|endgame|Privilege-escalation exploit: missing endpoint-data-source coverage"
  "T1005|low|0.38|endgame|Data-from-local-system: elastic-prebuilt only, no Argus rule"
  "T1204|med|0.55|endgame|User-execution: Elastic-prebuilt only, low Argus alignment"
  "T1071.004|med|0.57|packetbeat|DNS C2: community rule exists, no Argus rule for DNS-tunnel specifically"
  "T1041|med|0.52|packetbeat|Exfil over C2: single elastic-prebuilt rule, no Argus rule"
)

for i in "${!GAP_ROWS[@]}"; do
  IFS='|' read -r technique severity confidence datasource note <<<"${GAP_ROWS[$i]}"
  mins_ago=$(( (i + 1) * 90 + RANDOM % 30 ))  # spread across ~24h
  ts=$(iso_minutes_ago "${mins_ago}")
  printf '{"create":{}}\n' >>"${gaps_bulk_file}"
  printf '{"@timestamp":"%s","technique_id":"%s","severity":"%s","confidence":%s,"status":"open","source":"argus.demo-seed","source_doc_id":"demo-gap-%03d","data_sources":["%s"],"note":"%s","occurrences":%d,"avg_confidence":%s}\n' \
    "${ts}" "${technique}" "${severity}" "${confidence}" "${i}" "${datasource}" "${note}" \
    "$(( i + 2 ))" "${confidence}" \
    >>"${gaps_bulk_file}"
done

post_bulk_file "coverage_gaps" \
  "${ES_URL}/.soc-coverage-gaps/_bulk?refresh=true" \
  "${gaps_bulk_file}"

# ---------------------------------------------------------------------------
# 11. Canonical CVE → Argus rule wiring — powers three Console surfaces in one
#     pass so the demo story is internally consistent:
#
#       (a) Proposals panel  → .soc-recommendations docs carrying
#           `argus.synthesis.{chosen,frontier,dominated,weights}` so the
#           `recent_proposals` route (filters on
#           `exists: argus.synthesis.chosen.candidate_id` in now-24h) returns
#           non-empty. Paired with `.soc-cve-advisories` entries that link
#           `recommendation_id` ↔ `cve_id`, so clicking a row resolves the
#           per-CVE Pareto table.
#
#       (b) Coverage panel   → `.soc-detection-corpus` entries with
#           `source: 'argus'` for each canonical rule. These surface under
#           `contributing_sources: ['argus', …]` on the heatmap cells so
#           operators can see which techniques the demo corpus covers.
#           (The Argus-authored *count* is driven by the recommendations
#           with `mitre_techniques` seeded below — see coverage.ts →
#           fetchAuthoredDocs.)
#
#       (c) Mutations / Overview parity → one `.soc-outcomes` doc per
#           `mut-demo-*` intent whose status is `applied` (18 rows), with
#           `rolled_back: false`. This makes
#           `mutation_throughput.applied = outcomes_total - rollback_count`
#           on the Pulse builder match the "Applied" count in the Mutations
#           tab (which groups `.soc-outcomes` by verdict derived from
#           `rolled_back`).
#
#     Six canonical rules span the three decision-graph CVEs plus three
#     Argus-native ones so the Proposals list always has ≥6 rows in `now-24h`:
# ---------------------------------------------------------------------------

echo "[argus-seed] seeding canonical CVE advisories + Pareto recommendations + Argus corpus"

# (cve_id|advisory_id|recommendation_id|draft_rule_id|primary_technique|secondary_technique|title)
# The `draft_rule_id` doubles as the corpus `_id` / rule_id so coverage joins.
CANONICAL_RULES=(
  "CVE-2024-27198|argus-adv-cve-2024-27198|rec-synth-cve-2024-27198|rule-jetbrains-teamcity-auth-bypass|T1190|T1078|JetBrains TeamCity auth bypass"
  "CVE-2024-3400|argus-adv-cve-2024-3400|rec-synth-cve-2024-3400|rule-paloalto-globalprotect-cmdi|T1190|T1059.004|Palo Alto GlobalProtect command injection"
  "CVE-2024-21412|argus-adv-cve-2024-21412|rec-synth-cve-2024-21412|rule-smartscreen-bypass-internet-shortcut|T1211|T1566.001|Windows SmartScreen bypass via internet shortcut"
  "CVE-2026-18001|argus-adv-lsass-dump-2026-04|rec-synth-lsass-dump-2026-04|rule-soc-1024|T1003.001|T1059.001|LSASS credential dumping via procdump / comsvcs"
  "CVE-2024-38178|argus-adv-cve-2024-38178|rec-synth-cve-2024-38178|rule-argus-t1059-powershell-encoded|T1059.001|T1027|Scripting Engine memory corruption via EncodedCommand PowerShell"
  "CVE-2024-49113|argus-adv-cve-2024-49113|rec-synth-cve-2024-49113|rule-argus-t1566-phishing-link|T1566.002|T1204.001|Spearphishing link to credential-harvest lure"
  "CVE-ARGUS-E2E-LINUX|argus-adv-e2e-linux-pipe-to-shell|rec-synth-e2e-linux-pipe-to-shell|argus-linux-pipe-to-shell|T1059.004|T1190|Argus E2E — Linux pipe-to-shell downloader (live Caldera loop)"
)

advisory_bulk_file="${BULK_TMPDIR}/canonical_advisories.ndjson"
synth_recs_bulk_file="${BULK_TMPDIR}/canonical_synth_recs.ndjson"
argus_corpus_bulk_file="${BULK_TMPDIR}/argus_corpus.ndjson"
: >"${advisory_bulk_file}"
: >"${synth_recs_bulk_file}"
: >"${argus_corpus_bulk_file}"

for i in "${!CANONICAL_RULES[@]}"; do
  IFS='|' read -r cve_id advisory_id rec_id rule_id tech1 tech2 title <<<"${CANONICAL_RULES[$i]}"
  # Spread advisories over the last ~20h so all rows fall inside `now-24h`.
  mins_ago=$(( 30 + i * 180 ))
  ts=$(iso_minutes_ago "${mins_ago}")

  # ----- (a) advisory doc — join key for the proposals join --------------
  printf '{"index":{"_id":"%s"}}\n' "${advisory_id}" >>"${advisory_bulk_file}"
  printf '{"@timestamp":"%s","advisory_id":"%s","cve_id":"%s","title":"%s","summary":"Argus-synthesised detection for %s — 10 Pareto candidates, 4 on the frontier, chosen pick dominates on precision and fp_rate.","severity":"high","status":"detected","source":"argus.demo-seed","target_platforms":["windows","linux"],"mitre_techniques":[{"technique_id":"%s","technique_name":"%s","tactic":"initial-access"},{"technique_id":"%s","technique_name":"%s","tactic":"execution"}],"recommendation_id":"%s","draft_rule_id":"%s"}\n' \
    "${ts}" "${advisory_id}" "${cve_id}" "${title}" "${cve_id}" \
    "${tech1}" "${tech1}" "${tech2}" "${tech2}" \
    "${rec_id}" "${rule_id}" \
    >>"${advisory_bulk_file}"

  # ----- (a) recommendation doc with full Pareto synthesis metadata ------
  # Candidate ids are deterministic per recommendation so re-runs produce
  # byte-identical docs. Scores are hand-tuned so `chosen` Pareto-dominates
  # all `dominated` entries (synthesis_proposals_builder runs a live
  # dominance check and renders "dominated_by" explanations).
  #
  # Shape mirrors `SynthesisRawBlock` in
  #   x-pack/solutions/security/packages/kbn-argus-console-common/src/builders/synthesis_proposals_builder.ts
  # `weights` uses `axis_fn` (builder normalises to ArgusSynthesisWeights).
  precision_chosen="0.9$(( 2 + i % 5 ))"           # 0.92–0.96
  recall_chosen="0.8$(( 1 + i % 6 ))"              # 0.81–0.86
  fp_rate_chosen="0.00$(( (i % 4) + 2 ))"          # 0.002–0.005
  axis_chosen="0.9$(( (i % 5) + 3 ))"              # 0.93–0.97
  precision_fr1=$(printf '0.%d' "$(( 88 + i % 4 ))")
  recall_fr1=$(printf '0.%d' "$(( 79 + i % 5 ))")
  fp_rate_fr1=$(printf '0.00%d' "$(( (i % 3) + 4 ))")
  axis_fr1=$(printf '0.%d' "$(( 85 + i % 6 ))")
  precision_fr2=$(printf '0.%d' "$(( 85 + i % 5 ))")
  recall_fr2=$(printf '0.%d' "$(( 86 + i % 4 ))")
  fp_rate_fr2=$(printf '0.0%d' "$(( (i % 3) + 1 ))")
  axis_fr2=$(printf '0.%d' "$(( 80 + i % 6 ))")
  precision_fr3=$(printf '0.%d' "$(( 82 + i % 5 ))")
  recall_fr3=$(printf '0.%d' "$(( 88 + i % 5 ))")
  fp_rate_fr3=$(printf '0.00%d' "$(( (i % 3) + 3 ))")
  axis_fr3=$(printf '0.%d' "$(( 90 + i % 4 ))")

  # Dominated candidates are strictly worse than `chosen` on every axis,
  # with the gap big enough that the `dominates()` epsilon can't flip it.
  precision_dom1=$(printf '0.%d' "$(( 70 + i % 5 ))")
  recall_dom1=$(printf '0.%d' "$(( 65 + i % 5 ))")
  fp_rate_dom1=$(printf '0.0%d' "$(( (i % 3) + 3 ))")
  axis_dom1=$(printf '0.%d' "$(( 60 + i % 6 ))")
  precision_dom2=$(printf '0.%d' "$(( 75 + i % 4 ))")
  recall_dom2=$(printf '0.%d' "$(( 70 + i % 5 ))")
  fp_rate_dom2=$(printf '0.0%d' "$(( (i % 2) + 2 ))")
  axis_dom2=$(printf '0.%d' "$(( 68 + i % 5 ))")
  precision_dom3=$(printf '0.%d' "$(( 68 + i % 5 ))")
  recall_dom3=$(printf '0.%d' "$(( 72 + i % 4 ))")
  fp_rate_dom3=$(printf '0.0%d' "$(( (i % 3) + 2 ))")
  axis_dom3=$(printf '0.%d' "$(( 55 + i % 7 ))")

  # Confidence scores the Exploit→Detection panel reads (top-level
  # `confidence` is treated as a 0–100 percent in the UI builder). Spread
  # across variants so the demo can walk low/medium/high advisories.
  confidence_vals=(82 68 55 88 62 74)
  confidence_pct="${confidence_vals[$i]}"
  argus_confidence_frac=$(awk -v c="${confidence_pct}" 'BEGIN{printf "%.2f", c/100}')

  printf '{"index":{"_id":"%s"}}\n' "${rec_id}" >>"${synth_recs_bulk_file}"
  printf '{"@timestamp":"%s","rec_id":"%s","type":"rule_synthesis","status":"done","title":"Pareto synthesis — %s","summary":"10 candidates generated, 4 on Pareto frontier, 6 dominated. Chosen c-01.","rule_id":"%s","confidence":%s,"mitre_technique":["%s","%s"],"mitre_techniques":[{"technique_id":"%s"},{"technique_id":"%s"}],"argus":{"origin":"synthesis","decision":{"confidence":%s},"synthesis":{"weights":{"precision":0.45,"recall":0.35,"fp_rate":0.15,"axis_fn":0.05},"chosen":{"candidate_id":"c-01","composition":{"must_anchor_subset":"all","wildcard_retention":"full","minimum_should_match":2},"predicted":{"precision":%s,"recall":%s,"fp_rate":%s,"axis_fn_mean":%s,"axis_fn":{"command_args":0.95,"encoding_layers":0.92,"process_ancestry":0.90,"timing_jitter_ms":0.80,"named_pipe_vs_stdout":0.86,"living_off_land":0.85}}},"frontier":[{"candidate_id":"c-01","composition":{"must_anchor_subset":"all","wildcard_retention":"full","minimum_should_match":2},"predicted":{"precision":%s,"recall":%s,"fp_rate":%s,"axis_fn_mean":%s,"axis_fn":{"command_args":0.95,"encoding_layers":0.92,"process_ancestry":0.90,"timing_jitter_ms":0.80,"named_pipe_vs_stdout":0.86,"living_off_land":0.85}}},{"candidate_id":"c-02","composition":{"must_anchor_subset":"primary_only","wildcard_retention":"full","minimum_should_match":1},"predicted":{"precision":%s,"recall":%s,"fp_rate":%s,"axis_fn_mean":%s,"axis_fn":{"command_args":0.88,"encoding_layers":0.82,"process_ancestry":0.85,"timing_jitter_ms":0.75,"named_pipe_vs_stdout":0.82,"living_off_land":0.80}}},{"candidate_id":"c-03","composition":{"must_anchor_subset":"all","wildcard_retention":"strict","minimum_should_match":1},"predicted":{"precision":%s,"recall":%s,"fp_rate":%s,"axis_fn_mean":%s,"axis_fn":{"command_args":0.86,"encoding_layers":0.80,"process_ancestry":0.82,"timing_jitter_ms":0.70,"named_pipe_vs_stdout":0.80,"living_off_land":0.76}}},{"candidate_id":"c-04","composition":{"must_anchor_subset":"primary_only","wildcard_retention":"strict","minimum_should_match":2},"predicted":{"precision":%s,"recall":%s,"fp_rate":%s,"axis_fn_mean":%s,"axis_fn":{"command_args":0.92,"encoding_layers":0.88,"process_ancestry":0.90,"timing_jitter_ms":0.82,"named_pipe_vs_stdout":0.86,"living_off_land":0.84}}}],"dominated":[{"candidate_id":"c-05","composition":{"must_anchor_subset":"primary_only","wildcard_retention":"full","minimum_should_match":1},"predicted":{"precision":%s,"recall":%s,"fp_rate":%s,"axis_fn_mean":%s,"axis_fn":{"command_args":0.70,"encoding_layers":0.60,"process_ancestry":0.58,"timing_jitter_ms":0.50,"named_pipe_vs_stdout":0.58,"living_off_land":0.52}}},{"candidate_id":"c-06","composition":{"must_anchor_subset":"all","wildcard_retention":"full","minimum_should_match":1},"predicted":{"precision":%s,"recall":%s,"fp_rate":%s,"axis_fn_mean":%s,"axis_fn":{"command_args":0.78,"encoding_layers":0.70,"process_ancestry":0.68,"timing_jitter_ms":0.58,"named_pipe_vs_stdout":0.66,"living_off_land":0.58}}},{"candidate_id":"c-07","composition":{"must_anchor_subset":"primary_only","wildcard_retention":"strict","minimum_should_match":1},"predicted":{"precision":%s,"recall":%s,"fp_rate":%s,"axis_fn_mean":%s,"axis_fn":{"command_args":0.65,"encoding_layers":0.58,"process_ancestry":0.56,"timing_jitter_ms":0.48,"named_pipe_vs_stdout":0.55,"living_off_land":0.50}}}]}}}\n' \
    "${ts}" "${rec_id}" "${title}" "${rule_id}" "${confidence_pct}" "${tech1}" "${tech2}" "${tech1}" "${tech2}" \
    "${argus_confidence_frac}" \
    "${precision_chosen}" "${recall_chosen}" "${fp_rate_chosen}" "${axis_chosen}" \
    "${precision_chosen}" "${recall_chosen}" "${fp_rate_chosen}" "${axis_chosen}" \
    "${precision_fr1}" "${recall_fr1}" "${fp_rate_fr1}" "${axis_fr1}" \
    "${precision_fr2}" "${recall_fr2}" "${fp_rate_fr2}" "${axis_fr2}" \
    "${precision_fr3}" "${recall_fr3}" "${fp_rate_fr3}" "${axis_fr3}" \
    "${precision_dom1}" "${recall_dom1}" "${fp_rate_dom1}" "${axis_dom1}" \
    "${precision_dom2}" "${recall_dom2}" "${fp_rate_dom2}" "${axis_dom2}" \
    "${precision_dom3}" "${recall_dom3}" "${fp_rate_dom3}" "${axis_dom3}" \
    >>"${synth_recs_bulk_file}"

  # ----- (b) Argus-authored corpus entry ---------------------------------
  printf '{"index":{"_id":"%s"}}\n' "${rule_id}" >>"${argus_corpus_bulk_file}"
  printf '{"@timestamp":"%s","rule_id":"%s","source":"argus","title":"%s","mitre_technique":["%s","%s"],"advisory_id":"%s","cve_id":"%s","draft_rule_id":"%s"}\n' \
    "${ts}" "${rule_id}" "${title}" "${tech1}" "${tech2}" \
    "${advisory_id}" "${cve_id}" "${rule_id}" \
    >>"${argus_corpus_bulk_file}"
done

post_bulk_file "cve_advisories" \
  "${ES_URL}/.soc-cve-advisories/_bulk?refresh=true" \
  "${advisory_bulk_file}"

# Bypass the mutation-intent envelope validator — these are synthesis docs,
# not mutation intents, and the pipeline would otherwise route them to the
# dead-letter queue.
post_bulk_file "canonical_synth_recs" \
  "${ES_URL}/.soc-recommendations/_bulk?refresh=true&pipeline=_none" \
  "${synth_recs_bulk_file}"

post_bulk_file "argus_corpus" \
  "${ES_URL}/.soc-detection-corpus/_bulk?refresh=true" \
  "${argus_corpus_bulk_file}"

# ---------------------------------------------------------------------------
# 11b. Backfill Pareto synthesis metadata onto the autonomy-flow
# recommendations (the `argus-adv-*-2026-04` advisories seeded by the Argus
# autonomy loop). Without this, the Proposals tab shows "No candidate set
# recorded" when the user clicks one of those advisories — because the
# autonomy flow predates the R3 synthesis step.
#
# Uses a painless update_by_query against `.soc-recommendations`, keyed on
# advisory_id. The update is idempotent (Painless overwrites scalar fields
# and replaces maps), and also re-freshes `@timestamp` so the recommendation
# falls inside the 24h Proposals window.
# ---------------------------------------------------------------------------

echo "[argus-seed] backfilling Pareto synthesis metadata on autonomy-flow recs"

for advisory_id in argus-adv-defender-disable-2026-04 \
                   argus-adv-dns-c2-2026-04 \
                   argus-adv-ps-encoded-2026-04; do
  # Each advisory gets a distinct Pareto shape so the demo can walk through
  # three autonomy-flow advisories and see different candidate sets. Values
  # are hand-tuned so `c-01` Pareto-dominates every dominated row (same
  # dominance check the proposals builder re-runs client-side).
  case "${advisory_id}" in
    argus-adv-defender-disable-2026-04)
      confidence_pct=80
      p_ch=0.93; r_ch=0.80; fp_ch=0.003; ax_ch=0.90
      ;;
    argus-adv-dns-c2-2026-04)
      confidence_pct=72
      p_ch=0.90; r_ch=0.82; fp_ch=0.004; ax_ch=0.88
      ;;
    argus-adv-ps-encoded-2026-04)
      confidence_pct=65
      p_ch=0.87; r_ch=0.78; fp_ch=0.006; ax_ch=0.84
      ;;
  esac
  argus_conf_frac=$(awk -v c="${confidence_pct}" 'BEGIN{printf "%.2f", c/100}')
  now_iso=$(iso_minutes_ago 5)

  # `advisory_id` is mapped as text+.keyword on this index, so a bare `term`
  # against the text field never matches the dotted advisory id (tokenizer
  # splits on hyphens). Query `advisory_id.keyword` for an exact match.
  "${CURL[@]}" -X POST "${ES_URL}/.soc-recommendations/_update_by_query?refresh=true&pipeline=_none" \
    -d "$(cat <<JSON
{
  "query": { "term": { "advisory_id.keyword": "${advisory_id}" } },
  "script": {
    "lang": "painless",
    "source": "ctx._source['@timestamp'] = params.ts; ctx._source.confidence = params.cp; if (ctx._source.argus == null) { ctx._source.argus = new HashMap(); } if (ctx._source.argus.decision == null) { ctx._source.argus.decision = new HashMap(); } ctx._source.argus.decision.confidence = params.cf; ctx._source.argus.origin = 'synthesis'; ctx._source.argus.synthesis = params.syn;",
    "params": {
      "ts": "${now_iso}",
      "cp": ${confidence_pct},
      "cf": ${argus_conf_frac},
      "syn": {
        "weights": { "precision": 0.45, "recall": 0.35, "fp_rate": 0.15, "axis_fn": 0.05 },
        "chosen": {
          "candidate_id": "c-01",
          "composition": { "must_anchor_subset": "all", "wildcard_retention": "full", "minimum_should_match": 2 },
          "predicted": { "precision": ${p_ch}, "recall": ${r_ch}, "fp_rate": ${fp_ch}, "axis_fn_mean": ${ax_ch}, "axis_fn": { "command_args": 0.95, "encoding_layers": 0.92, "process_ancestry": 0.90, "timing_jitter_ms": 0.80, "named_pipe_vs_stdout": 0.86, "living_off_land": 0.85 } }
        },
        "frontier": [
          { "candidate_id": "c-01", "composition": { "must_anchor_subset": "all", "wildcard_retention": "full", "minimum_should_match": 2 }, "predicted": { "precision": ${p_ch}, "recall": ${r_ch}, "fp_rate": ${fp_ch}, "axis_fn_mean": ${ax_ch}, "axis_fn": { "command_args": 0.95, "encoding_layers": 0.92, "process_ancestry": 0.90, "timing_jitter_ms": 0.80, "named_pipe_vs_stdout": 0.86, "living_off_land": 0.85 } } },
          { "candidate_id": "c-02", "composition": { "must_anchor_subset": "primary_only", "wildcard_retention": "full", "minimum_should_match": 1 }, "predicted": { "precision": 0.86, "recall": 0.79, "fp_rate": 0.005, "axis_fn_mean": 0.82, "axis_fn": { "command_args": 0.88, "encoding_layers": 0.82, "process_ancestry": 0.85, "timing_jitter_ms": 0.75, "named_pipe_vs_stdout": 0.82, "living_off_land": 0.80 } } },
          { "candidate_id": "c-03", "composition": { "must_anchor_subset": "all", "wildcard_retention": "strict", "minimum_should_match": 1 }, "predicted": { "precision": 0.84, "recall": 0.84, "fp_rate": 0.008, "axis_fn_mean": 0.79, "axis_fn": { "command_args": 0.86, "encoding_layers": 0.80, "process_ancestry": 0.82, "timing_jitter_ms": 0.70, "named_pipe_vs_stdout": 0.80, "living_off_land": 0.76 } } },
          { "candidate_id": "c-04", "composition": { "must_anchor_subset": "primary_only", "wildcard_retention": "strict", "minimum_should_match": 2 }, "predicted": { "precision": 0.82, "recall": 0.86, "fp_rate": 0.004, "axis_fn_mean": 0.87, "axis_fn": { "command_args": 0.92, "encoding_layers": 0.88, "process_ancestry": 0.90, "timing_jitter_ms": 0.82, "named_pipe_vs_stdout": 0.86, "living_off_land": 0.84 } } }
        ],
        "dominated": [
          { "candidate_id": "c-05", "composition": { "must_anchor_subset": "primary_only", "wildcard_retention": "full", "minimum_should_match": 1 }, "predicted": { "precision": 0.70, "recall": 0.62, "fp_rate": 0.03, "axis_fn_mean": 0.58, "axis_fn": { "command_args": 0.70, "encoding_layers": 0.60, "process_ancestry": 0.58, "timing_jitter_ms": 0.50, "named_pipe_vs_stdout": 0.58, "living_off_land": 0.52 } } },
          { "candidate_id": "c-06", "composition": { "must_anchor_subset": "all", "wildcard_retention": "full", "minimum_should_match": 1 }, "predicted": { "precision": 0.74, "recall": 0.68, "fp_rate": 0.02, "axis_fn_mean": 0.66, "axis_fn": { "command_args": 0.78, "encoding_layers": 0.70, "process_ancestry": 0.68, "timing_jitter_ms": 0.58, "named_pipe_vs_stdout": 0.66, "living_off_land": 0.58 } } },
          { "candidate_id": "c-07", "composition": { "must_anchor_subset": "primary_only", "wildcard_retention": "strict", "minimum_should_match": 1 }, "predicted": { "precision": 0.67, "recall": 0.71, "fp_rate": 0.02, "axis_fn_mean": 0.55, "axis_fn": { "command_args": 0.65, "encoding_layers": 0.58, "process_ancestry": 0.56, "timing_jitter_ms": 0.48, "named_pipe_vs_stdout": 0.55, "living_off_land": 0.50 } } }
        ]
      }
    }
  }
}
JSON
)" >/dev/null || true
done

# ---------------------------------------------------------------------------
# 12. Outcome alignment for the rich mutation-intent demo volume.
#
# Section 8a seeds 24 `mut-demo-*` intents with these status buckets:
#   indices  0..13 → applied         (14 intents)
#   indices 14..19 → blocked         ( 6 intents)
#   indices 20..22 → applied + drift ( 3 intents)
#   index    23    → applied + drift_resolved (1 intent)
# → 18 applied (incl. drift variants), 6 blocked.
#
# The Pulse throughput tile (Overview panel) and the Mutations tab both
# read `.soc-outcomes`. Before this section, every outcome doc in the
# seeded window had `rolled_back: true`, so the applied count collapsed to
# 0 on both surfaces and the Mutations tab showed zero "Applied" rows even
# though 18 mutation intents were nominally applied.
#
# Seed one `.soc-outcomes` doc per applied intent with `rolled_back: false`
# so the applier / Pulse derivation (`applied = outcomes_total - rollback`)
# matches the Mutations tab row grouping (verdict = rolled_back ? 'rolled_back' : 'applied').
# ---------------------------------------------------------------------------

echo "[argus-seed] aligning .soc-outcomes with applied mut-demo-* intents"

# Clear previously-seeded alignment rows first. Keyed by mutation_intent_id
# prefix so the 55 `rule-mttr-*` and `mut-sample-*` rollback samples from
# sections 3 and 8b survive the delete.
"${CURL[@]}" -X POST "${ES_URL}/.soc-outcomes/_delete_by_query?refresh=true" -d '{
  "query": { "prefix": { "mutation_intent_id": "mut-demo-" } }
}' >/dev/null || true

applied_outcomes_bulk_file="${BULK_TMPDIR}/applied_outcomes.ndjson"
: >"${applied_outcomes_bulk_file}"

# Indices 0..13 → applied, 20..23 → applied (with drift flags that stay on
# the intent doc, not the outcome). Skip 14..19 — those stay blocked and
# never produce an outcome row.
APPLIED_INTENT_INDICES=(0 1 2 3 4 5 6 7 8 9 10 11 12 13 20 21 22 23)

for idx in "${APPLIED_INTENT_INDICES[@]}"; do
  mid=$(printf 'mut-demo-%03d' "${idx}")
  rid=$(printf 'rule-soc-%04d' "$(( 2000 + idx ))")
  actor_idx=$(( idx % 10 ))
  actor_id=$(printf 'actor-%02d' "${actor_idx}")
  # Anchor the outcome to the same intent-relative clock used by
  # sections 8e / 8f / 8g so chronological order across the full
  # mutation-lifecycle chain is:
  #   intent        (i+1)*55        min ago
  #   eval          intent-20       min ago
  #   backtest      intent-30       min ago
  #   apply rec     intent-40       min ago
  #   applied_at    intent-45       min ago   (5m after apply rec)
  #   outcome @ts   intent-50       min ago   (5m after applied_at)
  intent_mins_ago=$(( (idx + 1) * 55 ))
  applied_mins_ago=$(( intent_mins_ago - 45 ))
  mins_ago=$(( intent_mins_ago - 50 ))
  if (( applied_mins_ago < 5 )); then applied_mins_ago=5; fi
  if (( mins_ago < 1 )); then mins_ago=1; fi
  ts=$(iso_minutes_ago "${mins_ago}")
  applied_ts=$(iso_minutes_ago "${applied_mins_ago}")

  printf '{"create":{}}\n' >>"${applied_outcomes_bulk_file}"
  printf '{"@timestamp":"%s","mutation_intent_id":"%s","rule_id":"%s","rolled_back":false,"applied_at":"%s","status":"done","actor_id":"%s","label":"Canary applied — steady state","subtitle":"100%% rollout clean · no guardrail breach in observation window"}\n' \
    "${ts}" "${mid}" "${rid}" "${applied_ts}" "${actor_id}" \
    >>"${applied_outcomes_bulk_file}"
done

post_bulk_file "applied_outcomes" \
  "${ES_URL}/.soc-outcomes/_bulk?refresh=true" \
  "${applied_outcomes_bulk_file}"

# ---------------------------------------------------------------------------
# 13. E2D-flow demo variants — 6 canonical rules × 6 distinct paths
# ---------------------------------------------------------------------------
#
# Each of the 6 canonical CVE advisories seeded in section 11 gets the
# downstream join docs the Exploit→Detection flow panel reads:
#
#   .soc-mutation-intents       → governance stage
#   .soc-detection-eval-runs    → evaluated stage
#   .soc-backtest-results       → backtested stage
#   .soc-outcomes               → applied + running stages
#   .alerts-security.alerts-*   → live hit count on the running stage
#
# Every rule tells a different story so the demo can click through six
# distinct "alternatives" of the autonomous pipeline:
#
#   rule-jetbrains-teamcity-auth-bypass       → RUNNING (happy path, 12 hits/24h)
#   rule-paloalto-globalprotect-cmdi          → CANARY RAMPING (2 hits/24h, applied 3h ago)
#   rule-smartscreen-bypass-internet-shortcut → GOVERNANCE BLOCKED (trust tier too low)
#   rule-soc-1024                             → RUNNING (happy path, 8 hits/24h)
#   rule-argus-t1059-powershell-encoded       → BACKTEST FAILED (too noisy, never applied)
#   rule-argus-t1566-phishing-link            → APPLIED THEN ROLLED BACK (canary regression)
#
# Shape notes (driven by `e2d_flow_builder.ts`):
#   eval_run     needs `scores.{precision,recall,fp_rate_baseline,variant_coverage}`
#                and `gate_decision`, not the `metadata.*` shape section 2 uses.
#   backtest     needs `windows_tested`, `true_positives`, `false_positives`,
#                `gate_decision` (again, not `metadata.*`).
#   mutation_intent  needs `governance_gate.{status,reason}` and
#                    `argus.actor.trust_tier`.
#   outcome      needs `rolled_back`, `applied_at`, optional `rollback_mttr_ms`.
#
# IDs are stable (`mut-e2d-<rule>`) so the section is fully idempotent.
# Alerts are tagged with `kibana.alert.argus.demo_tag=argus-e2d-demo` so
# cleanup never touches unrelated alerts in the system.
# ---------------------------------------------------------------------------

echo "[argus-seed] seeding E2D flow demo variants (6 canonical rules × 6 paths)"

# Wipe previously-seeded variant docs so reruns stay deterministic. All docs
# below are keyed on `mut-e2d-*` mutation_intent_ids. Field mappings differ
# across indices (some store `mutation_intent_id` as `keyword`, some as
# `text` with a `.keyword` subfield), so we broadcast both forms and ignore
# whichever one the target rejects.
for _index in .soc-mutation-intents .soc-detection-eval-runs .soc-backtest-results .soc-outcomes; do
  "${CURL[@]}" -X POST "${ES_URL}/${_index}/_delete_by_query?refresh=true" \
    -d '{"query":{"bool":{"should":[
           {"prefix":{"mutation_intent_id":"mut-e2d-"}},
           {"prefix":{"mutation_intent_id.keyword":"mut-e2d-"}}
         ],"minimum_should_match":1}}}' >/dev/null || true
done
# Also clear any prior E2D-scoped outcomes for the 5 canonical Argus-
# synthesized rules that don't share identity with other demos. We
# intentionally leave `rule-soc-1024` alone so the mut-intent-42 MTTR
# rollback lineage (~55 historical rollbacks) stays intact — variant 4's
# new `applied` outcome is timestamped to be the newest so the E2D flow
# still picks it up.
"${CURL[@]}" -X POST "${ES_URL}/.soc-outcomes/_delete_by_query?refresh=true" \
  -d '{"query":{"terms":{"rule_id":[
         "rule-jetbrains-teamcity-auth-bypass",
         "rule-paloalto-globalprotect-cmdi",
         "rule-smartscreen-bypass-internet-shortcut",
         "rule-argus-t1059-powershell-encoded",
         "rule-argus-t1566-phishing-link",
         "argus.defense-evasion.t1562_001.argus-adv-defender-disable-2026-04",
         "argus.command-and-control.t1071_004.argus-adv-dns-c2-2026-04",
         "argus.execution.t1059_001.argus-adv-ps-encoded-2026-04"
       ]}}}' >/dev/null || true
# Alerts — clear by stable `_id` prefix since dynamic fields like
# `kibana.alert.argus.demo_tag` aren't always indexed as keyword.
"${CURL[@]}" -X POST "${ES_URL}/.internal.alerts-security.alerts-default-000001/_delete_by_query?refresh=true" \
  -d '{"query":{"prefix":{"_id":"argus-e2d-alert-"}}}' >/dev/null || true

e2d_intents_file="${BULK_TMPDIR}/e2d_intents.ndjson"
e2d_evals_file="${BULK_TMPDIR}/e2d_evals.ndjson"
e2d_backtests_file="${BULK_TMPDIR}/e2d_backtests.ndjson"
e2d_outcomes_file="${BULK_TMPDIR}/e2d_outcomes.ndjson"
e2d_alerts_file="${BULK_TMPDIR}/e2d_alerts.ndjson"
: >"${e2d_intents_file}"
: >"${e2d_evals_file}"
: >"${e2d_backtests_file}"
: >"${e2d_outcomes_file}"
: >"${e2d_alerts_file}"

# --- Helper: emit an approved mutation_intent row ---------------------------
emit_intent() {
  # $1=mid  $2=rule  $3=age_min  $4=status(approved|blocked|pending)
  # $5=trust_tier  $6=reason  $7=label
  local mid=$1 rule=$2 age=$3 gstatus=$4 tier=$5 reason=$6 label=$7
  local ts
  ts=$(iso_minutes_ago "${age}")
  printf '{"index":{"_id":"%s"}}\n' "${mid}" >>"${e2d_intents_file}"
  printf '{"@timestamp":"%s","mutation_intent_id":"%s","rule_id":"%s","status":"%s","label":"%s","governance_gate":{"status":"%s","reason":"%s"},"argus":{"actor":{"trust_tier":"%s"}}}\n' \
    "${ts}" "${mid}" "${rule}" "${gstatus}" "${label}" "${gstatus}" "${reason}" "${tier}" \
    >>"${e2d_intents_file}"
}

# --- Helper: emit an eval_run row -------------------------------------------
emit_eval() {
  # $1=mid  $2=rule  $3=age_min  $4=gate(pass|fail)  $5=precision  $6=recall
  # $7=fp_rate_baseline  $8=variant_coverage  $9=gate_reason
  local mid=$1 rule=$2 age=$3 gate=$4 p=$5 r=$6 fp=$7 cov=$8 reason=$9
  local ts
  ts=$(iso_minutes_ago "${age}")
  printf '{"index":{"_id":"eval-%s"}}\n' "${mid}" >>"${e2d_evals_file}"
  printf '{"@timestamp":"%s","mutation_intent_id":"%s","rule_id":"%s","status":"done","gate_decision":"%s","gate_reason":"%s","scores":{"precision":%s,"recall":%s,"fp_rate_baseline":%s,"variant_coverage":%s}}\n' \
    "${ts}" "${mid}" "${rule}" "${gate}" "${reason}" "${p}" "${r}" "${fp}" "${cov}" \
    >>"${e2d_evals_file}"
}

# --- Helper: emit a backtest row --------------------------------------------
emit_backtest() {
  # $1=mid  $2=rule  $3=age_min  $4=gate(pass|fail)  $5=windows  $6=tp  $7=fp
  local mid=$1 rule=$2 age=$3 gate=$4 w=$5 tp=$6 fp=$7
  local ts
  ts=$(iso_minutes_ago "${age}")
  printf '{"index":{"_id":"backtest-%s"}}\n' "${mid}" >>"${e2d_backtests_file}"
  printf '{"@timestamp":"%s","mutation_intent_id":"%s","rule_id":"%s","status":"done","gate_decision":"%s","windows_tested":%s,"true_positives":%s,"false_positives":%s}\n' \
    "${ts}" "${mid}" "${rule}" "${gate}" "${w}" "${tp}" "${fp}" \
    >>"${e2d_backtests_file}"
}

# --- Helper: emit an outcome row --------------------------------------------
emit_outcome_applied() {
  # $1=mid  $2=rule  $3=age_min  $4=label
  # `.soc-outcomes` is a data stream, so we must use the `create` op and
  # let ES assign the `_id`. Idempotency is handled by the _delete_by_query
  # above.
  local mid=$1 rule=$2 age=$3 label=$4
  local ts applied_ts
  ts=$(iso_minutes_ago "${age}")
  applied_ts="${ts}"
  printf '{"create":{}}\n' >>"${e2d_outcomes_file}"
  printf '{"@timestamp":"%s","mutation_intent_id":"%s","rule_id":"%s","rolled_back":false,"applied_at":"%s","status":"done","label":"%s"}\n' \
    "${ts}" "${mid}" "${rule}" "${applied_ts}" "${label}" \
    >>"${e2d_outcomes_file}"
}

emit_outcome_rolled_back() {
  # $1=mid  $2=rule  $3=applied_age_min  $4=rollback_age_min  $5=mttr_ms  $6=label
  local mid=$1 rule=$2 applied_age=$3 rollback_age=$4 mttr=$5 label=$6
  local applied_ts rolled_ts
  applied_ts=$(iso_minutes_ago "${applied_age}")
  rolled_ts=$(iso_minutes_ago "${rollback_age}")
  printf '{"create":{}}\n' >>"${e2d_outcomes_file}"
  printf '{"@timestamp":"%s","mutation_intent_id":"%s","rule_id":"%s","rolled_back":true,"applied_at":"%s","rolled_back_at":"%s","rollback_mttr_ms":%s,"status":"done","label":"%s"}\n' \
    "${rolled_ts}" "${mid}" "${rule}" "${applied_ts}" "${rolled_ts}" "${mttr}" "${label}" \
    >>"${e2d_outcomes_file}"
}

# --- Helper: emit N live alert docs matching `kibana.alert.argus.rule_id` ---
# Spreads alerts across the last `spread_min` minutes so dashboards using
# date histograms also look alive.
emit_live_alerts() {
  # $1=rule  $2=count  $3=spread_min  $4=severity
  local rule=$1 count=$2 spread=$3 sev=$4
  local i step ts
  if (( count <= 0 )); then
    return 0
  fi
  step=$(( spread / count ))
  if (( step < 1 )); then step=1; fi
  for (( i=1; i<=count; i++ )); do
    ts=$(iso_minutes_ago "$(( i * step ))")
    printf '{"index":{"_id":"argus-e2d-alert-%s-%d"}}\n' "${rule}" "${i}" >>"${e2d_alerts_file}"
    printf '{"@timestamp":"%s","kibana.alert.rule.rule_id":"%s","kibana.alert.rule.name":"%s","kibana.alert.severity":"%s","kibana.alert.status":"active","kibana.space_ids":["default"],"kibana.alert.argus":{"rule_id":"%s","demo_tag":"argus-e2d-demo"}}\n' \
      "${ts}" "${rule}" "${rule}" "${sev}" "${rule}" \
      >>"${e2d_alerts_file}"
  done
}

# ============================================================================
# Variant 1 — rule-jetbrains-teamcity-auth-bypass → RUNNING (happy path)
#   CVE-2024-27198, Pareto synthesis chosen, gate PASS, canary applied 22h ago,
#   12 detections fired in the last 24h.
# ============================================================================
emit_intent   "mut-e2d-teamcity"      "rule-jetbrains-teamcity-auth-bypass" 1400 approved trusted \
              ""                       "Canary promoted — full fleet"
emit_eval     "mut-e2d-teamcity"      "rule-jetbrains-teamcity-auth-bypass" 1395 pass 0.93 0.88 0.003 0.87 \
              "PR@k=0.91 on golden corpus"
emit_backtest "mut-e2d-teamcity"      "rule-jetbrains-teamcity-auth-bypass" 1390 pass 30 42 1
emit_outcome_applied "mut-e2d-teamcity" "rule-jetbrains-teamcity-auth-bypass" 1380 \
              "Applied and running — 100% fleet"
emit_live_alerts "rule-jetbrains-teamcity-auth-bypass" 12 1380 high

# ============================================================================
# Variant 2 — rule-paloalto-globalprotect-cmdi → CANARY RAMPING (few alerts)
#   Applied 3h ago, still at 25% of fleet, 2 detections so far.
# ============================================================================
emit_intent   "mut-e2d-paloalto"     "rule-paloalto-globalprotect-cmdi"    200 approved trusted \
              ""                       "Canary at 25% — observation window open"
emit_eval     "mut-e2d-paloalto"     "rule-paloalto-globalprotect-cmdi"    195 pass 0.91 0.82 0.004 0.78 \
              "PR@k=0.89 on golden corpus"
emit_backtest "mut-e2d-paloalto"     "rule-paloalto-globalprotect-cmdi"    190 pass 14 18 0
emit_outcome_applied "mut-e2d-paloalto" "rule-paloalto-globalprotect-cmdi"  180 \
              "Canary at 25% — healthy"
emit_live_alerts "rule-paloalto-globalprotect-cmdi" 2 180 high

# ============================================================================
# Variant 3 — rule-smartscreen-bypass-internet-shortcut → GOVERNANCE BLOCKED
#   Backtest PASS but actor trust tier too low to auto-apply. Demoes the
#   governance gate catching a rule that evaluated fine.
# ============================================================================
emit_intent   "mut-e2d-smartscreen"  "rule-smartscreen-bypass-internet-shortcut" 340 blocked probationary \
              "Actor trust tier (probationary) below auto-apply threshold" \
              "Blocked on governance gate — HITL review required"
emit_eval     "mut-e2d-smartscreen"  "rule-smartscreen-bypass-internet-shortcut" 335 pass 0.89 0.80 0.005 0.82 \
              "PR@k=0.87 on golden corpus"
emit_backtest "mut-e2d-smartscreen"  "rule-smartscreen-bypass-internet-shortcut" 330 pass 14 12 0
# No outcome, no live alerts — rule never shipped.

# ============================================================================
# Variant 4 — rule-soc-1024 → RUNNING (happy path, LSASS dump)
#   Shares the CVE-2026-18001 advisory. Seed a NEW (more recent) intent so
#   the E2D route — which does `sort @timestamp desc size: 1` per rule_id —
#   picks this governance-approved doc over the older mut-intent-42 from
#   section 2, which pre-dates the governance_gate field. Note we keep the
#   historical 55 rollback outcomes from section 2 intact (demo-relevant
#   MTTR lineage) and just stamp our `applied` outcome with a much fresher
#   timestamp (5 minutes ago) so the E2D "running" stage picks it up.
# ============================================================================
emit_intent   "mut-e2d-lsass"        "rule-soc-1024"                       15 approved trusted \
              ""                       "Auto-apply approved — canary promoted"
emit_eval     "mut-e2d-lsass"        "rule-soc-1024"                       12 pass 0.93 0.84 0.004 0.85 \
              "PR@k=0.91 on golden corpus"
emit_backtest "mut-e2d-lsass"        "rule-soc-1024"                       10 pass 30 38 0
emit_outcome_applied "mut-e2d-lsass" "rule-soc-1024"                       5 \
              "Applied and running — observation window closed clean"
emit_live_alerts "rule-soc-1024" 8 720 high

# ============================================================================
# Variant 5 — rule-argus-t1059-powershell-encoded → BACKTEST FAILED
#   Offline eval passed but 30-day replay lit up too many benign events.
#   The auto-apply path never fires — no outcome, no live alerts.
# ============================================================================
emit_intent   "mut-e2d-psenc"        "rule-argus-t1059-powershell-encoded" 260 pending trusted \
              ""                       "Awaiting backtest gate"
emit_eval     "mut-e2d-psenc"        "rule-argus-t1059-powershell-encoded" 255 pass 0.88 0.76 0.006 0.79 \
              "PR@k=0.84 on golden corpus"
emit_backtest "mut-e2d-psenc"        "rule-argus-t1059-powershell-encoded" 250 fail 30 11 47
# No outcome, no live alerts — backtest gate rejected the candidate.

# ============================================================================
# Variant 6 — rule-argus-t1566-phishing-link → APPLIED THEN ROLLED BACK
#   Full pipeline PASS, canary rolled out, observer detected regression,
#   rollback mutation_intent emitted — rule reverted to v(n-1). 3 detections
#   fired in the first hour before rollback.
# ============================================================================
emit_intent   "mut-e2d-phishlink"    "rule-argus-t1566-phishing-link"      120 approved trusted \
              ""                       "Canary rolled back — regression detected"
emit_eval     "mut-e2d-phishlink"    "rule-argus-t1566-phishing-link"      115 pass 0.90 0.83 0.004 0.81 \
              "PR@k=0.88 on golden corpus"
emit_backtest "mut-e2d-phishlink"    "rule-argus-t1566-phishing-link"      110 pass 21 22 1
emit_outcome_rolled_back "mut-e2d-phishlink" "rule-argus-t1566-phishing-link" 105 30 92000 \
              "Regression detected — spike + tp_drop. Auto-rollback fired."
# Seed the 3 alerts at the tail of the window so they are visually BEFORE
# the rollback timestamp (30m ago). spread=90 → alerts between 30m–120m ago.
emit_live_alerts "rule-argus-t1566-phishing-link" 3 90 medium

# ============================================================================
# Autonomy-flow advisories (argus-adv-*-2026-04) — these come from the
# `run_exploit_to_detection` CLI path, which historically wrote the advisory
# doc with `cve` (not `cve_id`) and never seeded downstream mutation_intent /
# eval / backtest / outcome docs for their synthetic `draft_rule_id`s. That
# left the E2D flow panel mostly empty for the last three rows of the CVE
# picker ("Defender disable", "DNS C2", "PowerShell Encoded-Command").
#
# We fix both in place:
#   a) Backfill `cve_id` on the advisory docs (idempotent update_by_query,
#      keyed on `advisory_id.keyword`).
#   b) Emit E2D variants 7/8/9 keyed on each advisory's synthetic rule_id,
#      each telling a different story so all three panels render 8 full
#      stages with realistic precision / recall / gate outcomes.
# ============================================================================

# --- (a) Backfill cve_id on the three autonomy-flow advisory docs -----------
echo "[argus-seed] backfilling cve_id on autonomy-flow advisory docs"
for adv_entry in \
  "argus-adv-defender-disable-2026-04|CVE-2026-18210" \
  "argus-adv-dns-c2-2026-04|CVE-2026-18103" \
  "argus-adv-ps-encoded-2026-04|CVE-2026-18042"; do
  adv_id=${adv_entry%%|*}
  cve_id=${adv_entry##*|}
  # `.soc-cve-advisories` maps `advisory_id` directly as `keyword`, so the
  # bare term clause (no `.keyword` subfield) is the correct lookup.
  "${CURL[@]}" -X POST "${ES_URL}/.soc-cve-advisories/_update_by_query?refresh=true&pipeline=_none" \
    -d "$(cat <<JSON
{
  "query": { "term": { "advisory_id": "${adv_id}" } },
  "script": {
    "lang": "painless",
    "source": "if (ctx._source.cve_id == null) { ctx._source.cve_id = params.cid; } if (ctx._source.cve == null) { ctx._source.cve = params.cid; }",
    "params": { "cid": "${cve_id}" }
  }
}
JSON
)" >/dev/null || true
done

# ============================================================================
# Variant 7 — argus.defense-evasion.t1562_001.argus-adv-defender-disable-2026-04
#   CVE-2026-18210, autonomy-flow advisory. Canary applied 1h ago, running
#   healthy with 6 hits in the last 24h.
# ============================================================================
emit_intent   "mut-e2d-defender"     "argus.defense-evasion.t1562_001.argus-adv-defender-disable-2026-04"     75 approved trusted \
              ""                       "Auto-apply approved — canary promoted"
emit_eval     "mut-e2d-defender"     "argus.defense-evasion.t1562_001.argus-adv-defender-disable-2026-04"     70 pass 0.93 0.80 0.003 0.90 \
              "PR@k=0.90 on autonomy-flow corpus"
emit_backtest "mut-e2d-defender"     "argus.defense-evasion.t1562_001.argus-adv-defender-disable-2026-04"     65 pass 30 28 1
emit_outcome_applied "mut-e2d-defender" "argus.defense-evasion.t1562_001.argus-adv-defender-disable-2026-04"  60 \
              "Applied and running — 100% fleet"
emit_live_alerts "argus.defense-evasion.t1562_001.argus-adv-defender-disable-2026-04" 6 600 high

# ============================================================================
# Variant 8 — argus.command-and-control.t1071_004.argus-adv-dns-c2-2026-04
#   CVE-2026-18103, autonomy-flow advisory. CANARY ramping at 50%, 3 hits
#   so far, applied 2h ago.
# ============================================================================
emit_intent   "mut-e2d-dnsc2"        "argus.command-and-control.t1071_004.argus-adv-dns-c2-2026-04"          150 approved trusted \
              ""                       "Canary at 50% — observation window open"
emit_eval     "mut-e2d-dnsc2"        "argus.command-and-control.t1071_004.argus-adv-dns-c2-2026-04"          145 pass 0.90 0.82 0.004 0.88 \
              "PR@k=0.88 on autonomy-flow corpus"
emit_backtest "mut-e2d-dnsc2"        "argus.command-and-control.t1071_004.argus-adv-dns-c2-2026-04"          140 pass 21 18 2
emit_outcome_applied "mut-e2d-dnsc2" "argus.command-and-control.t1071_004.argus-adv-dns-c2-2026-04"          120 \
              "Canary at 50% — healthy"
emit_live_alerts "argus.command-and-control.t1071_004.argus-adv-dns-c2-2026-04" 3 400 medium

# ============================================================================
# Variant 9 — argus.execution.t1059_001.argus-adv-ps-encoded-2026-04
#   CVE-2026-18042, autonomy-flow advisory. GOVERNANCE BLOCKED — backtest
#   passed but the actor is probationary, so HITL review is required before
#   apply. No outcome, no live alerts.
# ============================================================================
emit_intent   "mut-e2d-psencadv"     "argus.execution.t1059_001.argus-adv-ps-encoded-2026-04"                 220 blocked probationary \
              "Actor trust tier (probationary) below auto-apply threshold" \
              "Blocked on governance gate — HITL review required"
emit_eval     "mut-e2d-psencadv"     "argus.execution.t1059_001.argus-adv-ps-encoded-2026-04"                 215 pass 0.87 0.78 0.006 0.84 \
              "PR@k=0.85 on autonomy-flow corpus"
emit_backtest "mut-e2d-psencadv"     "argus.execution.t1059_001.argus-adv-ps-encoded-2026-04"                 210 pass 21 16 2

# --- Post the 5 bulk files --------------------------------------------------
post_bulk_file "e2d_intents" \
  "${ES_URL}/.soc-mutation-intents/_bulk?refresh=true" \
  "${e2d_intents_file}"

# --- Attach draft_rule bodies to the 3 walkthrough mutation intents ---------
# The E2D "Rule synthesized" stage reads .soc-mutation-intents and renders any
# `draft_rule` field in the flyout. Enriching the walkthrough intents lets the
# demo show what Argus actually wrote — not just metadata.
enrich_intent_with_draft_rule() {
  # $1=mutation_intent_id  $2=rule_id  $3=name  $4=description  $5=severity
  # $6=risk_score  $7=language  $8=query  $9=mitre_json  $10=justification_json
  local mid=$1 rule=$2 name=$3 desc=$4 sev=$5 risk=$6 lang=$7 query=$8 mitre=$9 just="${10}"
  local body
  body="$(cat <<JSON
{
  "doc": {
    "draft_rule": {
      "rule_id": "${rule}",
      "rule_version": "1",
      "name": "${name}",
      "description": "${desc}",
      "severity": "${sev}",
      "risk_score": ${risk},
      "language": "${lang}",
      "mitre": ${mitre},
      "query": "${query}",
      "justification": ${just}
    },
    "details": {
      "artifact_type": "rule",
      "artifact_id": "${rule}",
      "op": "create",
      "expected_ownership": "autosoc"
    }
  }
}
JSON
  )"
  "${CURL[@]}" -X POST \
    "${ES_URL}/.soc-mutation-intents/_update/${mid}?refresh=true" \
    -d "${body}" >/dev/null || true
}

enrich_intent_with_draft_rule \
  "mut-e2d-defender" \
  "argus.defense-evasion.t1562_001.argus-adv-defender-disable-2026-04" \
  "Argus — Windows Defender tampering (T1562.001)" \
  "Detects PowerShell invocations that disable or weaken Microsoft Defender real-time protection or add exclusion paths. Anchored on Set-MpPreference / Add-MpPreference tokens that are rare outside of admin-authored GPO scripts, which is the invariant behind the autonomy-flow advisory." \
  "high" "73" "kuery" \
  "process.name:(\\\"powershell.exe\\\" or \\\"pwsh.exe\\\") and process.args:(\\\"Set-MpPreference\\\" or \\\"Add-MpPreference\\\") and process.command_line:(*DisableRealtimeMonitoring* or *DisableBehaviorMonitoring* or *ExclusionPath* or *ExclusionExtension*)" \
  '[{"technique_id":"T1562.001","technique_name":"Disable or Modify Tools","tactic":"defense-evasion"}]' \
  '{"advisory_excerpts":["argus-adv-defender-disable-2026-04: observed operators running Set-MpPreference -DisableRealtimeMonitoring $true before executing stage-two payloads.","Autonomy-flow corpus confirms the same PowerShell parent spawning downloader children within 30s of tampering."],"observable_signals":["defender_tamper: Set-MpPreference / Add-MpPreference with DisableRealtimeMonitoring, DisableBehaviorMonitoring or ExclusionPath tokens","ps_parent: powershell.exe / pwsh.exe as the process name (not a Microsoft-signed Defender binary)"],"precision_hypothesis":"FP budget bounded by requiring BOTH a PowerShell process name AND a tampering token. Legitimate GPO scripts match, but are suppressed by the allow-list of signed admin tooling in the eval harness; FP rate on the 30-day replay was 1/28."}'

enrich_intent_with_draft_rule \
  "mut-e2d-dnsc2" \
  "argus.command-and-control.t1071_004.argus-adv-dns-c2-2026-04" \
  "Argus — DNS tunnel to untrusted resolver (T1071.004)" \
  "Detects DNS traffic to a registered domain with high entropy subdomains resolved against non-enterprise resolvers. This is the invariant behind argus-adv-dns-c2-2026-04, where the actor beacons via TXT queries encoding stage-two C2." \
  "medium" "57" "kuery" \
  "event.dataset:\\\"dns\\\" and dns.question.type:(\\\"TXT\\\" or \\\"NULL\\\") and dns.question.registered_domain:(\\\"tunnel.example-c2.com\\\" or \\\"beacon.sb-c2.net\\\") and not destination.ip:(\\\"10.0.0.0/8\\\" or \\\"172.16.0.0/12\\\" or \\\"192.168.0.0/16\\\")" \
  '[{"technique_id":"T1071.004","technique_name":"DNS","tactic":"command-and-control"}]' \
  '{"advisory_excerpts":["argus-adv-dns-c2-2026-04: implant beacons via 32-char hex subdomains of tunnel.example-c2.com over TXT every 60s.","Packet captures show TTL=0 and response entropy >4.5 — well above benign TXT baselines."],"observable_signals":["dns_txt: TXT/NULL query types carrying base32-encoded payloads","non_rfc1918_resolver: destination.ip outside enterprise resolver ranges","registered_domain: registered_domain matches the advisory IOC set"],"precision_hypothesis":"IOC-anchored match keeps FPs near zero (2/21 in backtest). Generalization relies on the entropy + resolver invariants for variants beyond the seeded domains."}'

enrich_intent_with_draft_rule \
  "mut-e2d-psencadv" \
  "argus.execution.t1059_001.argus-adv-ps-encoded-2026-04" \
  "Argus — PowerShell encoded command (T1059.001)" \
  "Detects powershell.exe / pwsh.exe invocations using -EncodedCommand with long base64 payloads. Encoded invocations bypass script-block logging hooks that rely on plaintext args, which is the invariant exploited in argus-adv-ps-encoded-2026-04." \
  "high" "68" "kuery" \
  "process.name:(\\\"powershell.exe\\\" or \\\"pwsh.exe\\\") and process.args:(\\\"-enc\\\" or \\\"-EncodedCommand\\\" or \\\"-ec\\\" or \\\"-e\\\") and process.args:/[A-Za-z0-9+\\\\/=]{120,}/" \
  '[{"technique_id":"T1059.001","technique_name":"PowerShell","tactic":"execution"}]' \
  '{"advisory_excerpts":["argus-adv-ps-encoded-2026-04: operators launched powershell -enc <base64> to stage an in-memory downloader.","Encoded payload decodes to IEX (New-Object Net.WebClient).DownloadString — classic T1059.001."],"observable_signals":["ps_encoded_flag: -enc / -EncodedCommand / short-form -ec or -e as a process.args token","long_b64_arg: base64-looking process arg of 120+ chars immediately following the flag","ps_parent: canonical PowerShell process name"],"precision_hypothesis":"Requiring BOTH the flag AND a long base64 token keeps admin one-liners (-Command \\\"Get-Service\\\") out of scope. Probationary trust gate blocks auto-apply despite backtest passing."}'

post_bulk_file "e2d_evals" \
  "${ES_URL}/.soc-detection-eval-runs/_bulk?refresh=true" \
  "${e2d_evals_file}"
post_bulk_file "e2d_backtests" \
  "${ES_URL}/.soc-backtest-results/_bulk?refresh=true" \
  "${e2d_backtests_file}"
post_bulk_file "e2d_outcomes" \
  "${ES_URL}/.soc-outcomes/_bulk?refresh=true" \
  "${e2d_outcomes_file}"
post_bulk_file "e2d_alerts" \
  "${ES_URL}/.internal.alerts-security.alerts-default-000001/_bulk?refresh=true" \
  "${e2d_alerts_file}"

# ============================================================================
# 14. Prebuilt-rule enablements — Argus doesn't only synthesise custom rules,
#     it also autonomously enables Elastic's prebuilt detection rules when
#     the community-vetted candidate beats Argus's Pareto frontier on
#     PR@k / false-positive cost. This section:
#
#       14a. Actually enables a curated subset of prebuilt rules via the
#            Kibana detection-engine bulk-action API, so operators opening
#            the Rules list see live "enabled" prebuilt rules.
#       14b. Emits 7 autonomy-decision docs with `artifact_type:
#            "prebuilt_rule"` spanning all 6 UI status buckets (auto_applied
#            × 4, required_human × 1, rolled_back × 1, deferred × 1,
#            rejected × 1) so the Autonomy panel has a visible "Argus
#            enabled prebuilt rule X" narrative alongside the custom-rule
#            decisions.
#
#     The backend autonomy_decisions route treats `rule` and `prebuilt_rule`
#     identically for rule-id resolution — they both carry a logical rule_id
#     in `artifact_id` and `findRules({ ruleIds })` returns the Kibana
#     saved-object id + name for both, which the UI uses to deep-link into
#     the rule details page.
#
#     Assumes the prebuilt rule package is installed. If it isn't, the bulk
#     enable call will return 4xx for unknown ids and we fall through —
#     operators can re-run after:
#       curl -X POST $KBN_URL/internal/detection_engine/prebuilt_rules/installation/_perform \
#            -H 'kbn-xsrf: true' -H 'elastic-api-version: 1' -H 'Content-Type: application/json' \
#            -d '{"mode":"ALL_RULES"}'
# ============================================================================

KBN_URL="${KBN_URL:-http://localhost:15601}"

# Curated 7-rule set. Each entry pairs the Kibana saved-object UUID (used by
# the bulk-enable API) with the prebuilt logical rule_id (used as
# `artifact_id` in the autonomy decisions so the route can resolve it back
# via findRules → details page deep-link).
#
#   format: <kibana_uuid>|<logical_rule_id>|<display_name>
PREBUILT_CATALOG=(
  "9ee0aacc-3140-4349-996a-365b1c4a8e1a|2c17e5d7-08b9-43b2-b58a-0270d65ac85b|Windows Defender Exclusions Added via PowerShell"
  "f1086fd8-c18c-4882-81ec-1f754172b020|c124dc1b-cef2-4d01-8d74-ff6b0d5096b6|PowerShell Script with Windows Defender Tampering Capabilities"
  "0fb4e94f-f774-4bb6-a167-f81b5f683dd9|c8cccb06-faf2-4cd5-886e-2c9636cfcb87|Disabling Windows Defender Security Settings via PowerShell"
  "5264ddd4-35a0-4c01-9a15-9377ea8e457c|2ffa1f1e-b6db-47fa-994b-1512743847eb|Windows Defender Disabled via Registry Modification"
  "0355aa7b-ee72-4f21-8718-3f24735a586c|083383af-b9a4-42b7-a463-29c40efe7797|Potential PowerShell Obfuscation via Concatenated Dynamic Command Invocation"
  "b23867f2-0d50-4471-8558-7d212cd474fb|577ec21e-56fe-4065-91d8-45eb8224fe77|PowerShell MiniDump Script"
  "77b843e7-3dfa-4feb-8482-21d7840d1079|11013227-0301-4a8c-b150-4db924484475|Abnormally Large DNS Response"
)

# 14a. Actually enable the 4 rules that will show `final_status=auto_applied`
# below. The other 3 decisions describe states that either shouldn't result
# in the rule being enabled (required_human/rolled_back/deferred/rejected)
# or represent a historical enable + rollback — leaving those disabled in
# Kibana keeps the operator's mental model consistent with the decision log.
PREBUILT_ENABLE_UUIDS=(
  "9ee0aacc-3140-4349-996a-365b1c4a8e1a"  # Defender exclusions via PS
  "0fb4e94f-f774-4bb6-a167-f81b5f683dd9"  # Disabling Defender via PS
  "0355aa7b-ee72-4f21-8718-3f24735a586c"  # PS obfuscation
  "77b843e7-3dfa-4feb-8482-21d7840d1079"  # Abnormally Large DNS Response
)

enable_ids_json="["
first=1
for id in "${PREBUILT_ENABLE_UUIDS[@]}"; do
  if [[ $first -eq 1 ]]; then first=0; else enable_ids_json+=","; fi
  enable_ids_json+="\"${id}\""
done
enable_ids_json+="]"

enable_resp=$(curl -sS -u "${ES_AUTH}" \
  -H 'kbn-xsrf: true' \
  -H 'Content-Type: application/json' \
  -H 'elastic-api-version: 2023-10-31' \
  --max-time 20 \
  -X POST "${KBN_URL}/api/detection_engine/rules/_bulk_action?dry_run=false" \
  -d "{\"action\":\"enable\",\"ids\":${enable_ids_json}}" \
  -w '\n__HTTP__%{http_code}' || echo $'\n__HTTP__000')
enable_http="${enable_resp##*__HTTP__}"
echo "[argus-seed] prebuilt bulk-enable http=${enable_http} (targets=${#PREBUILT_ENABLE_UUIDS[@]})"

# 14b. Autonomy decisions — one ndjson doc per decision, `create` action
#      because `.soc-autonomy-decisions` is a data stream.
prebuilt_autonomy_file=$(mktemp)
trap 'rm -f "${prebuilt_autonomy_file}"' EXIT

# Usage:
#   emit_prebuilt_decision \
#     <age_min> <artifact_id> <rule_name_hint> <action> <agent> \
#     <final_status> <auto_applied> <required_human> \
#     <gates_passed_json_array> <first_failing_gate_or_empty> \
#     <review_reason> <confidence_int> <trust_tier>
emit_prebuilt_decision() {
  local age=$1 aid=$2 name=$3 act=$4 agent=$5
  local status=$6 autoap=$7 reqh=$8
  local gp=$9 ffail="${10}" reason="${11}" conf="${12}" tier="${13}"
  local ts ffail_fragment=""
  ts=$(iso_minutes_ago "${age}")
  if [[ -n "${ffail}" ]]; then
    ffail_fragment="\"first_failing_gate\":\"${ffail}\","
  fi
  printf '{"create":{}}\n' >>"${prebuilt_autonomy_file}"
  printf '{"@timestamp":"%s","artifact_type":"prebuilt_rule","artifact_id":"%s","rule_name_hint":"%s","action":"%s","source_agent":"%s","source_workflow":"soc-prebuilt-rule-enabler","gates_evaluated":["trust","backtest","regression","signal_quality"],"gates_passed":%s,%s"final_status":"%s","auto_applied":%s,"required_human":%s,"review_reason":"%s","confidence":%s,"trust_tier":"%s","advisory_ref":"argus-adv-prebuilt-reuse"}\n' \
    "${ts}" "${aid}" "${name}" "${act}" "${agent}" \
    "${gp}" "${ffail_fragment}" "${status}" "${autoap}" "${reqh}" \
    "${reason}" "${conf}" "${tier}" \
    >>"${prebuilt_autonomy_file}"
}

# 4× auto_applied — Argus picked a prebuilt rule over its own synthesised
# Pareto-frontier candidate because PR@k was higher and FP cost lower.
emit_prebuilt_decision  8  "2c17e5d7-08b9-43b2-b58a-0270d65ac85b" \
  "Windows Defender Exclusions Added via PowerShell" "enable" "argus-prebuilt-enabler" \
  "auto_applied" true false \
  '["trust","backtest","regression","signal_quality"]' "" \
  "Prebuilt rule matched advisory argus-adv-defender-disable-2026-04 with 22 TP / 0 FP on 30-day replay; reused instead of synthesising a new custom rule." \
  94 "trusted"

emit_prebuilt_decision  22 "c8cccb06-faf2-4cd5-886e-2c9636cfcb87" \
  "Disabling Windows Defender Security Settings via PowerShell" "enable" "argus-prebuilt-enabler" \
  "auto_applied" true false \
  '["trust","backtest","regression","signal_quality"]' "" \
  "Community-vetted prebuilt rule dominates Argus synthesised candidate on cost × PR@k; enabled as the chosen response to the Defender-tamper advisory." \
  91 "trusted"

emit_prebuilt_decision  41 "083383af-b9a4-42b7-a463-29c40efe7797" \
  "Potential PowerShell Obfuscation via Concatenated Dynamic Command Invocation" "enable" "argus-prebuilt-enabler" \
  "auto_applied" true false \
  '["trust","backtest","regression","signal_quality"]' "" \
  "Prebuilt PowerShell obfuscation rule covers argus-adv-ps-encoded-2026-04 with PR@k=0.92; reused rather than synthesised." \
  90 "trusted"

emit_prebuilt_decision  72 "11013227-0301-4a8c-b150-4db924484475" \
  "Abnormally Large DNS Response" "enable" "argus-prebuilt-enabler" \
  "auto_applied" true false \
  '["trust","backtest","regression","signal_quality"]' "" \
  "DNS-C2 advisory argus-adv-dns-c2-2026-04 — prebuilt rule PR@k 0.90, backtest 18 TP / 2 FP on DNS-tunnel replay. Enabled in place of synthesis." \
  88 "trusted"

# 1× required_human — high-severity prebuilt rule, signal-quality gate
# flagged noisy hosts so Argus holds for analyst ack.
emit_prebuilt_decision  120 "577ec21e-56fe-4065-91d8-45eb8224fe77" \
  "PowerShell MiniDump Script" "enable" "argus-prebuilt-enabler" \
  "required_human" false true \
  '["trust","backtest","regression"]' "signal_quality" \
  "High-severity prebuilt rule — signal-quality gate flagged 3 noisy admin jump-hosts in prod. Queued for human approval before enable." \
  78 "probationary"

# 1× rolled_back — Argus enabled, FP spike after 40 min, auto-rollback
# disabled the prebuilt rule.
emit_prebuilt_decision  205 "2ffa1f1e-b6db-47fa-994b-1512743847eb" \
  "Windows Defender Disabled via Registry Modification" "disable" "argus-rollback-agent" \
  "rolled_back" false false \
  '["trust","backtest","regression"]' "regression" \
  "Rolled back — 12× FP spike on domain controllers 40 min after enable; auto-rollback reverted the rule to disabled." \
  61 "trusted"

# 1× deferred — awaiting backtest on a high-value prebuilt rule.
emit_prebuilt_decision  290 "56f2e9b5-4803-4e44-a0a4-a52dc79d57fe" \
  "PowerShell PSReflect Script" "enable" "argus-prebuilt-enabler" \
  "deferred" false false \
  '["trust","regression"]' "" \
  "Passed trust and regression gates; deferred pending 30-day PowerShell-corpus backtest (queued)." \
  0 "trusted"

# 1× rejected — regression gate rejected during backtest replay.
emit_prebuilt_decision  400 "0ab319ef-92b8-4c7f-989b-5de93c852e93" \
  "Statistical Model Detected C2 Beaconing Activity with High Confidence" "enable" "argus-prebuilt-enabler" \
  "rejected" false false \
  '["trust"]' "backtest" \
  "Rejected — ML C2-beacon prebuilt rule fired on known-clean metricbeat nodes in 30-day replay (7 FP / 0 TP in golden window)." \
  42 "probationary"

post_bulk_file "prebuilt_autonomy" \
  "${ES_URL}/.soc-autonomy-decisions/_bulk?refresh=true" \
  "${prebuilt_autonomy_file}"

echo "[argus-seed] done."
echo ""
echo "Subjects wired:"
echo "  alert:alert-abc      → pivots to mut-intent-42 (lineage) and run-7a3 (reasoning)"
echo "  rule:rule-soc-1024   → mut-intent-42 lineage (synthesis → eval → backtest → apply → observe/outcome rollback)"
echo "  run:run-7a3          → 6-span reasoning chain (thought → tool_call → tool_result → thought → decision → recommendation)"
echo "  run:run-9c1          → 3-span governance chain (tool_call → decision with injection flags → recommendation)"
echo ""
echo "Rich demo data:"
echo "  .soc-mutation-intents    → 24 intents (14 applied · 6 blocked · 4 drift)"
echo "  .soc-outcomes            → 55 rollback samples + 18 applied alignment rows"
echo "  .soc-actor-trust-tiers   → 10 actors (1 system · 5 trusted · 2 probationary · 1 untrusted · 1 quarantined)"
echo "  .soc-reasoning-trace     → 3 extra demo runs × 10 spans (run-demo-ransom · run-demo-identity · run-demo-cloud)"
echo "  .soc-detection-eval-runs → 15 eval runs"
echo "  .soc-backtest-results    → 15 backtest runs"
echo "  .soc-recommendations     → 15 rule-application recommendations + 6 canonical Pareto syntheses"
echo "  .soc-cve-advisories      → 6 canonical CVE advisories linked to Pareto syntheses"
echo "  .soc-detection-corpus    → ~30 community detections + 6 Argus-authored (source=argus)"
echo "  .soc-threat-profiles     → 3 built-in profiles (ransomware · IT→OT · living-off-the-land)"
echo "  .soc-threat-actors       → 3 actors (Dragonfly · LAPSUS$ · APT29) with technique lists"
echo "  .soc-coverage-gaps       → 15 open gaps across 5 data sources (winlogbeat · endgame · system.auth · okta.system · packetbeat)"
echo ""
echo "Canonical Pareto syntheses (Proposals panel / now-24h):"
echo "  CVE-2024-27198 → rule-jetbrains-teamcity-auth-bypass (T1190/T1078)"
echo "  CVE-2024-3400  → rule-paloalto-globalprotect-cmdi (T1190/T1059.004)"
echo "  CVE-2024-21412 → rule-smartscreen-bypass-internet-shortcut (T1211/T1566.001)"
echo "  CVE-2026-18001 → rule-soc-1024 (T1003.001/T1059.001)"
echo "  CVE-2024-38178 → rule-argus-t1059-powershell-encoded (T1059.001/T1027)"
echo "  CVE-2024-49113 → rule-argus-t1566-phishing-link (T1566.002/T1204.001)"
echo ""
echo "E2D flow variants (Exploit→Detection panel — pick a CVE to demo each):"
echo "  CVE-2024-27198 → RUNNING (happy path, 12 hits/24h)"
echo "  CVE-2024-3400  → CANARY RAMPING (applied 3h ago, 2 hits/24h)"
echo "  CVE-2024-21412 → GOVERNANCE BLOCKED (probationary actor, HITL required)"
echo "  CVE-2026-18001 → RUNNING (LSASS dump, 8 hits/24h)"
echo "  CVE-2024-38178 → BACKTEST FAILED (11 TP / 47 FP, gate rejected)"
echo "  CVE-2024-49113 → APPLIED THEN ROLLED BACK (canary regression, MTTR 92s)"
echo ""
echo "Prebuilt-rule enablements (Autonomy panel — Argus can also reuse prebuilt rules):"
echo "  4 auto_applied  → Defender tamper × 2, PowerShell obfuscation × 1, DNS C2 × 1"
echo "  1 required_human → PowerShell MiniDump (signal-quality gate, HITL)"
echo "  1 rolled_back   → Defender registry modification (FP spike, auto-rollback)"
echo "  1 deferred      → PowerShell PSReflect (awaiting backtest)"
echo "  1 rejected      → ML C2 Beacon (regression detected on metricbeat)"

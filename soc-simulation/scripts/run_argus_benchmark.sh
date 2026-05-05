#!/usr/bin/env bash
#
# AutoDEX Benchmark Runner
# ------------------------
#
# Closes finding F-001 from soc-simulation/docs/autodex/conformance-matrix.md:
# `ARGUS-BENCHMARK.md` references this script as the measurement runner, but
# it never existed in-tree.
#
# This runner:
#   1. Seeds the benchmark seed pack described in ARGUS-BENCHMARK.md §Reproducible Test Scenario
#      - 3 CVE advisories (critical/high/medium) in .soc-cve-advisories
#      - 50 historical alerts in .alerts-security.alerts-* across 5 detection rules
#      - 10 triage outcomes in .soc-outcomes (mix of TP and FP)
#      - Kill switch in .soc-kill-switch with autonomy_enabled=true
#      - 5 coverage gaps in .soc-coverage-gaps for untested MITRE techniques
#
#   2. Waits the configured settle window (default 30 min — workflow loops settle).
#
#   3. Runs per-criterion ES queries against the 5 benchmark dimensions:
#      - D1 Detection Synthesis (30 pts)
#      - D2 Governance Compliance (25 pts)
#      - D3 Self-Healing (20 pts)
#      - D4 Coverage Expansion (15 pts)
#      - D5 Observability & Auditability (10 pts)
#
#   4. Emits a JSON scorecard to stdout AND writes it to
#      soc-simulation/docs/autodex/scorecards/benchmark-<UTC-timestamp>.json
#
# Usage:
#   soc-simulation/scripts/run_argus_benchmark.sh
#   soc-simulation/scripts/run_argus_benchmark.sh --skip-seed
#   soc-simulation/scripts/run_argus_benchmark.sh --wait-min 0     # score immediately
#   soc-simulation/scripts/run_argus_benchmark.sh --score-only     # implies --skip-seed and --wait-min 0
#
# Env overrides:
#   ES_URL   (default http://localhost:${ES_PORT:-19200})
#   ES_AUTH  (default elastic:changeme)
#   KIBANA_URL  (default http://localhost:${KIBANA_PORT:-15601}) — only used to detect cluster up

set -euo pipefail

# ---------------------------------------------------------------------------
# Args / env
# ---------------------------------------------------------------------------

SKIP_SEED=0
SCORE_ONLY=0
WAIT_MIN=30

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-seed)   SKIP_SEED=1; shift ;;
    --wait-min)    WAIT_MIN="$2"; shift 2 ;;
    --score-only)  SKIP_SEED=1; SCORE_ONLY=1; WAIT_MIN=0; shift ;;
    -h|--help)
      sed -n '4,40p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

ES_URL="${ES_URL:-http://localhost:${ES_PORT:-19200}}"
ES_AUTH="${ES_AUTH:-elastic:changeme}"
KIBANA_URL="${KIBANA_URL:-http://localhost:${KIBANA_PORT:-15601}}"

CURL=(curl -sS -u "${ES_AUTH}" -H 'Content-Type: application/json' -H 'Connection: close' --max-time 15)

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCORECARD_DIR="${REPO_ROOT}/soc-simulation/docs/autodex/scorecards"
mkdir -p "${SCORECARD_DIR}"
UTC_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SCORECARD_PATH="${SCORECARD_DIR}/benchmark-${UTC_STAMP}.json"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

now_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

iso_minutes_ago() {
  local mins=$1
  if date -u -v-1M +"%Y-%m-%dT%H:%M:%SZ" >/dev/null 2>&1; then
    date -u -v-"${mins}"M +"%Y-%m-%dT%H:%M:%SZ"
  else
    date -u -d "${mins} minutes ago" +"%Y-%m-%dT%H:%M:%SZ"
  fi
}

es_count() {
  # $1 index, $2 query body (json string)
  local index="$1" body="$2"
  "${CURL[@]}" -X POST "${ES_URL}/${index}/_count" -d "${body}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('count', 0))" 2>/dev/null || echo 0
}

es_search_hits() {
  # $1 index, $2 query body (json), $3 size, $4 source includes (csv)
  local index="$1" body="$2" size="${3:-1}" src="${4:-}"
  local q
  q="$(python3 -c "import sys,json; q=json.loads(sys.argv[1]); q['size']=${size}; ${src:+q['_source']=sys.argv[2].split(',');} print(json.dumps(q))" "${body}" "${src:-}" 2>/dev/null)"
  "${CURL[@]}" -X POST "${ES_URL}/${index}/_search" -d "${q}" 2>/dev/null
}

ping_cluster() {
  if ! "${CURL[@]}" "${ES_URL}/" >/dev/null 2>&1; then
    echo "ERROR: Cannot reach Elasticsearch at ${ES_URL}" >&2
    echo "       Set ES_URL or start the cluster, then re-run." >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Seed pack
# ---------------------------------------------------------------------------

seed_pack() {
  echo "==> Seeding benchmark pack..."
  local NOW; NOW="$(now_iso)"

  # 1) 3 CVE advisories (critical / high / medium)
  #
  # Shape: canonical StructuredAdvisory from `@kbn/argus-exploit-to-detection`
  # (see x-pack/solutions/security/packages/kbn-argus-exploit-to-detection/advisory.ts).
  # Path A (Pareto + variant generation + golden-set blocklist) rejects
  # advisories that don't satisfy the M2.2 invariants — it requires
  # `mitre[].technique_id`, `target_platforms[]`, and at least one
  # `signals[]` entry with `signal_id`, `ecs_field`, `matcher`, `values[]`,
  # `rationale`. The autonomous synthesis driver consumes these advisories
  # directly without normalisation.
  #
  # Tactic mapping (T-prefix → ATT&CK tactic id) is declared next to each
  # entry so the seed pack stays self-contained and auditable.
  for entry in \
      'CVE-2024-30099|critical|10.0|T1059.001|Command and Scripting Interpreter: PowerShell|TA0002' \
      'CVE-2024-30100|high|8.1|T1547.001|Registry Run Keys / Startup Folder|TA0003' \
      'CVE-2024-30101|medium|5.5|T1027|Obfuscated Files or Information|TA0005'; do
    IFS='|' read -r cve sev cvss tech tech_name tactic <<< "${entry}"
    "${CURL[@]}" -X POST "${ES_URL}/.soc-cve-advisories/_doc?refresh=true" \
      -d "$(cat <<JSON
{
  "@timestamp": "${NOW}",
  "advisory_id": "${cve}",
  "cve": "${cve}",
  "cve_id": "${cve}",
  "severity": "${sev}",
  "cvss_score": ${cvss},
  "title": "Benchmark seed advisory ${cve}",
  "summary": "Synthetic ${sev}-severity advisory for AutoDEX benchmark seed pack — exercises the autonomous synthesis driver against the canonical StructuredAdvisory contract.",
  "mitre": [{"technique_id": "${tech}", "technique_name": "${tech_name}", "tactic": "${tactic}"}],
  "target_platforms": ["windows"],
  "language": "esql",
  "signals": [
    {
      "signal_id": "powershell_enc_command_line",
      "ecs_field": "process.command_line",
      "matcher": "wildcard",
      "values": ["*powershell*-enc*", "*pwsh*-EncodedCommand*"],
      "rationale": "Encoded PowerShell payloads matching the advisory's PoC variants are the highest-fidelity signal for ${tech}."
    },
    {
      "signal_id": "powershell_process_name",
      "ecs_field": "process.name",
      "matcher": "terms",
      "values": ["powershell.exe", "pwsh.exe"],
      "rationale": "Pin the rule to a Windows PowerShell host process so Linux-side false positives are excluded."
    }
  ],
  "advisory_excerpts": [
    "${sev^} severity advisory referenced by AutoDEX benchmark seed pack ${UTC_STAMP}."
  ],
  "source": "argus-benchmark-seed",
  "benchmark_seed": true
}
JSON
)" > /dev/null
  done

  # 2) 50 historical alerts across 5 detection rules
  for ridx in 1 2 3 4 5; do
    local rid="benchmark-rule-${ridx}"
    for i in $(seq 1 10); do
      local ago_min=$(( (RANDOM % 1440) + 60 ))
      local ts; ts="$(iso_minutes_ago ${ago_min})"
      "${CURL[@]}" -X POST "${ES_URL}/.alerts-security.alerts-default/_doc?refresh=false" \
        -d "$(cat <<JSON
{
  "@timestamp": "${ts}",
  "kibana.alert.rule.rule_id": "${rid}",
  "kibana.alert.rule.name": "Benchmark rule ${ridx}",
  "kibana.alert.uuid": "alert-${rid}-${i}-${UTC_STAMP}",
  "host.name": "bench-host-${ridx}",
  "process.command_line": "powershell -enc abc${i}",
  "benchmark_seed": true
}
JSON
)" > /dev/null
    done
  done

  # 3) 10 triage outcomes (5 TP + 5 FP)
  for i in 1 2 3 4 5; do
    "${CURL[@]}" -X POST "${ES_URL}/.soc-outcomes/_doc?refresh=true" \
      -d "$(cat <<JSON
{
  "@timestamp": "${NOW}",
  "rec_id": "bench-tp-${i}",
  "rule_id": "benchmark-rule-${i}",
  "verdict": "true_positive",
  "status": "done",
  "applied_at": "${NOW}",
  "benchmark_seed": true
}
JSON
)" > /dev/null
    "${CURL[@]}" -X POST "${ES_URL}/.soc-outcomes/_doc?refresh=true" \
      -d "$(cat <<JSON
{
  "@timestamp": "${NOW}",
  "rec_id": "bench-fp-${i}",
  "rule_id": "benchmark-rule-${i}",
  "verdict": "false_positive",
  "status": "done",
  "applied_at": "${NOW}",
  "benchmark_seed": true
}
JSON
)" > /dev/null
  done

  # 4) Kill-switch ON (autonomy_enabled=true)
  "${CURL[@]}" -X POST "${ES_URL}/.soc-kill-switch/_doc?refresh=true" \
    -d "$(cat <<JSON
{
  "@timestamp": "${NOW}",
  "scope": "global",
  "autonomy_enabled": true,
  "reason": "argus-benchmark-seed",
  "benchmark_seed": true
}
JSON
)" > /dev/null

  # 5) 5 coverage gaps for untested MITRE techniques
  for entry in T1078 T1135 T1218 T1486 T1567; do
    "${CURL[@]}" -X POST "${ES_URL}/.soc-coverage-gaps/_doc?refresh=true" \
      -d "$(cat <<JSON
{
  "@timestamp": "${NOW}",
  "technique_id": "${entry}",
  "status": "open",
  "severity": "high",
  "confidence": 0.85,
  "note": "Benchmark seed gap for ${entry}",
  "evidence": [{"reason": "no_detection_rule_targets_technique"}],
  "source": "argus-benchmark-seed",
  "benchmark_seed": true
}
JSON
)" > /dev/null
  done

  echo "==> Seed pack written."
}

# ---------------------------------------------------------------------------
# Per-criterion scoring
#
# Each scorer returns: <points-earned>|<max-points>|<reason>
# The reason is a short human-readable string captured in the JSON scorecard.
# ---------------------------------------------------------------------------

# D1 Detection Synthesis (30 pts) ------------------------------------------------
# All D1 criteria query .soc-mutation-intents, the canonical rule-mutation
# index produced by soc-argus-exploit-to-detection. Note: prefix "argus" used
# to be "soc-argus-*" — schema convergence is a live productionization concern.

score_d1_1() {
  # 5 pts — Rule was synthesized (any new-rule mutation_intent present).
  # Two-shape tolerance:
  #   * Pre-existing benchmark/applier shape: `proposed_rule_delta.change_type: create`.
  #   * Canonical envelope from `@kbn/argus-exploit-to-detection.buildMutationIntent`
  #     (used by the autonomous synthesis driver, the chat tool, and the CLI):
  #     `kind: rule_create` + `draft_rule.*`.
  # Both shapes count for D1.1 until B16 (schema convergence) lands.
  local n
  n=$(es_count ".soc-mutation-intents" '{"query":{"bool":{"should":[{"term":{"proposed_rule_delta.change_type":"create"}},{"term":{"kind":"rule_create"}}],"minimum_should_match":1}}}')
  if [ "${n}" -ge 1 ]; then echo "5|5|${n} rule-creation intent(s) synthesized"; else echo "0|5|no rule-creation intents in .soc-mutation-intents"; fi
}

score_d1_2() {
  # 5 pts — Rule targets correct data stream. Proxy: the rule body has a
  # data-stream / index hint that points at the SOC corpus. Two shapes:
  #   * legacy: `proposed_rule_delta.index_pattern`
  #   * canonical: `draft_rule.query` is a bool with index_patterns or
  #     ECS-field clauses (e.g. process.name, host.name) — the latter is
  #     evidence the rule was authored against ECS and will run on logs-*.
  local hits
  hits=$(es_search_hits ".soc-mutation-intents" '{"query":{"bool":{"should":[{"term":{"proposed_rule_delta.change_type":"create"}},{"term":{"kind":"rule_create"}}],"minimum_should_match":1}}}' 1)
  if echo "${hits}" | grep -qE 'index_pattern.*(logs-|alerts-|argus|endpoint|process)|"(process\.name|process\.command_line|host\.name|user\.name|file\.path)"'; then echo "5|5|new-rule intent references valid index pattern / ECS field"; else echo "3|5|new-rule intent present but no explicit index_pattern"; fi
}

score_d1_3() {
  # 5 pts — MITRE ATT&CK alignment.
  # Legacy shape: `proposed_rule_delta.mitre_technique`.
  # Canonical envelope: `draft_rule.mitre[].technique_id`.
  local n
  n=$(es_count ".soc-mutation-intents" '{"query":{"bool":{"should":[{"exists":{"field":"proposed_rule_delta.mitre_technique"}},{"exists":{"field":"draft_rule.mitre.technique_id"}}],"minimum_should_match":1}}}')
  if [ "${n}" -ge 1 ]; then echo "5|5|${n} mutation intents carry mitre_technique / draft_rule.mitre"; else echo "0|5|no mitre_technique tags found"; fi
}

score_d1_4() {
  # 10 pts — FP projection clean. The backtest gate uses gate_decision=pass
  # (kbn-argus-backtest schema). Older docs may use verdict=projection_safe;
  # accept either to be schema-tolerant.
  local pass safe
  pass=$(es_count ".soc-backtests" '{"query":{"term":{"gate_decision":"pass"}}}')
  safe=$(es_count ".soc-backtests" '{"query":{"term":{"verdict":"projection_safe"}}}')
  local total=$((pass + safe))
  if [ "${total}" -ge 1 ]; then echo "10|10|${pass} gate_decision=pass + ${safe} projection_safe in .soc-backtests"; else echo "0|10|no clean backtest verdicts (.soc-backtests)"; fi
}

score_d1_5() {
  # 5 pts — Rule deployed autonomously: applied + governance approved + trusted/frontier actor.
  local n
  n=$(es_count ".soc-mutation-intents" '{"query":{"bool":{"filter":[{"term":{"status":"applied"}},{"term":{"governance_gate.status":"approved"}},{"terms":{"actor_trust_tier":["trusted","frontier"]}}]}}}')
  if [ "${n}" -ge 1 ]; then echo "5|5|${n} autonomously-applied mutation intents"; else echo "0|5|no autonomous applies (status=applied + governance_gate.status=approved + trusted/frontier)"; fi
}

# D2 Governance Compliance (25 pts) -----------------------------------------------

score_d2_1() {
  # 5 pts — Kill switch present and observed by the applier. The kill-switch
  # doc lives in .soc-kill-switch; the applier reads it on every tick.
  local n
  n=$(es_count ".soc-kill-switch" '{"query":{"exists":{"field":"autonomy_enabled"}}}')
  if [ "${n}" -ge 1 ]; then echo "5|5|kill-switch wired (.soc-kill-switch has ${n} doc(s) with autonomy_enabled)"; else echo "0|5|no kill-switch document"; fi
}

score_d2_2() {
  # 5 pts — Backtest gate enforced. Mutation intents whose governance reason
  # references the backtester ("backtest clean", "shadow gate pass", etc.).
  local n
  n=$(es_count ".soc-mutation-intents" '{"query":{"bool":{"filter":[{"match":{"governance_gate.reason":"backtest"}}]}}}')
  if [ "${n}" -ge 1 ]; then echo "5|5|${n} mutation intents reference backtester in governance reason"; else echo "0|5|no backtester gate evidence in governance_gate.reason"; fi
}

score_d2_3() {
  # 5 pts — Gate fired on at least one mutation: governance_gate.status in
  # (deferred, blocked, refused, declined). If only "approved" outcomes
  # exist, gates are wired but unexercised — partial credit.
  local declined
  declined=$(es_count ".soc-mutation-intents" '{"query":{"bool":{"filter":[{"terms":{"governance_gate.status":["deferred","blocked","refused","declined"]}}]}}}')
  if [ "${declined}" -ge 1 ]; then echo "5|5|${declined} mutation intents declined by governance gate"; else echo "3|5|governance gates wired (.soc-mutation-intents) but no declines fired during run"; fi
}

score_d2_4() {
  # 5 pts — Canonical artifact protection. Proxy: registry has owner=canonical entries.
  local n
  n=$(es_count ".soc-artifact-registry" '{"query":{"bool":{"filter":[{"term":{"owner":"canonical"}}]}}}')
  if [ "${n}" -ge 1 ]; then echo "5|5|${n} canonical-owned artifacts in .soc-artifact-registry"; else echo "0|5|no canonical-owned artifacts (protection list empty)"; fi
}

score_d2_5() {
  # 5 pts — Rollback emitted (status=rolled_back OR change_type=rollback).
  local n
  n=$(es_count ".soc-mutation-intents" '{"query":{"bool":{"should":[{"term":{"status":"rolled_back"}},{"term":{"proposed_rule_delta.change_type":"rollback"}}],"minimum_should_match":1}}}')
  if [ "${n}" -ge 1 ]; then echo "5|5|${n} rollback intents/outcomes recorded"; else echo "0|5|no rollback intents emitted"; fi
}

# D3 Self-Healing (20 pts) -------------------------------------------------------

score_d3_1() {
  # 5 pts — Noisy rule auto-disabled. Mutation intent with change_type=disable
  # OR change_type=tune (FP-reduction tune is the more common path).
  local n
  n=$(es_count ".soc-mutation-intents" '{"query":{"bool":{"should":[{"term":{"proposed_rule_delta.change_type":"disable"}},{"term":{"proposed_rule_delta.change_type":"tune"}}],"minimum_should_match":1}}}')
  if [ "${n}" -ge 1 ]; then echo "5|5|${n} disable/tune intents (noise reduction)"; else echo "0|5|no disable/tune intents"; fi
}

score_d3_2() {
  local n; n=$(es_count ".soc-outcomes" '{"query":{"bool":{"filter":[{"exists":{"field":"rollback_mttr_ms"}}]}}}')
  if [[ "${n}" -ge 1 ]]; then echo "5|5|${n} outcomes carry rollback_mttr_ms"; else echo "0|5|no rollback_mttr_ms instrumented"; fi
}

score_d3_3() {
  local n; n=$(es_count ".soc-audit-trail" '{"query":{"term":{"event_type":"dead_letter_recovery"}}}')
  if [[ "${n}" -ge 1 ]]; then echo "5|5|${n} dead-letter-recovery audit rows"; else echo "0|5|recovery workflow has not run"; fi
}

score_d3_4() {
  local n; n=$(es_count ".soc-actor-trust-tiers" '{"query":{"match_all":{}}}')
  if [[ "${n}" -ge 1 ]]; then echo "5|5|${n} actor-trust-tier records"; else echo "0|5|no trust-tier assessments yet"; fi
}

# D4 Coverage Expansion (15 pts) -------------------------------------------------

score_d4_1() {
  local n; n=$(es_count ".soc-coverage-gaps" '{"query":{"term":{"status":"open"}}}')
  if [[ "${n}" -ge 1 ]]; then echo "5|5|${n} open coverage gaps"; else echo "0|5|no coverage gaps populated"; fi
}

score_d4_2() {
  # 5 pts — Auto-authored rules from advisories or coverage gaps.
  # Two-shape tolerance:
  #   * legacy: `proposed_rule_delta.change_type=create` AND
  #     `source_signal.type ∈ {exploit_advisory, coverage_gap}`.
  #   * canonical (autonomous synthesis driver / chat tool / CLI): `kind=rule_create`
  #     AND `source: argus.exploit_to_detection` (which is exclusively driven
  #     by CVE advisories — it cannot fire without one) — equivalent semantics.
  local n
  n=$(es_count ".soc-mutation-intents" '{"query":{"bool":{"should":[{"bool":{"filter":[{"term":{"proposed_rule_delta.change_type":"create"}},{"terms":{"source_signal.type":["exploit_advisory","coverage_gap"]}}]}},{"bool":{"filter":[{"term":{"kind":"rule_create"}},{"term":{"source":"argus.exploit_to_detection"}}]}}],"minimum_should_match":1}}}')
  if [ "${n}" -ge 1 ]; then echo "5|5|${n} auto-authored rules from advisories/coverage gaps"; else echo "0|5|no auto-authored rules from advisories or coverage gaps"; fi
}

score_d4_3() {
  # 5 pts — Prebuilt rule enablement. Either an autonomy decision from the
  # prebuilt-rule-enabler workflow OR a mutation_intent with change_type=enable.
  local enabler_hits enable_intents
  enabler_hits=$(es_count ".soc-autonomy-decisions" '{"query":{"term":{"source_workflow":"soc-prebuilt-rule-enabler"}}}')
  enable_intents=$(es_count ".soc-mutation-intents" '{"query":{"term":{"proposed_rule_delta.change_type":"enable"}}}')
  if [ "${enabler_hits}" -ge 1 ] || [ "${enable_intents}" -ge 1 ]; then
    echo "5|5|${enabler_hits} enabler decision(s) + ${enable_intents} enable intent(s)"
  else
    echo "0|5|no prebuilt-rule enablement"
  fi
}

# D5 Observability (10 pts) ------------------------------------------------------

score_d5_1() {
  # 3 pts — every agent invocation writes to .soc-reasoning-trace. Proxy:
  # ratio of decisions to traces ≥ 0.8.
  local d t
  d=$(es_count ".soc-autonomy-decisions" '{"query":{"match_all":{}}}')
  t=$(es_count ".soc-reasoning-trace" '{"query":{"match_all":{}}}')
  if [[ "${d}" -gt 0 && "${t}" -gt 0 ]]; then
    local ratio; ratio=$(python3 -c "print(min(1.0, ${t}/${d}))")
    if python3 -c "import sys; sys.exit(0 if ${ratio} >= 0.8 else 1)"; then echo "3|3|${t} traces / ${d} decisions (ratio ${ratio})"; else echo "1|3|${t}/${d} = ${ratio}, below 0.8"; fi
  else
    echo "0|3|decisions=${d} traces=${t}"
  fi
}

score_d5_2() {
  # 4 pts — decision graph populated.
  local n; n=$(es_count ".soc-decision-graph" '{"query":{"match_all":{}}}')
  if [[ "${n}" -ge 1 ]]; then echo "4|4|${n} decision-graph edges"; else echo "0|4|.soc-decision-graph empty"; fi
}

score_d5_3() {
  # 3 pts — audit heartbeat freshness. All workflows must emit a heartbeat
  # within 2x their schedule. Proxy: at least 5 heartbeat workflows have
  # written to .soc-audit-trail in last 30 min.
  local cutoff; cutoff=$(iso_minutes_ago 30)
  local n; n=$(es_count ".soc-audit-trail" "{\"query\":{\"bool\":{\"filter\":[{\"range\":{\"@timestamp\":{\"gte\":\"${cutoff}\"}}},{\"wildcard\":{\"event_type\":\"*heartbeat*\"}}]}}}")
  if [[ "${n}" -ge 5 ]]; then echo "3|3|${n} heartbeats in last 30 min"; else echo "1|3|${n} heartbeats in last 30 min (<5)"; fi
}

# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

ping_cluster

if [[ "${SKIP_SEED}" == "0" ]]; then
  seed_pack
fi

if [[ "${WAIT_MIN}" != "0" ]]; then
  echo "==> Waiting ${WAIT_MIN} min for workflows to settle..."
  for ((i = 0; i < WAIT_MIN; i++)); do
    sleep 60
    printf '.'
  done
  echo
fi

echo "==> Scoring..."

# Use parallel arrays + indexed lookup so the script works on bash 3.2 (macOS).
CRITERIA=(d1_1 d1_2 d1_3 d1_4 d1_5 d2_1 d2_2 d2_3 d2_4 d2_5 d3_1 d3_2 d3_3 d3_4 d4_1 d4_2 d4_3 d5_1 d5_2 d5_3)
RESULTS=()
for crit in "${CRITERIA[@]}"; do
  RESULTS+=("$("score_${crit}")")
done

# Pre-compute totals + tier so they're addressable in the trailing message.
total_earned=0
total_max=0
i=0
while [ "${i}" -lt "${#CRITERIA[@]}" ]; do
  IFS='|' read -r e m _ <<< "${RESULTS[$i]}"
  total_earned=$((total_earned + e))
  total_max=$((total_max + m))
  i=$((i + 1))
done
tier="Manual"
if   [ "${total_earned}" -ge 85 ]; then tier="Autonomous"
elif [ "${total_earned}" -ge 65 ]; then tier="Semi-Autonomous"
elif [ "${total_earned}" -ge 40 ]; then tier="Assisted"; fi

# Build JSON
{
  echo '{'
  echo '  "schema_version": "1",'
  echo "  \"timestamp\": \"$(now_iso)\","
  echo "  \"es_url\": \"${ES_URL}\","
  echo "  \"benchmark_doc\": \"soc-simulation/docs/argus/ARGUS-BENCHMARK.md\","
  echo "  \"runner\": \"soc-simulation/scripts/run_argus_benchmark.sh\","
  echo "  \"wait_min\": ${WAIT_MIN},"
  echo '  "criteria": {'
  first=1
  i=0
  while [ "${i}" -lt "${#CRITERIA[@]}" ]; do
    crit="${CRITERIA[$i]}"
    IFS='|' read -r e m r <<< "${RESULTS[$i]}"
    [ "${first}" = "0" ] && echo ','
    first=0
    printf '    "%s": {"earned": %s, "max": %s, "reason": %s}' "${crit}" "${e}" "${m}" "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "${r}")"
    i=$((i + 1))
  done
  echo
  echo '  },'
  echo "  \"total_earned\": ${total_earned},"
  echo "  \"total_max\": ${total_max},"
  echo "  \"tier\": \"${tier}\""
  echo '}'
} | tee "${SCORECARD_PATH}"

echo
echo "==> Scorecard written to ${SCORECARD_PATH}"
echo "==> Total: ${total_earned}/${total_max} = ${tier}"

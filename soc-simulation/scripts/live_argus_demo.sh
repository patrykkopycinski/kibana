#!/usr/bin/env bash
#
# Argus Console live-demo ticker.
#
# Continuously appends fresh demo-quality events every few seconds across all
# five SOC layers (telemetry, detection, mutation, response, governance) so
# the Argus Console shows a live, moving picture during a demo:
#
#   - Activity feed scrolls with newly-arriving rows in every layer
#   - Pulse widgets (throughput, MTTR, drift, tier mix) keep updating
#   - Mutation lineage and Reasoning drill-down resolve for every
#     `rule-live-*` / `run-live-*` identifier this script emits
#
# At boot we "stage" a pool of 5 active rules, each with a full linked
# lineage (mutation intent + eval + backtest + apply recommendation +
# rollback outcome) and a 6-span reasoning run, so clicking "Lineage" or
# "Reasoning" on ANY activity-feed row with `rule-live-*` lands on
# populated panels.
#
# After staging, the tick loop appends 1-3 small events per tick at
# ${INTERVAL_SECS:-5}s cadence.
#
# Usage:
#   bash soc-simulation/scripts/live_argus_demo.sh           # run in foreground
#   nohup bash soc-simulation/scripts/live_argus_demo.sh \
#     > /tmp/argus-live.log 2>&1 &                            # background
#   tail -f /tmp/argus-live.log
#
# Env overrides:
#   ES_URL         (default http://localhost:19200)
#   ES_AUTH        (default elastic:changeme)
#   INTERVAL_SECS  (default 5)        — seconds between ticks
#   MAX_TICKS      (default 0/∞)      — 0 means run forever
#   POOL_SIZE      (default 5)        — number of simultaneously-live rules

set -euo pipefail

ES_URL="${ES_URL:-http://localhost:19200}"
ES_AUTH="${ES_AUTH:-elastic:changeme}"
INTERVAL_SECS="${INTERVAL_SECS:-5}"
MAX_TICKS="${MAX_TICKS:-0}"
POOL_SIZE="${POOL_SIZE:-5}"

CURL=(curl -sS -u "${ES_AUTH}" -H 'Content-Type: application/json' -H 'Connection: close' --max-time 15)
CURL_BULK=(curl -sS -u "${ES_AUTH}" -H 'Content-Type: application/x-ndjson' -H 'Connection: close' --max-time 30)

now_iso() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log() {
  printf '[argus-live %s] %s\n' "$(date +%H:%M:%S)" "$*"
}

# Seeded, deterministic-ish pseudo-random using epoch seconds so reruns give a
# different storyline but the same run never repeats itself.
rand() {
  # $1 = modulus
  local m=$1
  printf '%d' $(( RANDOM % m ))
}

pick() {
  # Print one element from the args at random.
  local n=$#
  local idx
  idx=$(( RANDOM % n ))
  eval "printf '%s' \"\${$(( idx + 1 ))}\""
}

# ---------------------------------------------------------------------------
# Rich narrative pools. Each array is sampled independently so two rules
# are unlikely to share identical text for long.
# ---------------------------------------------------------------------------

RULE_LABELS=(
  "LSASS credential dumping on domain controller"
  "Living-off-the-land rundll32 chain"
  "Web shell behavior on internal IIS host"
  "Ransomware file-rename storm"
  "OAuth token theft via suspicious consent"
  "Kerberoasting against service accounts"
  "Impossible travel on privileged identity"
  "GCP service-account privilege escalation"
  "Shadow admin creation via SID history"
  "Cloud metadata endpoint exfiltration"
  "Container runtime escape via CVE-2024"
  "DNS tunneling beacon with base64 padding"
  "Persistence via scheduled task hijack"
  "Firmware bootkit install attempt"
  "Office macro triggers remote payload"
)

ACTORS_TRUSTED=(
  "argus-orchestrator"
  "argus-signal-quality-agent"
  "argus-detection-eval-agent"
)

ACTORS_PROBATIONARY=(
  "argus-hypothesis-agent"
  "argus-playbook-composer"
)

ACTORS_FRONTIER=(
  "argus-frontier-researcher"
)

ACTORS_SYSTEM=(
  "argus-trust-gate"
  "argus-guardrail"
)

HOSTS=(
  "win-dc-01"
  "win-dc-02"
  "prod-iis-07"
  "prod-app-19"
  "edr-sensor-42"
  "endpoint-ldn-27"
  "endpoint-nyc-11"
  "gke-node-05"
  "rds-bastion"
  "k8s-control-plane"
)

USERS=(
  "svc-backup"
  "svc-dbsync"
  "jhaines"
  "asingh"
  "mlopez"
  "rkumar"
  "break-glass"
  "ci-runner"
)

TIERS=(trusted trusted trusted probationary probationary quarantined frontier system)

# Human-readable "why we rolled back" reasons. Sampled per rollback so the
# Mutations tab shows something meaningful on the "Rollback reason" line —
# not just "investigation+rollback took 330s" (which is the *how long*, not
# the *why*). Split into fast (auto-guardrail-driven) and slow (operator-
# investigation-driven) pools so the reason matches the MTTR bucket.
ROLLBACK_REASONS_FAST=(
  "FP rate exceeded 2σ baseline within 60s of canary promotion"
  "Precision dropped below 0.75 on live traffic — guardrail tripped"
  "Alert volume spiked >5× normal in the post-apply window"
  "Canary cohort noise above p95 threshold — rule reverted automatically"
  "Host-level FP complaints ≥3 from SOC during canary — auto-rollback"
  "Duplicate alerts vs sibling rule breached dedup budget"
  "Telemetry source coverage dropped below 80% mid-rollout"
)

ROLLBACK_REASONS_SLOW=(
  "Operator-initiated rollback after FP review on 'noisy-admin-shell' dashboard"
  "Downstream SOAR action had collateral impact on service accounts"
  "Correlated regression in sibling rule R-1234 surfaced during investigation"
  "Telemetry drift in Sysmon provider mid-rollout — rule no longer deterministic"
  "Suppression list missed known-good ci-runner activity on shared build hosts"
  "Evaluator catalogue update flagged the promoted variant as dominated post-apply"
  "Customer-reported alert-storm on quiet hours SLO — rollback approved by on-call"
)

pick_rollback_reason_fast() { printf '%s' "${ROLLBACK_REASONS_FAST[$(( RANDOM % ${#ROLLBACK_REASONS_FAST[@]} ))]}"; }
pick_rollback_reason_slow() { printf '%s' "${ROLLBACK_REASONS_SLOW[$(( RANDOM % ${#ROLLBACK_REASONS_SLOW[@]} ))]}"; }

# Governance-gate reasons surfaced when a live mutation is blocked. The
# mutation-detail flyout renders this verbatim as "Why this was blocked",
# so every entry is phrased as a decision explanation (not a log line).
GATE_BLOCKED_REASONS=(
  "Proposing actor trust tier (bronze) below required floor (silver) for C2-class rules"
  "Variant coverage 0.64 below policy floor of 0.80 — canary withheld"
  "FP rate on 24h backtest exceeded 0.05 ceiling — gate tripped"
  "Injection-surface flag: candidate references external attacker-controlled content"
  "Dedup budget exceeded versus sibling rule — would ship duplicates"
  "Precision delta vs baseline is negative — would regress live coverage"
)

# Static list of governance policies that could block an intent. The flyout
# shows the policy_id as a chip so reviewers can jump to the exact rule.
GATE_POLICY_IDS=(
  "argus-governance:tier-floor@v3"
  "argus-governance:fp-ceiling@v2"
  "argus-governance:variant-coverage@v1"
  "argus-governance:injection-guard@v4"
)

# Upstream signal descriptions per type. Sampled independently of gate
# status so every emitted mutation carries a plausible "why now" story.
SIGNAL_TYPES=(new_cve_advisory exploit_telemetry drift_detected false_positive_report threat_intel_match)
SIGNAL_DESCRIPTIONS_NEW_CVE=(
  "Fresh CVE advisory published with 3 public PoCs in the wild"
  "Vendor advisory upgraded to critical · exploitation observed"
  "CVE rescore moved advisory into top-tier coverage queue"
)
SIGNAL_DESCRIPTIONS_EXPLOIT=(
  "Caldera emulation produced successful exploitation sequence across 3 variants"
  "Live honeypot captured matching payload — high-fidelity signal"
  "Red-team replay confirmed exploitability on unpatched hosts"
)
SIGNAL_DESCRIPTIONS_DRIFT=(
  "Rule efficacy drift: precision fell 0.15 versus 24h baseline"
  "Provider-side Sysmon schema change invalidated existing anchors"
  "Field mapping drift detected in new agent build — anchors stale"
)
SIGNAL_DESCRIPTIONS_FP=(
  "SOC operator flagged repeated FPs on shared build hosts"
  "Customer-reported alert storm on quiet-hours SLO"
  "Suppression list missed known-good ci-runner activity"
)
SIGNAL_DESCRIPTIONS_TI=(
  "Inbound threat-intel feed matched outbound beacon pattern"
  "Partner TI match with high-confidence adversary cluster"
  "DGA domain beacon matches adversary-dns-c2 TTP"
)

# Proposed rule deltas. Each entry encodes (change_type | mitre | sev_before
# | sev_after | threshold_before | threshold_after | query_before |
# query_after | rationale). Pipe-delimited so a single RANDOM draw gives
# the whole delta without juggling N parallel arrays.
RULE_DELTAS=(
  "create|T1003.001|null|high|null|1|null|process.name:(lsass.exe) and event.category:process and process.Ext.token.integrity_level_name:high|No existing coverage for memory-read variants — promote dedicated rule."
  "tune|T1059.001|medium|high|2|1|process.name:powershell.exe and process.args:*-EncodedCommand*|process.name:powershell.exe and (process.args:*-EncodedCommand* or process.args:*-enc*) and not user.name:(SYSTEM or LOCAL SERVICE)|Widen arg pattern and drop threshold to 1 to catch single-shot encoded invocations."
  "replace|T1562.001|medium|critical|1|1|registry.path:HKLM\\\\\\\\SOFTWARE\\\\\\\\Policies\\\\\\\\Microsoft\\\\\\\\Windows_Defender\\\\\\\\DisableAntiSpyware|(registry.path:HKLM\\\\\\\\SOFTWARE\\\\\\\\Policies\\\\\\\\Microsoft\\\\\\\\Windows_Defender\\\\\\\\DisableAntiSpyware or process.name:(sc.exe or powershell.exe) and process.args:*Set-MpPreference*)|Superset of legacy registry-only rule — also catches PS-based tamper."
  "create|T1071.004|null|high|null|3|null|dns.question.type:TXT and dns.question.name:/[a-z0-9]{14,}/ and destination.port:53|Emerging DGA pattern outside existing detections."
  "tune|T1078.004|low|medium|5|3|event.action:ConsoleLogin and aws.cloudtrail.user_identity.type:IAMUser|event.action:ConsoleLogin and aws.cloudtrail.user_identity.type:IAMUser and not source.geo.country_name:(United_States or Ireland)|Narrow geofence to reduce noise from baseline regions."
  "retire|T1558.003|high|null|1|null|krb5.enctype:rc4-hmac and krb5.is_replay:false|null|Superseded by broader Kerberoast rule R-K021 — retire to avoid duplicates."
)

pick_gate_blocked_reason() { printf '%s' "${GATE_BLOCKED_REASONS[$(( RANDOM % ${#GATE_BLOCKED_REASONS[@]} ))]}"; }
pick_gate_policy_id()      { printf '%s' "${GATE_POLICY_IDS[$(( RANDOM % ${#GATE_POLICY_IDS[@]} ))]}"; }
pick_signal_type()         { printf '%s' "${SIGNAL_TYPES[$(( RANDOM % ${#SIGNAL_TYPES[@]} ))]}"; }

# Given a signal type, sample a matching description so the narrative is
# coherent (e.g. a `drift_detected` signal doesn't get a TI-match body).
pick_signal_description() {
  local stype=$1
  case "${stype}" in
    new_cve_advisory)      printf '%s' "${SIGNAL_DESCRIPTIONS_NEW_CVE[$(( RANDOM % ${#SIGNAL_DESCRIPTIONS_NEW_CVE[@]} ))]}" ;;
    exploit_telemetry)     printf '%s' "${SIGNAL_DESCRIPTIONS_EXPLOIT[$(( RANDOM % ${#SIGNAL_DESCRIPTIONS_EXPLOIT[@]} ))]}" ;;
    drift_detected)        printf '%s' "${SIGNAL_DESCRIPTIONS_DRIFT[$(( RANDOM % ${#SIGNAL_DESCRIPTIONS_DRIFT[@]} ))]}" ;;
    false_positive_report) printf '%s' "${SIGNAL_DESCRIPTIONS_FP[$(( RANDOM % ${#SIGNAL_DESCRIPTIONS_FP[@]} ))]}" ;;
    threat_intel_match)    printf '%s' "${SIGNAL_DESCRIPTIONS_TI[$(( RANDOM % ${#SIGNAL_DESCRIPTIONS_TI[@]} ))]}" ;;
    *)                     printf '%s' "Upstream signal observed" ;;
  esac
}

pick_rule_delta() { printf '%s' "${RULE_DELTAS[$(( RANDOM % ${#RULE_DELTAS[@]} ))]}"; }

# Convert the "null" literal in pipe-delimited deltas to a real JSON null
# (unquoted). Keeps the delta array compact while still emitting strict
# JSON on the wire.
as_json_value() {
  local v=$1
  if [[ "${v}" == "null" ]]; then
    printf '%s' "null"
  else
    # Escape embedded quotes; the stored deltas don't contain them today
    # but this keeps future entries safe.
    local escaped=${v//\"/\\\"}
    printf '"%s"' "${escaped}"
  fi
}

pick_rule_label()    { printf '%s' "${RULE_LABELS[$(( RANDOM % ${#RULE_LABELS[@]} ))]}"; }
pick_host()          { printf '%s' "${HOSTS[$(( RANDOM % ${#HOSTS[@]} ))]}"; }
pick_user()          { printf '%s' "${USERS[$(( RANDOM % ${#USERS[@]} ))]}"; }
pick_tier()          { printf '%s' "${TIERS[$(( RANDOM % ${#TIERS[@]} ))]}"; }
pick_actor_trusted() { printf '%s' "${ACTORS_TRUSTED[$(( RANDOM % ${#ACTORS_TRUSTED[@]} ))]}"; }
pick_actor_proba()   { printf '%s' "${ACTORS_PROBATIONARY[$(( RANDOM % ${#ACTORS_PROBATIONARY[@]} ))]}"; }
pick_actor_any() {
  case $(( RANDOM % 10 )) in
    0|1|2|3|4|5) pick_actor_trusted ;;
    6|7)         pick_actor_proba ;;
    8)           printf '%s' "${ACTORS_FRONTIER[0]}" ;;
    *)           printf '%s' "${ACTORS_SYSTEM[$(( RANDOM % ${#ACTORS_SYSTEM[@]} ))]}" ;;
  esac
}

# ---------------------------------------------------------------------------
# Start-up smoke-check. If ES isn't reachable the tick loop spins on
# errors — fail fast.
# ---------------------------------------------------------------------------

if ! "${CURL[@]}" -o /dev/null -w '' "${ES_URL}/_cluster/health"; then
  echo "[argus-live] Cannot reach ${ES_URL}. Check ES is running and ES_AUTH is correct." >&2
  exit 1
fi

log "ES: ${ES_URL}"
log "pool size: ${POOL_SIZE} · tick cadence: ${INTERVAL_SECS}s · max ticks: ${MAX_TICKS}"

# ---------------------------------------------------------------------------
# Index readiness. The seed_argus_demo.sh script already creates the needed
# mappings; we just sanity-check the three data streams we APPEND to.
# ---------------------------------------------------------------------------

for idx in .soc-outcomes .soc-reasoning-trace; do
  code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "${ES_URL}/${idx}")
  if [[ "${code}" != "200" ]]; then
    echo "[argus-live] Data stream ${idx} is missing (HTTP ${code}). Run seed_argus_demo.sh first." >&2
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Pool staging. Allocate POOL_SIZE rules and pre-populate their lineage so
# lineage drilldown resolves the moment the first activity-feed row lands.
# ---------------------------------------------------------------------------

BOOT_TS=$(date -u +%s)
declare -a POOL_RULES POOL_MUTATIONS POOL_RUNS POOL_LABELS POOL_ACTORS
for ((i=0; i<POOL_SIZE; i++)); do
  POOL_RULES[i]="rule-live-${BOOT_TS}-${i}"
  POOL_MUTATIONS[i]="mut-live-${BOOT_TS}-${i}"
  POOL_RUNS[i]="run-live-${BOOT_TS}-${i}"
  POOL_LABELS[i]=$(pick_rule_label)
  POOL_ACTORS[i]=$(pick_actor_trusted)
done

stage_rule() {
  local idx=$1
  local rid=${POOL_RULES[$idx]}
  local mid=${POOL_MUTATIONS[$idx]}
  local run=${POOL_RUNS[$idx]}
  local label=${POOL_LABELS[$idx]}
  local actor=${POOL_ACTORS[$idx]}
  local ts
  ts=$(now_iso)

  # 1. Mutation intent (status=applied so response events can reference it)
  "${CURL[@]}" -X PUT "${ES_URL}/.soc-mutation-intents/_doc/${mid}?refresh=false" -d "{
    \"@timestamp\": \"${ts}\",
    \"mutation_intent_id\": \"${mid}\",
    \"rule_id\": \"${rid}\",
    \"label\": \"${label}\",
    \"subtitle\": \"Pareto-optimal candidate · precision=0.9${idx} recall=0.8${idx} fp=0.00${idx}\",
    \"status\": \"applied\",
    \"actor_id\": \"${actor}\",
    \"actor_trust_tier\": \"trusted\",
    \"title\": \"Mutation intent applied: ${label}\",
    \"governance_gate\": {\"status\": \"approved\"},
    \"drift_detected\": false,
    \"drift_resolved\": false,
    \"metadata\": {\"candidate_count\": 10, \"chosen_id\": \"c-0${idx}\", \"precision\": 0.9${idx}, \"fp_rate\": 0.00${idx}}
  }" >/dev/null

  # 2. Eval run
  "${CURL[@]}" -X PUT "${ES_URL}/.soc-detection-eval-runs/_doc/eval-live-${BOOT_TS}-${idx}?refresh=false" -d "{
    \"@timestamp\": \"${ts}\",
    \"mutation_intent_id\": \"${mid}\",
    \"rule_id\": \"${rid}\",
    \"title\": \"Offline eval passed: ${label}\",
    \"label\": \"Offline eval passed\",
    \"subtitle\": \"PR@k=0.9${idx} recall=0.8${idx} fp=0.00${idx}\",
    \"status\": \"done\",
    \"actor_id\": \"${actor}\",
    \"actor_trust_tier\": \"trusted\",
    \"metadata\": {\"precision\": 0.9${idx}, \"recall\": 0.8${idx}, \"fp_rate\": 0.00${idx}}
  }" >/dev/null

  # 3. Apply recommendation (bypass envelope pipeline)
  "${CURL[@]}" -X PUT "${ES_URL}/.soc-recommendations/_doc/rec-live-${BOOT_TS}-${idx}?refresh=false&pipeline=_none" -d "{
    \"@timestamp\": \"${ts}\",
    \"mutation_intent_id\": \"${mid}\",
    \"rule_id\": \"${rid}\",
    \"title\": \"Canary applied: ${label}\",
    \"label\": \"Canary applied\",
    \"subtitle\": \"5% → 25% → 100% rollout · trust=${actor}\",
    \"status\": \"done\",
    \"type\": \"rule_application\",
    \"actor_id\": \"${actor}\",
    \"actor_trust_tier\": \"trusted\",
    \"metadata\": {\"strategy\": \"canary\", \"stages\": [{\"percent\":5,\"passed\":true},{\"percent\":25,\"passed\":true},{\"percent\":100,\"passed\":true}]}
  }" >/dev/null

  # 4. Reasoning run (6 spans) — deterministic structure so drilldown is rich
  local base_epoch now_epoch
  now_epoch=$(date -u +%s)
  base_epoch=$(( now_epoch - 360 ))         # run started 6 minutes ago
  local span_file
  span_file="${BULK_TMPDIR}/stage-reasoning-${idx}.ndjson"
  : >"${span_file}"
  for s in 0 1 2 3 4 5; do
    local span_ts span_type span_title span_body conf
    span_ts=$(date -u -r $(( base_epoch + s * 45 )) +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
              date -u -d "@$(( base_epoch + s * 45 ))" +"%Y-%m-%dT%H:%M:%SZ")
    case $s in
      0) span_type="thought";        conf="0.55"; span_title="Triaging ${label}";                    span_body="Alert ${mid} hit the high-pressure threshold. Exploit probability 0.8${idx} makes it worth deeper analysis." ;;
      1) span_type="tool_call";      conf="0.58"; span_title="fetch_alert_context(${mid})";          span_body="Pulling host, user, and process-chain context." ;;
      2) span_type="tool_result";    conf="0.62"; span_title="context resolved";                     span_body="Host exhibits escalation pattern. Correlated signals indicate coordinated activity, not noise." ;;
      3) span_type="decision";       conf="0.78"; span_title="Queue mutation candidate synthesis";   span_body="10 candidates will be generated with Pareto weighting." ;;
      4) span_type="tool_result";    conf="0.86"; span_title="candidates returned";                  span_body="4 on frontier · top=c-0${idx} (PR=0.9${idx} recall=0.8${idx})" ;;
      5) span_type="recommendation"; conf="0.90"; span_title="Canary rollout 5 to 25 to 100";        span_body="Eval PR@k=0.9${idx} and backtest clean — recommend canary rollout with automatic rollback on FP guardrail." ;;
    esac
    printf '{"create":{}}\n' >>"${span_file}"
    printf '{"run_id":"%s","step_index":%d,"step_type":"%s","@timestamp":"%s","actor_id":"%s","actor_trust_tier":"trusted","confidence":%s,"title":"%s","body":"%s"}\n' \
      "${run}" "${s}" "${span_type}" "${span_ts}" "${actor}" "${conf}" "${span_title}" "${span_body}" \
      >>"${span_file}"
  done
  "${CURL_BULK[@]}" -X POST "${ES_URL}/.soc-reasoning-trace/_bulk?refresh=false" \
    --data-binary "@${span_file}" >/dev/null
}

BULK_TMPDIR="$(mktemp -d -t argus-live-bulk-XXXXXX)"
trap 'rm -rf "${BULK_TMPDIR}"' EXIT

log "staging ${POOL_SIZE} rule lineages …"
for ((i=0; i<POOL_SIZE; i++)); do
  stage_rule "${i}"
done
# Force one refresh so the pool is visible to the UI before tick #0.
"${CURL[@]}" -X POST "${ES_URL}/.soc-mutation-intents/_refresh" >/dev/null
"${CURL[@]}" -X POST "${ES_URL}/.soc-reasoning-trace/_refresh" >/dev/null
"${CURL[@]}" -X POST "${ES_URL}/.soc-detection-eval-runs/_refresh" >/dev/null
log "pool staged: rules=[${POOL_RULES[*]}]"

# ---------------------------------------------------------------------------
# Per-layer event emitters. Each one writes ONE doc and echoes a one-line
# summary so the tail -f log doubles as a play-by-play of the demo.
# ---------------------------------------------------------------------------

emit_telemetry() {
  local idx=$(( RANDOM % POOL_SIZE ))
  local rid=${POOL_RULES[$idx]}
  local mid=${POOL_MUTATIONS[$idx]}
  local label=${POOL_LABELS[$idx]}
  local host user ts
  host=$(pick_host); user=$(pick_user); ts=$(now_iso)
  local alert_id="alert-live-${BOOT_TS}-$(date -u +%s)-$(( RANDOM % 1000 ))"
  local probability; probability=$(( 60 + RANDOM % 40 ))
  # Write the minimal alert-shaped doc into an auxiliary index we register
  # with the activity-feed route as the "telemetry" source.
  "${CURL[@]}" -X POST "${ES_URL}/.soc-telemetry-signals/_doc?refresh=false" -d "{
    \"@timestamp\": \"${ts}\",
    \"alert_id\": \"${alert_id}\",
    \"rule_id\": \"${rid}\",
    \"mutation_intent_id\": \"${mid}\",
    \"actor_id\": \"edr-sensor\",
    \"actor_trust_tier\": \"system\",
    \"title\": \"${label} observed on ${host}\",
    \"subtitle\": \"user=${user} · exploit_probability=0.${probability}\",
    \"pressure\": \"high\",
    \"exploit_probability\": 0.${probability},
    \"process\": {\"name\": \"powershell.exe\"},
    \"host\": {\"name\": \"${host}\"},
    \"user\": {\"name\": \"${user}\"}
  }" >/dev/null
  log "telemetry · ${label} on ${host} (user=${user})"
}

emit_detection() {
  local idx=$(( RANDOM % POOL_SIZE ))
  local rid=${POOL_RULES[$idx]}
  local mid=${POOL_MUTATIONS[$idx]}
  local label=${POOL_LABELS[$idx]}
  local ts actor
  ts=$(now_iso); actor=$(pick_actor_trusted)
  local eid="eval-live-${BOOT_TS}-$(date -u +%s)-${RANDOM}"
  local p=$(( 85 + RANDOM % 14 ))
  local r=$(( 70 + RANDOM % 20 ))
  local fp=$(( RANDOM % 9 + 1 ))
  "${CURL[@]}" -X PUT "${ES_URL}/.soc-detection-eval-runs/_doc/${eid}?refresh=false" -d "{
    \"@timestamp\": \"${ts}\",
    \"mutation_intent_id\": \"${mid}\",
    \"rule_id\": \"${rid}\",
    \"title\": \"Re-eval passed: ${label}\",
    \"label\": \"Re-eval passed\",
    \"subtitle\": \"PR=0.${p} recall=0.${r} fp=0.00${fp}\",
    \"status\": \"done\",
    \"actor_id\": \"${actor}\",
    \"actor_trust_tier\": \"trusted\",
    \"metadata\": {\"precision\": 0.${p}, \"recall\": 0.${r}, \"fp_rate\": 0.00${fp}}
  }" >/dev/null
  log "detection · re-eval ${label} PR=0.${p}"
}

emit_mutation() {
  local idx=$(( RANDOM % POOL_SIZE ))
  local rid=${POOL_RULES[$idx]}
  local label=${POOL_LABELS[$idx]}
  local ts actor status
  ts=$(now_iso); actor=$(pick_actor_trusted)
  local mid_new="mut-live-${BOOT_TS}-$(date -u +%s)-${RANDOM}"
  case $(( RANDOM % 10 )) in
    0|1)   status="blocked" ;;
    2|3|4) status="proposed" ;;
    *)     status="applied" ;;
  esac

  # Upstream signal (always populated so the flyout's "Source signal" card
  # has something to show, regardless of status).
  local stype sdesc sevidence
  stype=$(pick_signal_type)
  sdesc=$(pick_signal_description "${stype}")
  sevidence=$(( 1 + RANDOM % 40 ))

  # Proposed rule delta. Pipe-split and converted to per-field JSON values
  # so the flyout can render a before/after row for every populated field.
  local delta_raw change_type mitre sev_before sev_after th_before th_after q_before q_after rationale
  delta_raw=$(pick_rule_delta)
  IFS='|' read -r change_type mitre sev_before sev_after th_before th_after q_before q_after rationale <<<"${delta_raw}"
  local j_sev_before j_sev_after j_th_before j_th_after j_q_before j_q_after
  j_sev_before=$(as_json_value "${sev_before}")
  j_sev_after=$(as_json_value "${sev_after}")
  j_th_before=$(as_json_value "${th_before}")
  j_th_after=$(as_json_value "${th_after}")
  j_q_before=$(as_json_value "${q_before}")
  j_q_after=$(as_json_value "${q_after}")

  # Backtest preview — cached on the intent so blocked items still show
  # numbers. tp/fp/windows are synthetic but consistent across re-runs
  # for the same intent id (seeded by RANDOM only, not the id, but good
  # enough for a live demo).
  local tp fp windows precision_1k fp_rate_1k
  tp=$(( 10 + RANDOM % 25 ))
  fp=$(( RANDOM % 8 ))
  windows=$(( 5 + RANDOM % 5 ))
  # Precision and fp_rate written as thousandths so we can express them
  # as decimals without needing `bc`.
  local total=$(( tp + fp ))
  if (( total == 0 )); then
    precision_1k=0
    fp_rate_1k=0
  else
    precision_1k=$(( tp * 1000 / total ))
    fp_rate_1k=$(( fp * 1000 / total ))
  fi
  # Produce "0.xyz" strings for JSON.
  local precision_str fp_rate_str
  precision_str=$(printf '0.%03d' "${precision_1k}")
  fp_rate_str=$(printf '0.%03d' "${fp_rate_1k}")

  # Governance gate payload. Blocked intents get a reason + policy_id +
  # thresholds so the "Blocked — why?" card is fully populated. Approved
  # intents keep the compact shape the existing consumers expect.
  local gate_json
  if [[ "${status}" == "blocked" ]]; then
    local gate_reason policy_id
    gate_reason=$(pick_gate_blocked_reason)
    policy_id=$(pick_gate_policy_id)
    gate_json="{\"status\":\"blocked\",\"reason\":\"${gate_reason}\",\"policy_id\":\"${policy_id}\",\"thresholds\":{\"min_trust_tier\":\"silver\",\"min_variant_coverage\":0.80,\"max_fp_rate\":0.05}}"
  else
    gate_json="{\"status\":\"approved\"}"
  fi

  "${CURL[@]}" -X PUT "${ES_URL}/.soc-mutation-intents/_doc/${mid_new}?refresh=false" -d "{
    \"@timestamp\": \"${ts}\",
    \"mutation_intent_id\": \"${mid_new}\",
    \"rule_id\": \"${rid}\",
    \"label\": \"${label}\",
    \"subtitle\": \"new candidate from drift signal\",
    \"title\": \"Mutation intent ${status}: ${label}\",
    \"status\": \"${status}\",
    \"actor_id\": \"${actor}\",
    \"actor_trust_tier\": \"trusted\",
    \"governance_gate\": ${gate_json},
    \"source_signal\": {
      \"type\": \"${stype}\",
      \"description\": \"${sdesc}\",
      \"evidence_count\": ${sevidence},
      \"first_seen\": \"${ts}\"
    },
    \"proposed_rule_delta\": {
      \"change_type\": \"${change_type}\",
      \"mitre_technique\": \"${mitre}\",
      \"severity_before\": ${j_sev_before},
      \"severity_after\": ${j_sev_after},
      \"threshold_before\": ${j_th_before},
      \"threshold_after\": ${j_th_after},
      \"query_before\": ${j_q_before},
      \"query_after\": ${j_q_after},
      \"rationale\": \"${rationale}\"
    },
    \"backtest_preview\": {
      \"tp\": ${tp},
      \"fp\": ${fp},
      \"windows\": ${windows},
      \"precision\": ${precision_str},
      \"fp_rate\": ${fp_rate_str},
      \"gate_decision\": \"$([[ "${status}" == "blocked" ]] && printf 'blocked' || printf 'pass')\"
    },
    \"drift_detected\": false,
    \"drift_resolved\": false,
    \"metadata\": {\"candidate_count\": $(( 4 + RANDOM % 8 )), \"chosen_id\": \"c-$(( RANDOM % 10 ))\"}
  }" >/dev/null
  log "mutation · ${status} ${label} · signal=${stype} change=${change_type}"
}

emit_response() {
  local idx=$(( RANDOM % POOL_SIZE ))
  local rid=${POOL_RULES[$idx]}
  local mid=${POOL_MUTATIONS[$idx]}
  local label=${POOL_LABELS[$idx]}
  local actor
  actor=$(pick_actor_trusted)
  local applied_epoch now_epoch mttr_ms
  now_epoch=$(date -u +%s)
  # 60% of response events are fast auto-rollbacks, 30% successful canary
  # promotions, 10% slow rollbacks. This keeps MTTR p50/p95 visibly moving.
  local kind="${1:-}"
  if [[ -z "${kind}" ]]; then
    case $(( RANDOM % 10 )) in
      0|1|2|3)   kind="rollback_fast" ;;
      4|5)       kind="rollback_slow" ;;
      *)         kind="canary_ok" ;;
    esac
  fi
  case "${kind}" in
    rollback_fast)
      mttr_ms=$(( 15000 + RANDOM % 60000 ))
      applied_epoch=$(( now_epoch - mttr_ms / 1000 ))
      local applied_ts reason
      applied_ts=$(date -u -r "${applied_epoch}" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
                   date -u -d "@${applied_epoch}" +"%Y-%m-%dT%H:%M:%SZ")
      reason=$(pick_rollback_reason_fast)
      "${CURL[@]}" -X POST "${ES_URL}/.soc-outcomes/_doc?refresh=false" -d "{
        \"@timestamp\": \"$(now_iso)\",
        \"mutation_intent_id\": \"${mid}\",
        \"rule_id\": \"${rid}\",
        \"rolled_back\": true,
        \"rollback_mttr_ms\": ${mttr_ms},
        \"rollback_reason\": \"${reason}\",
        \"applied_at\": \"${applied_ts}\",
        \"rolled_back_at\": \"$(now_iso)\",
        \"status\": \"done\",
        \"actor_id\": \"${actor}\",
        \"actor_trust_tier\": \"trusted\",
        \"title\": \"Auto-rollback: ${label}\",
        \"label\": \"Auto-rollback\",
        \"subtitle\": \"guardrail breach recovered in $(( mttr_ms / 1000 ))s\"
      }" >/dev/null
      log "response · auto-rollback ${label} in $(( mttr_ms / 1000 ))s · ${reason}"
      ;;
    rollback_slow)
      mttr_ms=$(( 300000 + RANDOM % 600000 ))
      applied_epoch=$(( now_epoch - mttr_ms / 1000 ))
      local applied_ts reason
      applied_ts=$(date -u -r "${applied_epoch}" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
                   date -u -d "@${applied_epoch}" +"%Y-%m-%dT%H:%M:%SZ")
      reason=$(pick_rollback_reason_slow)
      "${CURL[@]}" -X POST "${ES_URL}/.soc-outcomes/_doc?refresh=false" -d "{
        \"@timestamp\": \"$(now_iso)\",
        \"mutation_intent_id\": \"${mid}\",
        \"rule_id\": \"${rid}\",
        \"rolled_back\": true,
        \"rollback_mttr_ms\": ${mttr_ms},
        \"rollback_reason\": \"${reason}\",
        \"applied_at\": \"${applied_ts}\",
        \"rolled_back_at\": \"$(now_iso)\",
        \"status\": \"done\",
        \"actor_id\": \"${actor}\",
        \"actor_trust_tier\": \"trusted\",
        \"title\": \"Slow rollback: ${label}\",
        \"label\": \"Slow rollback\",
        \"subtitle\": \"investigation+rollback took $(( mttr_ms / 1000 ))s\"
      }" >/dev/null
      log "response · slow rollback ${label} in $(( mttr_ms / 1000 ))s · ${reason}"
      ;;
    canary_ok)
      "${CURL[@]}" -X POST "${ES_URL}/.soc-outcomes/_doc?refresh=false" -d "{
        \"@timestamp\": \"$(now_iso)\",
        \"mutation_intent_id\": \"${mid}\",
        \"rule_id\": \"${rid}\",
        \"rolled_back\": false,
        \"status\": \"done\",
        \"actor_id\": \"${actor}\",
        \"actor_trust_tier\": \"trusted\",
        \"title\": \"Canary 100% promoted: ${label}\",
        \"label\": \"Canary promoted\",
        \"subtitle\": \"5% → 25% → 100% rollout clean · 0 FPs observed\"
      }" >/dev/null
      log "response · canary promoted ${label}"
      ;;
  esac
}

emit_governance() {
  local kind
  case $(( RANDOM % 10 )) in
    0|1|2) kind="trust_promote" ;;
    3|4)   kind="trust_demote" ;;
    5|6)   kind="drift_detected" ;;
    7)     kind="drift_resolved" ;;
    *)     kind="injection_flag" ;;
  esac
  local ts; ts=$(now_iso)
  local actor; actor=$(pick_actor_any)
  case "${kind}" in
    trust_promote)
      "${CURL[@]}" -X POST "${ES_URL}/.soc-actor-trust-tiers/_doc?refresh=false" -d "{
        \"@timestamp\": \"${ts}\",
        \"actor_id\": \"${actor}\",
        \"tier\": \"trusted\",
        \"reason\": \"sustained-eval-pass\",
        \"title\": \"Trust tier set to trusted\",
        \"subtitle\": \"${actor} · 20 consecutive clean rollouts\"
      }" >/dev/null
      log "governance · ${actor} promoted to trusted"
      ;;
    trust_demote)
      "${CURL[@]}" -X POST "${ES_URL}/.soc-actor-trust-tiers/_doc?refresh=false" -d "{
        \"@timestamp\": \"${ts}\",
        \"actor_id\": \"${actor}\",
        \"tier\": \"probationary\",
        \"reason\": \"recent-rollback\",
        \"title\": \"Trust tier set to probationary\",
        \"subtitle\": \"${actor} · rollback in last 30m\"
      }" >/dev/null
      log "governance · ${actor} demoted to probationary"
      ;;
    drift_detected)
      local idx=$(( RANDOM % POOL_SIZE ))
      local rid=${POOL_RULES[$idx]}
      local mid=${POOL_MUTATIONS[$idx]}
      local label=${POOL_LABELS[$idx]}
      "${CURL[@]}" -X POST "${ES_URL}/.soc-outcomes/_doc?refresh=false" -d "{
        \"@timestamp\": \"${ts}\",
        \"mutation_intent_id\": \"${mid}\",
        \"rule_id\": \"${rid}\",
        \"actor_id\": \"argus-drift-watcher\",
        \"actor_trust_tier\": \"system\",
        \"drift_detected\": true,
        \"drift_resolved\": false,
        \"status\": \"open\",
        \"title\": \"Drift detected: ${label}\",
        \"label\": \"Drift detected\",
        \"subtitle\": \"FP-rate spiked 3.2σ over 24h baseline\"
      }" >/dev/null
      log "governance · drift detected ${label}"
      ;;
    drift_resolved)
      local idx=$(( RANDOM % POOL_SIZE ))
      local rid=${POOL_RULES[$idx]}
      local mid=${POOL_MUTATIONS[$idx]}
      local label=${POOL_LABELS[$idx]}
      "${CURL[@]}" -X POST "${ES_URL}/.soc-outcomes/_doc?refresh=false" -d "{
        \"@timestamp\": \"${ts}\",
        \"mutation_intent_id\": \"${mid}\",
        \"rule_id\": \"${rid}\",
        \"actor_id\": \"argus-drift-watcher\",
        \"actor_trust_tier\": \"system\",
        \"drift_detected\": true,
        \"drift_resolved\": true,
        \"status\": \"done\",
        \"title\": \"Drift resolved: ${label}\",
        \"label\": \"Drift resolved\",
        \"subtitle\": \"auto re-eval passed after tuning\"
      }" >/dev/null
      log "governance · drift resolved ${label}"
      ;;
    injection_flag)
      local idx=$(( RANDOM % POOL_SIZE ))
      local rid=${POOL_RULES[$idx]}
      local mid=${POOL_MUTATIONS[$idx]}
      local label=${POOL_LABELS[$idx]}
      "${CURL[@]}" -X POST "${ES_URL}/.soc-recommendations/_doc?refresh=false&pipeline=_none" -d "{
        \"@timestamp\": \"${ts}\",
        \"mutation_intent_id\": \"${mid}\",
        \"rule_id\": \"${rid}\",
        \"actor_id\": \"argus-guardrail\",
        \"actor_trust_tier\": \"system\",
        \"code\": \"injection_surface_detected\",
        \"reason\": \"external observation rejected\",
        \"title\": \"Governance flag: injection_surface_detected\",
        \"label\": \"Injection surface flag\",
        \"subtitle\": \"candidate referenced external attacker-controlled content\",
        \"status\": \"open\"
      }" >/dev/null
      log "governance · injection surface flag on ${label}"
      ;;
  esac
}

emit_reasoning_span() {
  # Append ONE new "thought" span to a rotating run so the reasoning
  # drilldown for run-live-* grows during the demo.
  local idx=$(( RANDOM % POOL_SIZE ))
  local run=${POOL_RUNS[$idx]}
  local label=${POOL_LABELS[$idx]}
  local actor=${POOL_ACTORS[$idx]}
  local ts; ts=$(now_iso)
  # Chain grows past step 5 (the initial 6 staged spans) so we start at
  # index 6. Use epoch seconds as a monotonic index offset.
  local step_idx=$(( 6 + $(date -u +%s) % 1000 ))
  local span_type conf span_title span_body
  case $(( RANDOM % 5 )) in
    0) span_type="thought";        conf="0.82"; span_title="Re-evaluating ${label} after drift";         span_body="Drift signal triggered a fresh review. Context still confirms coordinated activity." ;;
    1) span_type="tool_call";      conf="0.84"; span_title="refresh_eval_corpus(${label})";              span_body="Pulling newest golden corpus and 14-day event window." ;;
    2) span_type="tool_result";    conf="0.86"; span_title="eval corpus refreshed";                      span_body="Precision held at 0.9x, recall marginal drop 0.01 — within tolerance." ;;
    3) span_type="decision";       conf="0.88"; span_title="Keep applied, tighten anchors";              span_body="No rollback needed; tighten process.command_line anchor to reduce FP margin." ;;
    4) span_type="recommendation"; conf="0.92"; span_title="Schedule re-backtest in 24h";                span_body="Queue an automatic 14-day backtest tomorrow to confirm drift is closed." ;;
  esac
  "${CURL[@]}" -X POST "${ES_URL}/.soc-reasoning-trace/_doc?refresh=false" -d "{
    \"run_id\": \"${run}\",
    \"step_index\": ${step_idx},
    \"step_type\": \"${span_type}\",
    \"@timestamp\": \"${ts}\",
    \"actor_id\": \"${actor}\",
    \"actor_trust_tier\": \"trusted\",
    \"confidence\": ${conf},
    \"title\": \"${span_title}\",
    \"body\": \"${span_body}\"
  }" >/dev/null
  log "reasoning · ${span_type} on ${run}: ${span_title}"
}

# ---------------------------------------------------------------------------
# Tick loop. Each tick picks a small weighted bundle of emitters so every
# layer gets fresh data regularly without flooding any single one.
# ---------------------------------------------------------------------------

tick=0
while :; do
  tick=$(( tick + 1 ))
  if (( MAX_TICKS > 0 )) && (( tick > MAX_TICKS )); then
    log "reached MAX_TICKS=${MAX_TICKS} · exiting."
    break
  fi

  # Rotate through layers so every 5 ticks each layer has fired at least once.
  case $(( (tick - 1) % 5 )) in
    0) emit_telemetry ;;
    1) emit_detection ;;
    2) emit_mutation ;;
    3) emit_response ;;
    4) emit_governance ;;
  esac

  # Every 3rd tick: extra response (keeps MTTR window rolling fast).
  if (( tick % 3 == 0 )); then
    emit_response
  fi

  # Every 2nd tick: append a new reasoning span to a rotating run.
  if (( tick % 2 == 0 )); then
    emit_reasoning_span
  fi

  # Every 10th tick: force-refresh the indices so the UI poll picks up
  # the full batch. Without this, the default 1s refresh is already good
  # enough but a nudge avoids edge-cases on the first few ticks.
  if (( tick % 10 == 0 )); then
    "${CURL[@]}" -X POST "${ES_URL}/.soc-outcomes/_refresh" >/dev/null &
    "${CURL[@]}" -X POST "${ES_URL}/.soc-actor-trust-tiers/_refresh" >/dev/null &
    wait
    log "tick ${tick} · refreshed outcomes + trust tiers"
  fi

  sleep "${INTERVAL_SECS}"
done

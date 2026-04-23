#!/usr/bin/env bash
# ARGUS Live End-to-End Demo Driver
#
# Orchestrates the full ARGUS (Mythos-resilient defender) demo against a LIVE
# Kibana + Elasticsearch cluster. For each target workflow this driver:
#
#   1. Resolves the workflow object id from its display name (lookup via
#      GET /api/workflows so the script never hardcodes SO ids).
#   2. Triggers the workflow via POST /api/workflows/workflow/{id}/run.
#   3. Polls .workflows-executions directly for terminal status so the
#      driver does not depend on the cached Kibana API read model.
#   4. Emits a line-per-step summary from .workflows-step-executions.
#
# The driver intentionally avoids `workflow.execute` composition so every
# chain hop is visible (and so we do not depend on short-name -> SO id
# resolution inside the engine).
#
# Usage:
#   bash soc-simulation/scripts/argus_live_demo.sh
#
# Environment overrides:
#   KIBANA_URL (default http://localhost:${KIBANA_PORT:-15601})
#   ES_URL     (default http://localhost:${ES_PORT:-19200})
#   ES_USER    (default elastic)
#   ES_PASS    (default changeme)
#   RUN_LOG_DIR (default .soc-runtime-logs/argus-live-demo-<ts>)

set -eu

KIBANA_URL="${KIBANA_URL:-http://localhost:${KIBANA_PORT:-15601}}"
ES_URL="${ES_URL:-http://localhost:${ES_PORT:-19200}}"
ES_USER="${ES_USER:-elastic}"
ES_PASS="${ES_PASS:-changeme}"
AUTH=$(printf '%s:%s' "${ES_USER}" "${ES_PASS}" | base64)

TS=$(date +%Y%m%d-%H%M%S)
RUN_LOG_DIR="${RUN_LOG_DIR:-.soc-runtime-logs/argus-live-demo-${TS}}"
mkdir -p "${RUN_LOG_DIR}"

echo "=== ARGUS Live Demo ==="
echo "Kibana: ${KIBANA_URL}"
echo "ES:     ${ES_URL}"
echo "Log dir: ${RUN_LOG_DIR}"
echo

kbn() {
  curl -sS \
    -H "Authorization: Basic ${AUTH}" \
    -H 'kbn-xsrf: true' \
    -H 'elastic-api-version: 2023-10-31' \
    -H 'Content-Type: application/json' \
    "$@"
}

es() {
  curl -sS -u "${ES_USER}:${ES_PASS}" -H 'Content-Type: application/json' "$@"
}

# ── 1. Build a name -> workflow id index ────────────────────────────────
kbn "${KIBANA_URL}/api/workflows?size=500" -o "${RUN_LOG_DIR}/wf_list.json" > /dev/null
python3 - <<'PY' "${RUN_LOG_DIR}/wf_list.json" "${RUN_LOG_DIR}/wf_by_name.json"
import json, re, sys
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
byname = {}
for r in d.get("results", []):
    y = r.get("yaml","")
    m = re.search(r"^name:\s*(.+)$", y, re.M)
    name = m.group(1).strip() if m else r.get("name","")
    byname.setdefault(name, []).append({
        "id": r.get("id"),
        "enabled": r.get("enabled"),
        "createdAt": r.get("createdAt",""),
        "valid": r.get("valid"),
    })
# keep the most recently created entry per name
latest = {n: sorted(v, key=lambda x: x["createdAt"], reverse=True)[0] for n, v in byname.items()}
json.dump(latest, open(dst, "w"), indent=2)
print(f"indexed {len(latest)} workflow name(s)")
PY

run_wf() {
  # run_wf <display-name>
  local name="$1"
  local tag
  tag=$(printf '%s' "${name}" | tr ' /—' '___' | tr -cd '[:alnum:]_-')
  echo "--- Running workflow: ${name} ---"
  local wid
  wid=$(python3 -c "import json, sys; d=json.load(open('${RUN_LOG_DIR}/wf_by_name.json')); print(d.get(sys.argv[1], {}).get('id') or '')" "${name}")
  if [[ -z "${wid}" ]]; then
    echo "  [SKIP] no workflow object found for name=${name}"
    echo
    return 0
  fi
  echo "  wid=${wid}"

  local trig_resp="${RUN_LOG_DIR}/trigger_${tag}.json"
  local code
  code=$(kbn -X POST "${KIBANA_URL}/api/workflows/workflow/${wid}/run" -d '{"inputs":{}}' -o "${trig_resp}" -w "%{http_code}")
  echo "  trigger HTTP=${code}"
  local ex_id
  ex_id=$(python3 -c "import json; d=json.load(open('${trig_resp}')); print(d.get('workflowExecutionId') or d.get('id') or '')")
  if [[ -z "${ex_id}" ]]; then
    echo "  [ERR] no executionId returned"
    cat "${trig_resp}"
    echo
    return 1
  fi
  echo "  exec=${ex_id}"

  local attempt status='' src_file="${RUN_LOG_DIR}/exec_${tag}.json"
  for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
    sleep 1
    es -X GET "${ES_URL}/.workflows-executions/_doc/${ex_id}" -o "${src_file}" > /dev/null
    status=$(python3 -c "import json; d=json.load(open('${src_file}')); s=d.get('_source',d); print(s.get('status',''))")
    if [[ "${status}" == "completed" || "${status}" == "failed" ]]; then
      break
    fi
  done

  python3 - "${src_file}" <<'PY'
import json, sys
s = json.load(open(sys.argv[1])).get('_source', {})
print(f"  status={s.get('status')} started={s.get('startedAt')} finished={s.get('finishedAt')} duration={s.get('duration')} error={s.get('error')}")
PY

  # Step executions
  local steps_file="${RUN_LOG_DIR}/steps_${tag}.json"
  es -X POST "${ES_URL}/.workflows-step-executions/_search" \
    -d "{\"size\":50,\"query\":{\"term\":{\"workflowRunId\":\"${ex_id}\"}},\"sort\":[{\"startedAt\":{\"order\":\"asc\"}}]}" \
    -o "${steps_file}" > /dev/null
  python3 - "${steps_file}" <<'PY'
import json, sys
hits = json.load(open(sys.argv[1])).get('hits',{}).get('hits',[])
print(f"  steps={len(hits)}")
for h in hits:
    s = h.get('_source',{})
    err = s.get('error') or ''
    if err and len(err) > 140:
        err = err[:140] + '…'
    name = s.get('stepName') or s.get('stepId') or '?'
    print(f"    - {name:<40} type={s.get('stepType','?'):<24} status={s.get('status','?')} {'err='+err if err else ''}")
PY
  echo
}

TARGETS=(
  "SOC ARGUS — Arm Mythos-Class Preset"
  "SOC ARGUS — Frontier Simulator (M2.4)"
  "ARGUS Exploit-to-Detection Reconciler (M2.2)"
  "SOC Detection Eval (ARGUS M2.1)"
  "ARGUS Trust Tier Assessor (Phase 3)"
  "ARGUS Reasoning Watchdog (Phase 3)"
  "ARGUS Trust Gate (Phase 3)"
  "ARGUS Demo 1 Runner — Same-day CVE → Detection"
  "ARGUS Demo 2 Runner — Polymorphic Variant Swarm"
)
# NOTE: SOC Triage is deliberately NOT in this list. It depends on a live
# Inference connector and is driven by the soc-alert-sweeper pipeline on
# real alert input; triggering it empty from the ARGUS demo driver hangs
# the AI agent step and is not representative of demo flow.

for t in "${TARGETS[@]}"; do
  run_wf "${t}" || true
done

echo "=== Summary ==="
python3 - "${RUN_LOG_DIR}" <<'PY'
import json, os, sys
root = sys.argv[1]
passed = failed = 0
for fn in sorted(os.listdir(root)):
    if not fn.startswith('exec_'):
        continue
    src = json.load(open(os.path.join(root, fn))).get('_source',{})
    st = src.get('status','?')
    if st == 'completed':
        passed += 1
    else:
        failed += 1
print(f"completed={passed} failed/other={failed}")
PY
echo "Logs: ${RUN_LOG_DIR}"

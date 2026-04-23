#!/usr/bin/env bash
# Attach osquery_manager + system integrations to the SOC endpoint policy.
#
# Idempotent — skips creation when a package policy of the same name is already
# attached to ${POLICY_ID}. Intended for the Argus Fleet/Caldera E2E demo.
set -euo pipefail

KIBANA_URL="${KIBANA_URL:-http://localhost:15601}"
KIBANA_USER="${KIBANA_USER:-elastic}"
KIBANA_PASS="${KIBANA_PASS:-${ELASTIC_PASSWORD:-changeme}}"
POLICY_ID="${POLICY_ID:-soc-endpoint-policy}"

log() { printf '[setup_endpoint_integrations] %s\n' "$*"; }

curl_kbn() {
  curl -sf -u "${KIBANA_USER}:${KIBANA_PASS}" \
    -H 'kbn-xsrf: true' \
    -H 'elastic-api-version: 2023-10-31' \
    -H 'Content-Type: application/json' \
    "$@"
}

require_policy() {
  log "verifying policy ${POLICY_ID} exists..."
  if ! curl_kbn "${KIBANA_URL}/api/fleet/agent_policies/${POLICY_ID}" >/dev/null; then
    log "ERROR: policy ${POLICY_ID} not found on ${KIBANA_URL}"
    exit 1
  fi
}

ensure_package_installed() {
  local pkg="$1"
  log "ensuring package ${pkg} installed..."
  local resp
  resp="$(curl_kbn "${KIBANA_URL}/api/fleet/epm/packages/${pkg}" || true)"
  local status
  status="$(printf '%s' "${resp}" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
except Exception:
  print(""); sys.exit(0)
print((d.get("item") or d).get("status",""))' || true)"
  if [ "${status}" != "installed" ]; then
    log "installing ${pkg}..."
    curl_kbn -X POST "${KIBANA_URL}/api/fleet/epm/packages/${pkg}" \
      -d '{"force":true}' >/dev/null || true
  fi
}

pkg_version() {
  local pkg="$1"
  curl_kbn "${KIBANA_URL}/api/fleet/epm/packages/${pkg}" |
    python3 -c '
import json,sys
d=json.load(sys.stdin)
item=d.get("item") or d
print(item.get("version","0.0.0"))'
}

has_package_policy() {
  local name="$1"
  TARGET_NAME="${name}" TARGET_POLICY_ID="${POLICY_ID}" \
  curl_kbn "${KIBANA_URL}/api/fleet/package_policies?perPage=500" |
    TARGET_NAME="${name}" TARGET_POLICY_ID="${POLICY_ID}" python3 -c '
import json,os,sys
target_name=os.environ["TARGET_NAME"]
policy=os.environ["TARGET_POLICY_ID"]
data=json.load(sys.stdin)
items=data.get("items",[])
for it in items:
  if it.get("name")==target_name and it.get("policy_id")==policy:
    print("1"); break
else:
  print("0")
' | tr -d '\n'
}

create_system_policy() {
  local name="argus-system"
  local has
  has="$(has_package_policy "${name}")"
  if [ "${has}" = "1" ]; then
    log "system package policy ${name} already attached — skipping."
    return 0
  fi
  local version
  version="$(pkg_version system)"
  log "attaching system@${version} to ${POLICY_ID} as ${name}..."
  local body
  body="$(cat <<JSON
{
  "name": "${name}",
  "namespace": "default",
  "policy_id": "${POLICY_ID}",
  "enabled": true,
  "package": {"name": "system", "version": "${version}"},
  "inputs": []
}
JSON
)"
  curl_kbn -X POST "${KIBANA_URL}/api/fleet/package_policies?format=simplified" \
    -d "${body}" >/dev/null
}

create_osquery_policy() {
  local name="argus-osquery"
  local has
  has="$(has_package_policy "${name}")"
  if [ "${has}" = "1" ]; then
    log "osquery_manager package policy ${name} already attached — skipping."
    return 0
  fi
  local version
  version="$(pkg_version osquery_manager)"
  log "attaching osquery_manager@${version} to ${POLICY_ID} as ${name}..."
  local body
  body="$(cat <<JSON
{
  "name": "${name}",
  "namespace": "default",
  "policy_id": "${POLICY_ID}",
  "enabled": true,
  "package": {"name": "osquery_manager", "version": "${version}"},
  "inputs": []
}
JSON
)"
  curl_kbn -X POST "${KIBANA_URL}/api/fleet/package_policies?format=simplified" \
    -d "${body}" >/dev/null
}

schedule_process_pack() {
  # Saved-object API — schedules a recurring osquery live query so the agent
  # publishes into logs-osquery_manager.result-*.
  local pack_name="argus-linux-proc-watch"
  log "ensuring live osquery schedule ${pack_name} exists..."
  local existing
  existing="$(
    curl_kbn "${KIBANA_URL}/api/osquery/packs?perPage=100" | PACK_NAME="${pack_name}" python3 -c '
import json,os,sys
target=os.environ["PACK_NAME"]
try:
  data=json.load(sys.stdin)
except Exception:
  print(""); sys.exit(0)
for it in data.get("data",data.get("items",[])):
  attrs=it.get("attributes",it)
  if attrs.get("name")==target:
    print(it.get("id",attrs.get("id",""))); break
'
  )" || true
  if [ -n "${existing}" ]; then
    log "osquery pack already exists — skipping."
    return 0
  fi
  local body
  body="$(cat <<JSON
{
  "name": "${pack_name}",
  "description": "Argus demo — watch for pipe-to-shell process cmdlines.",
  "enabled": true,
  "policy_ids": ["${POLICY_ID}"],
  "queries": {
    "proc_cmdline_watch": {
      "query": "SELECT pid, name, path, cmdline FROM processes WHERE cmdline LIKE '%| sh%' OR cmdline LIKE '%| bash%';",
      "interval": 10,
      "platform": "linux"
    }
  }
}
JSON
)"
  curl_kbn -X POST "${KIBANA_URL}/api/osquery/packs" -d "${body}" >/dev/null || {
    log "WARNING: osquery pack creation failed (may be unsupported by this Kibana build). Continuing."
  }
}

main() {
  require_policy
  ensure_package_installed system
  ensure_package_installed osquery_manager
  create_system_policy
  create_osquery_policy
  schedule_process_pack
  log "done."
}

main "$@"

#!/usr/bin/env bash
# soc-endpoint-1 entrypoint.
#
# Enrols this container as an Elastic Agent against the host-side Kibana Fleet,
# launches a Caldera sandcat implant alongside, and hands off to the standard
# elastic-agent container runtime. Designed for the Argus demo only — relies on
# HTTP (no TLS) and the `elastic` super-user from the compose .env.
set -euo pipefail

log() { printf '[enroll_and_run] %s\n' "$*"; }

: "${KIBANA_HOST:?KIBANA_HOST is required}"
: "${KIBANA_USERNAME:?KIBANA_USERNAME is required}"
: "${KIBANA_PASSWORD:?KIBANA_PASSWORD is required}"
: "${FLEET_URL:?FLEET_URL is required}"
: "${POLICY_ID:?POLICY_ID is required}"
: "${CALDERA_URL:?CALDERA_URL is required}"

CALDERA_API_KEY="${CALDERA_API_KEY:-ADMIN123}"
CALDERA_GROUP="${CALDERA_GROUP:-all-endpoints}"
SANDCAT_BINARY="${SANDCAT_BINARY:-/opt/soc/sandcat}"

wait_for_kibana() {
  log "waiting for Kibana at ${KIBANA_HOST}..."
  local tries=0
  until curl -sf -u "${KIBANA_USERNAME}:${KIBANA_PASSWORD}" "${KIBANA_HOST}/api/status" >/dev/null; do
    tries=$((tries + 1))
    if [ "${tries}" -gt 60 ]; then
      log "ERROR: Kibana never became reachable"
      exit 1
    fi
    sleep 5
  done
  log "Kibana reachable."
}

fetch_enrollment_token() {
  log "resolving enrollment token for policy ${POLICY_ID}..."
  # Image only ships sed/grep/awk — no jq/python. We split the JSON items on
  # `},{`, grep the block for our policy_id, then extract the first api_key.
  local tries=0 token="" raw=""
  while [ -z "${token}" ]; do
    tries=$((tries + 1))
    raw="$(
      curl -sf -u "${KIBANA_USERNAME}:${KIBANA_PASSWORD}" \
        -H 'kbn-xsrf: true' -H 'elastic-api-version: 2023-10-31' \
        "${KIBANA_HOST}/api/fleet/enrollment_api_keys?perPage=200" || true
    )"
    if [ -n "${raw}" ]; then
      token="$(
        printf '%s' "${raw}" |
          sed 's/},{/}\n{/g' |
          grep "\"policy_id\":\"${POLICY_ID}\"" |
          grep -v '"active":false' |
          grep -oE '"api_key":"[^"]+"' |
          head -n1 |
          sed -E 's/.*"api_key":"([^"]+)".*/\1/'
      )"
    fi
    if [ -n "${token}" ]; then
      break
    fi
    if [ "${tries}" -gt 60 ]; then
      log "ERROR: no enrollment token found for policy ${POLICY_ID}"
      exit 1
    fi
    sleep 5
  done
  FLEET_ENROLLMENT_TOKEN="${token}"
  export FLEET_ENROLLMENT_TOKEN
  log "enrollment token acquired (len=${#token})."
}

fetch_and_run_sandcat() {
  log "fetching sandcat binary from ${CALDERA_URL}..."
  # The /file/download endpoint compiles the binary on demand; can take a minute.
  local tries=0
  while [ "${tries}" -lt 30 ]; do
    if curl -sf -X POST \
        -H "KEY: ${CALDERA_API_KEY}" \
        -H 'file: sandcat.go' \
        -H 'platform: linux' \
        "${CALDERA_URL}/file/download" \
        -o "${SANDCAT_BINARY}"; then
      if [ -s "${SANDCAT_BINARY}" ]; then
        break
      fi
    fi
    tries=$((tries + 1))
    log "sandcat fetch retry ${tries}/30..."
    sleep 10
  done
  if [ ! -s "${SANDCAT_BINARY}" ]; then
    log "WARNING: failed to fetch sandcat; continuing without Caldera agent."
    return 0
  fi
  chmod +x "${SANDCAT_BINARY}"
  log "launching sandcat (group=${CALDERA_GROUP})..."
  nohup "${SANDCAT_BINARY}" \
    -server "${CALDERA_URL}" \
    -group "${CALDERA_GROUP}" \
    -v \
    >/var/log/sandcat.log 2>&1 &
  log "sandcat started (pid=$!)."
}

main() {
  wait_for_kibana
  fetch_enrollment_token
  fetch_and_run_sandcat

  export FLEET_ENROLL="1"
  export FLEET_URL
  export FLEET_ENROLLMENT_TOKEN
  export FLEET_INSECURE="${FLEET_INSECURE:-true}"

  log "handing off to elastic-agent container runtime (fleet-url=${FLEET_URL})..."
  # The upstream image ships /usr/local/bin/docker-entrypoint that runs
  # `elastic-agent container` when FLEET_ENROLL=1.
  exec /usr/local/bin/docker-entrypoint elastic-agent
}

main "$@"

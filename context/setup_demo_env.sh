#!/usr/bin/env bash
set -euo pipefail

# Orchestrates the detection-emulation + endpoint-response-actions demo stack.
# Kibana must still be started manually (long-running dev server).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ES_URL="${ES_URL:-http://127.0.0.1:9200}"
KIBANA_URL="${KIBANA_URL:-http://127.0.0.1:5601}"
ES_USER="${ES_USER:-elastic}"
ES_PASS="${ES_PASS:-changeme}"
AGENT_VERSION="${AGENT_VERSION:-9.5.0-SNAPSHOT}"
FLEET_PORT="${FLEET_PORT:-8220}"
KIBANA_DEV_YML="${KIBANA_DEV_YML:-$ROOT/config/kibana.dev.yml}"
KIBANA_DEV_EXAMPLE="$ROOT/context/kibana.dev.yml.example"
ENDPOINT_SCRIPTS="$ROOT/x-pack/solutions/security/plugins/security_solution/scripts/endpoint"

usage() {
  cat <<EOF
Usage: $(basename "$0") <command>

Commands:
  detect-ip       Print the Fleet host IP (host + multipass reachable)
  export-ip       Print 'export KIBANA_LOCALHOST_REAL_IP=…'
  write-config    Write config/kibana.dev.yml from template + detected IP
  mint-token      Create ES service account token and patch kibana.dev.yml
  fleet           Start Fleet Server (Docker)
  endpoint        Enroll Elastic Defend endpoint VM (multipass)
  status          Check ES / Kibana / Fleet / endpoint agent health
  all             write-config → mint-token (if needed) → fleet → endpoint → status

Environment overrides: ES_URL, KIBANA_URL, ES_USER, ES_PASS, AGENT_VERSION, FLEET_PORT

Kibana (manual, required before fleet/endpoint):
  KBN_USE_RSPACK=true yarn start --no-base-path
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 1
  fi
}

detect_fleet_host_ip() {
  node "$ROOT/context/print_fleet_host_ip.js"
}

export_fleet_host_ip() {
  local ip
  ip="$(detect_fleet_host_ip)"
  echo "export KIBANA_LOCALHOST_REAL_IP=$ip"
}

write_config() {
  require_cmd sed

  local ip token
  ip="$(detect_fleet_host_ip)"

  if [[ ! -f "$KIBANA_DEV_EXAMPLE" ]]; then
    echo "error: missing template $KIBANA_DEV_EXAMPLE" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$KIBANA_DEV_YML")"

  if [[ -f "$KIBANA_DEV_YML" ]] && grep -q "AAEAA" "$KIBANA_DEV_YML" 2>/dev/null; then
    token="$(grep 'elasticsearch.serviceAccountToken' "$KIBANA_DEV_YML" | sed -E "s/.*'([^']+)'.*/\1/")"
  else
    token='__KIBANA_SERVICE_ACCOUNT_TOKEN__'
  fi

  sed \
    -e "s/__FLEET_HOST_IP__/$ip/g" \
    -e "s/__KIBANA_SERVICE_ACCOUNT_TOKEN__/$token/g" \
    "$KIBANA_DEV_EXAMPLE" >"$KIBANA_DEV_YML"

  echo "Wrote $KIBANA_DEV_YML (Fleet host IP: $ip)"
  if [[ "$token" == '__KIBANA_SERVICE_ACCOUNT_TOKEN__' ]]; then
    echo "Run '$(basename "$0") mint-token' to create the Kibana service account token."
  fi
}

mint_token() {
  require_cmd curl
  require_cmd jq

  local token
  token="$(curl -s -u "$ES_USER:$ES_PASS" -X POST \
    "$ES_URL/_security/service/elastic/kibana/credential/token/kibana-demo" | jq -r .value)"

  if [[ -z "$token" || "$token" == "null" ]]; then
    echo "error: failed to mint Kibana service account token from $ES_URL" >&2
    exit 1
  fi

  if [[ ! -f "$KIBANA_DEV_YML" ]]; then
    write_config
  fi

  node -e "
    const fs = require('fs');
    const path = process.argv[1];
    const token = process.argv[2];
    const yml = fs.readFileSync(path, 'utf8').replace(
      /elasticsearch\\.serviceAccountToken:.*/,
      \"elasticsearch.serviceAccountToken: '\" + token + \"'\"
    );
    fs.writeFileSync(path, yml);
  " "$KIBANA_DEV_YML" "$token"

  echo "Updated service account token in $KIBANA_DEV_YML"
}

start_fleet() {
  require_cmd docker
  export KIBANA_LOCALHOST_REAL_IP="${KIBANA_LOCALHOST_REAL_IP:-$(detect_fleet_host_ip)}"

  node "$ENDPOINT_SCRIPTS/start_fleet_server.js" \
    --elasticUrl http://host.docker.internal:9200 \
    --kibanaUrl "$KIBANA_URL" \
    --username "$ES_USER" \
    --password "$ES_PASS" \
    --version "$AGENT_VERSION" \
    --port "$FLEET_PORT" \
    --force
}

enroll_endpoint() {
  require_cmd multipass
  export KIBANA_LOCALHOST_REAL_IP="${KIBANA_LOCALHOST_REAL_IP:-$(detect_fleet_host_ip)}"

  node "$ENDPOINT_SCRIPTS/run_endpoint_agent.js" \
    --elasticUrl "$ES_URL" \
    --kibanaUrl "$KIBANA_URL" \
    --username "$ES_USER" \
    --password "$ES_PASS" \
    --version "$AGENT_VERSION"
}

print_status() {
  require_cmd curl
  require_cmd jq

  local ip kibana_code fleet_status
  ip="$(detect_fleet_host_ip)"

  kibana_code="$(curl -s -o /dev/null -w '%{http_code}' "$KIBANA_URL/api/status" || true)"
  fleet_status="$(curl -sk --max-time 3 "https://$ip:$FLEET_PORT/api/status" 2>/dev/null | jq -r '.status // "unreachable"' || echo unreachable)"

  echo "Elasticsearch: $ES_URL"
  curl -s -u "$ES_USER:$ES_PASS" "$ES_URL/_cluster/health" | jq -r '"  cluster: \(.status)"' || echo "  unreachable"

  echo "Kibana:        $KIBANA_URL (HTTP $kibana_code)"
  if [[ "$kibana_code" != "200" ]]; then
    echo "  Start with: KBN_USE_RSPACK=true yarn start --no-base-path"
  fi

  echo "Fleet Server:  https://$ip:$FLEET_PORT ($fleet_status)"

  if [[ "$kibana_code" == "200" ]]; then
    curl -s -u "$ES_USER:$ES_PASS" "$KIBANA_URL/api/fleet/agents?perPage=100" |
      jq -r '[.items[] | select(.type != "EPHEMERAL") | {hostname: .local_metadata.host.hostname, status, type}] | .[] | "  agent \(.hostname): \(.status)"'
  fi
}

run_all() {
  write_config
  if grep -q '__KIBANA_SERVICE_ACCOUNT_TOKEN__' "$KIBANA_DEV_YML" 2>/dev/null; then
    mint_token
  fi

  if [[ "$(curl -s -o /dev/null -w '%{http_code}' "$KIBANA_URL/api/status" || true)" != "200" ]]; then
    echo "error: Kibana is not healthy at $KIBANA_URL" >&2
    echo "Start it first: KBN_USE_RSPACK=true yarn start --no-base-path" >&2
    exit 1
  fi

  start_fleet
  enroll_endpoint
  print_status
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    detect-ip) detect_fleet_host_ip ;;
    export-ip) export_fleet_host_ip ;;
    write-config) write_config ;;
    mint-token) mint_token ;;
    fleet) start_fleet ;;
    endpoint) enroll_endpoint ;;
    status) print_status ;;
    all) run_all ;;
    -h | --help | help | '') usage ;;
    *)
      echo "error: unknown command: $cmd" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"

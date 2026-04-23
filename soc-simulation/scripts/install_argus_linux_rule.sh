#!/usr/bin/env bash
# Idempotently create-or-enable the Argus Linux pipe-to-shell demo rule.
#
# Reads the canonical rule body from detection_rules/rules.ndjson (the line
# whose rule_id is "argus-linux-pipe-to-shell") and POSTs it to the detection
# engine API. If the rule already exists (409), it is left in place and bulk-
# enabled to guarantee it runs.
set -euo pipefail

KIBANA_URL="${KIBANA_URL:-http://localhost:15601}"
KIBANA_USER="${KIBANA_USER:-elastic}"
KIBANA_PASS="${KIBANA_PASS:-${ELASTIC_PASSWORD:-changeme}}"
RULE_ID="${RULE_ID:-argus-linux-pipe-to-shell}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RULES_NDJSON="${HERE}/detection_rules/rules.ndjson"

log() { printf '[install_argus_linux_rule] %s\n' "$*"; }

if [ ! -f "${RULES_NDJSON}" ]; then
  log "ERROR: ${RULES_NDJSON} not found"
  exit 1
fi

rule_body="$(python3 - <<PYEOF
import json, sys
target = "${RULE_ID}"
with open("${RULES_NDJSON}", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        r = json.loads(line)
        if r.get("rule_id") == target:
            # Strip fields the create-rule API rejects
            for drop in ("id", "updated_at", "updated_by", "created_at", "created_by", "immutable"):
                r.pop(drop, None)
            print(json.dumps(r, ensure_ascii=False))
            sys.exit(0)
print("")
PYEOF
)"

if [ -z "${rule_body}" ]; then
  log "ERROR: rule_id=${RULE_ID} not found in ${RULES_NDJSON}"
  exit 1
fi

log "deleting any prior version of rule ${RULE_ID} (idempotent upsert)..."
curl -sS -u "${KIBANA_USER}:${KIBANA_PASS}" \
  -H 'kbn-xsrf: true' \
  -H 'elastic-api-version: 2023-10-31' \
  -H 'Content-Type: application/json' \
  -X DELETE "${KIBANA_URL}/api/detection_engine/rules?rule_id=${RULE_ID}" >/dev/null || true

log "creating rule ${RULE_ID}..."
http_code="$(curl -sS -o /tmp/install_rule_resp.json \
  -u "${KIBANA_USER}:${KIBANA_PASS}" \
  -H 'kbn-xsrf: true' \
  -H 'elastic-api-version: 2023-10-31' \
  -H 'Content-Type: application/json' \
  -X POST "${KIBANA_URL}/api/detection_engine/rules" \
  -d "${rule_body}" \
  -w '%{http_code}')"

case "${http_code}" in
  200|201)
    log "rule ${RULE_ID} created (HTTP ${http_code})."
    ;;
  409)
    log "rule ${RULE_ID} already exists — leaving body as-is."
    ;;
  *)
    log "ERROR: create failed (HTTP ${http_code}). Response:"
    cat /tmp/install_rule_resp.json
    exit 1
    ;;
esac

log "fetching rule UUID..."
uuid="$(
  curl -sS -u "${KIBANA_USER}:${KIBANA_PASS}" \
    -H 'kbn-xsrf: true' \
    -H 'elastic-api-version: 2023-10-31' \
    "${KIBANA_URL}/api/detection_engine/rules?rule_id=${RULE_ID}" |
    python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  print(d.get("id",""))
except Exception:
  print("")'
)"

if [ -z "${uuid}" ]; then
  log "WARNING: could not resolve rule UUID — skipping bulk-enable."
  exit 0
fi

log "ensuring rule ${RULE_ID} (uuid=${uuid}) is enabled..."
curl -sS -u "${KIBANA_USER}:${KIBANA_PASS}" \
  -H 'kbn-xsrf: true' \
  -H 'elastic-api-version: 2023-10-31' \
  -H 'Content-Type: application/json' \
  -X POST "${KIBANA_URL}/api/detection_engine/rules/_bulk_action?dry_run=false" \
  -d "{\"action\":\"enable\",\"ids\":[\"${uuid}\"]}" >/dev/null || true

log "done."

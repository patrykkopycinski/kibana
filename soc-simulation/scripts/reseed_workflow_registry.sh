#!/usr/bin/env bash
# soc-simulation/scripts/reseed_workflow_registry.sh
#
# Idempotent re-seed of the .soc-workflow-registry data stream from the
# authored manifest at soc-simulation/workflows/_registry.json.
#
# Extracted from setup.sh (L708-L759) so operators can refresh the registry
# after the `tags` field was added without re-running the full multi-minute
# setup.sh (which also rebuilds dashboards, deploys saved objects, and
# reseeds every index).
#
# Usage:
#   bash soc-simulation/scripts/reseed_workflow_registry.sh
#
# Honours the same env conventions as setup.sh:
#   ES_URL            default http://localhost:${ES_PORT:-19200}
#   ES_USER           default elastic
#   ES_PASS           default ${ELASTIC_PASSWORD:-changeme}
#
# Exits non-zero if the manifest is missing or python3/curl are unavailable.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOC_SIM_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WF_REGISTRY_MANIFEST="${SOC_SIM_DIR}/workflows/_registry.json"

ES_URL="${ES_URL:-http://localhost:${ES_PORT:-19200}}"
ES_USER="${ES_USER:-elastic}"
ES_PASS="${ES_PASS:-${ELASTIC_PASSWORD:-changeme}}"

if [[ ! -f "$WF_REGISTRY_MANIFEST" ]]; then
  echo "ERROR: manifest not found at ${WF_REGISTRY_MANIFEST}" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required" >&2
  exit 1
fi

echo "=== Reseeding .soc-workflow-registry ==="
echo "ES:       ${ES_URL}"
echo "Manifest: ${WF_REGISTRY_MANIFEST}"
echo ""

seed_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Build a newline-separated list of "workflow_id\tJSON-body" tuples.
# Kept identical to setup.sh so docs written by either path match byte-for-byte.
manifest_rows=$(python3 - "$WF_REGISTRY_MANIFEST" "$seed_ts" <<'PYEOF'
import json, sys
path, ts = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)
for w in data["workflows"]:
    body = {
        "workflow_id":      w["workflow_id"],
        "automation_level": w["automation_level"],
        "connectors":       w.get("connectors", []),
        "summary":          w["summary"],
        "owner":            w.get("owner", "canonical"),
        "model_tier":       w.get("model_tier", "none"),
        "tags":             w.get("tags", []),
        "last_seeded_at":   ts,
    }
    print(f"{w['workflow_id']}\t{json.dumps(body)}")
PYEOF
)

declared_ids=()
while IFS=$'\t' read -r wf_id wf_body; do
  [[ -z "$wf_id" ]] && continue
  declared_ids+=("$wf_id")
  # Use `_update` with `doc` + `upsert` so the merge preserves derived
  # fields (e.g. `kibana_workflow_id` written by resolve_workflow_ids.sh
  # after Workflows Management imports). A naked `PUT _doc` replaces the
  # document and would wipe every reseed.
  update_body=$(python3 -c '
import json, sys
body = json.loads(sys.argv[1])
print(json.dumps({"doc": body, "upsert": body}))
' "${wf_body}")
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -u "${ES_USER}:${ES_PASS}" \
    -X POST \
    -H "Content-Type: application/json" \
    "${ES_URL}/.soc-workflow-registry/_update/${wf_id}" \
    --data "${update_body}")
  if [[ "$http_code" != "200" && "$http_code" != "201" ]]; then
    echo "  WARN: HTTP ${http_code} seeding registry doc ${wf_id}" >&2
  fi
done <<< "$manifest_rows"

# Delete any older docs that are no longer declared in the manifest.
stale_query=$(python3 -c '
import json, sys
ids = sys.argv[1:]
print(json.dumps({"query":{"bool":{"must_not":[{"terms":{"workflow_id":ids}}]}}}))
' "${declared_ids[@]}")

curl -s -o /dev/null -u "${ES_USER}:${ES_PASS}" \
  -X POST \
  -H "Content-Type: application/json" \
  "${ES_URL}/.soc-workflow-registry/_delete_by_query?refresh=true&conflicts=proceed" \
  --data "${stale_query}" || true

echo "Seeded ${#declared_ids[@]} workflow(s) into .soc-workflow-registry."

# Quick sanity read so the operator gets immediate feedback.
tagged_count=$(curl -s -u "${ES_USER}:${ES_PASS}" \
  "${ES_URL}/.soc-workflow-registry/_count" \
  -H "Content-Type: application/json" \
  --data '{"query":{"term":{"tags":"argus:playbook"}}}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("count", "?"))')

echo "argus:playbook tagged docs: ${tagged_count}"

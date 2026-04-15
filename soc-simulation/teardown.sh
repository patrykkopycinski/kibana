#!/usr/bin/env bash
# soc-simulation/teardown.sh
# Remove all SOC simulation artifacts from a Kibana/ES instance.
# Usage: ./teardown.sh --confirm [--env <env-file>]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
CONFIRMED=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --confirm) CONFIRMED=true; shift ;;
    --env) ENV_FILE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ "$CONFIRMED" != "true" ]]; then
  echo "Usage: ./teardown.sh --confirm [--env <env-file>]"
  echo "This will DELETE all SOC simulation artifacts. Pass --confirm to proceed."
  exit 1
fi

# ---------------------------------------------------------------------------
# Load environment
# ---------------------------------------------------------------------------
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  echo "Warning: env file not found at $ENV_FILE — using defaults"
fi

ES_HOST="${ES_HOST:-http://localhost:${ES_PORT:-19200}}"
KIBANA_HOST="${KIBANA_HOST:-http://localhost:${KIBANA_PORT:-15601}}"
ES_USER="${ES_USER:-elastic}"
ES_PASSWORD="${ES_PASSWORD:-changeme}"

# Wrappers that properly expand variables without eval quoting hazards
es_curl() {
  curl -sf -u "${ES_USER}:${ES_PASSWORD}" "$@"
}

kb_curl() {
  curl -sf -u "${ES_USER}:${ES_PASSWORD}" \
    -H "kbn-xsrf: true" \
    -H "Content-Type: application/json" \
    "$@"
}

echo "=== SOC Simulation Teardown ==="
echo "Elasticsearch: ${ES_HOST}"
echo "Kibana:        ${KIBANA_HOST}"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Delete data streams
# ---------------------------------------------------------------------------
echo "--- Step 1/6: Deleting data streams ---"
DATA_STREAMS=(
  ".soc-triage-results"
  ".soc-entity-enrichment"
  ".soc-hunt-findings"
  ".soc-response-actions"
  ".soc-outcomes"
  ".soc-agent-health"
  ".soc-evolution-log"
  ".soc-coverage-gaps"
  ".soc-audit-trail"
)

for ds in "${DATA_STREAMS[@]}"; do
  echo "  Deleting data stream: ${ds}"
  es_curl -X DELETE "${ES_HOST}/_data_stream/${ds}" || true
done

# ---------------------------------------------------------------------------
# Step 2: Delete regular indices
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 2/6: Deleting regular indices ---"
REGULAR_INDICES=(
  ".soc-attack-commands"
  ".soc-difficulty-state"
  ".soc-dead-letter"
)

for idx in "${REGULAR_INDICES[@]}"; do
  echo "  Deleting index: ${idx}"
  es_curl -X DELETE "${ES_HOST}/${idx}" || true
done

# ---------------------------------------------------------------------------
# Step 3: Delete index templates
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 3/6: Deleting index templates ---"
TEMPLATES_DIR="${SCRIPT_DIR}/setup/index_templates"

if [[ -d "$TEMPLATES_DIR" ]]; then
  for template_file in "${TEMPLATES_DIR}"/*.json; do
    template_name="$(basename "${template_file}" .json)"
    echo "  Deleting index template: ${template_name}"
    es_curl -X DELETE "${ES_HOST}/_index_template/${template_name}" || true
  done
else
  echo "  Warning: templates directory not found at ${TEMPLATES_DIR}"
fi

# ---------------------------------------------------------------------------
# Step 4: Delete ILM policies
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 4/6: Deleting ILM policies ---"
ILM_DIR="${SCRIPT_DIR}/setup/ilm_policies"

if [[ -d "$ILM_DIR" ]]; then
  for policy_file in "${ILM_DIR}"/*.json; do
    policy_name="$(basename "${policy_file}" .json)"
    echo "  Deleting ILM policy: ${policy_name}"
    es_curl -X DELETE "${ES_HOST}/_ilm/policy/${policy_name}" || true
  done
else
  echo "  Warning: ILM policies directory not found at ${ILM_DIR}"
fi

# ---------------------------------------------------------------------------
# Step 5: Delete Agent Builder agents
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 5/6: Deleting Agent Builder agents ---"
AGENTS_DIR="${SCRIPT_DIR}/agents"

if [[ -d "$AGENTS_DIR" ]]; then
  for agent_file in "${AGENTS_DIR}"/*.json; do
    agent_id="$(python3 -c "import json,sys; d=json.load(open('${agent_file}')); print(d.get('id',''))" 2>/dev/null || true)"
    if [[ -n "$agent_id" ]]; then
      agent_name="$(basename "${agent_file}" .json)"
      echo "  Deleting agent: ${agent_name} (id=${agent_id})"
      kb_curl -X DELETE "${KIBANA_HOST}/api/agent_builder/agents/${agent_id}" || true
    else
      echo "  Warning: could not parse id from $(basename "${agent_file}")"
    fi
  done
else
  echo "  No agents directory found at ${AGENTS_DIR} — skipping"
fi

# ---------------------------------------------------------------------------
# Step 6: Delete workflows
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 6/6: Deleting SOC workflows ---"

# List all workflows, filter those with names starting with "SOC "
workflows_response=$(kb_curl "${KIBANA_HOST}/api/workflows" 2>/dev/null || echo "")

if [[ -n "$workflows_response" ]]; then
  soc_workflow_ids=$(echo "$workflows_response" | python3 -c "
import json, sys
data = json.load(sys.stdin)
# Handle both array and paginated response shapes
items = data if isinstance(data, list) else data.get('items', data.get('workflows', []))
for wf in items:
    if wf.get('name', '').startswith('SOC '):
        print(wf['id'])
" 2>/dev/null || true)

  if [[ -n "$soc_workflow_ids" ]]; then
    while IFS= read -r wf_id; do
      [[ -z "$wf_id" ]] && continue
      echo "  Deleting workflow: ${wf_id}"
      kb_curl -X DELETE "${KIBANA_HOST}/api/workflows/workflow/${wf_id}" || true
    done <<< "$soc_workflow_ids"
  else
    echo "  No SOC workflows found"
  fi
else
  echo "  Warning: could not list workflows (Kibana unreachable or API error)"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "=== Teardown complete ==="

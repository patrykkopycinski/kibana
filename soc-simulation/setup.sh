#!/usr/bin/env bash
# soc-simulation/setup.sh
# Deploy all SOC simulation artifacts to a Kibana/ES instance.
# Usage: ./setup.sh [--env <env-file>]
#
# Idempotent — safe to re-run. Existing resources are overwritten.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

while [[ $# -gt 0 ]]; do
  case $1 in
    --env) ENV_FILE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  set -a; source "$ENV_FILE"; set +a
fi

ES_URL="${ES_URL:-http://localhost:${ES_PORT:-19200}}"
KIBANA_URL="${KIBANA_URL:-http://localhost:${KIBANA_PORT:-15601}}"
ES_USER="${ES_USER:-elastic}"
ES_PASS="${ES_PASS:-${ELASTIC_PASSWORD:-changeme}}"

echo "=== SOC Simulation Setup ==="
echo "ES:     $ES_URL"
echo "Kibana: $KIBANA_URL"
echo ""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

es_curl() {
  # es_curl <method> <path> [extra curl args...]
  local method="$1"
  local path="$2"
  shift 2
  curl -sf -u "${ES_USER}:${ES_PASS}" \
    -X "${method}" \
    -H "Content-Type: application/json" \
    "${ES_URL}${path}" \
    "$@"
}

kbn_curl() {
  # kbn_curl <method> <path> [extra curl args...]
  local method="$1"
  local path="$2"
  shift 2
  curl -sf -u "${ES_USER}:${ES_PASS}" \
    -X "${method}" \
    -H "kbn-xsrf: true" \
    -H "Content-Type: application/json" \
    "${KIBANA_URL}${path}" \
    "$@"
}

kbn_curl_versioned() {
  # kbn_curl_versioned <method> <path> [extra curl args...]
  # For versioned APIs (workflows) that require Elastic-Api-Version header
  local method="$1"
  local path="$2"
  shift 2
  curl -sf -u "${ES_USER}:${ES_PASS}" \
    -X "${method}" \
    -H "kbn-xsrf: true" \
    -H "Content-Type: application/json" \
    -H "Elastic-Api-Version: 2023-10-31" \
    "${KIBANA_URL}${path}" \
    "$@"
}

# Wait for a URL to return HTTP 200, retrying up to $max_attempts times.
wait_for() {
  local label="$1"
  local url="$2"
  local max_attempts=60
  local attempt=0

  echo -n "Waiting for ${label} to be healthy"
  while true; do
    if curl -sf -u "${ES_USER}:${ES_PASS}" -o /dev/null "${url}" 2>/dev/null; then
      echo " OK"
      return 0
    fi
    attempt=$(( attempt + 1 ))
    if [[ $attempt -ge $max_attempts ]]; then
      echo ""
      echo "ERROR: ${label} did not become healthy after ${max_attempts} attempts." >&2
      exit 1
    fi
    echo -n "."
    sleep 2
  done
}

# ---------------------------------------------------------------------------
# 0. Wait for services
# ---------------------------------------------------------------------------

wait_for "Elasticsearch" "${ES_URL}/_cluster/health?wait_for_status=yellow&timeout=5s"
wait_for "Kibana"         "${KIBANA_URL}/api/status"

echo ""

# ---------------------------------------------------------------------------
# 0b. Activate trial license (required for Agent Builder)
# ---------------------------------------------------------------------------

echo -n "Activating trial license... "
es_curl POST "/_license/start_trial?acknowledge=true" > /dev/null 2>&1 || true
echo "OK"
echo ""

# ---------------------------------------------------------------------------
# 1. ILM policies
# ---------------------------------------------------------------------------

ILM_DIR="${SCRIPT_DIR}/setup/ilm_policies"
if [[ -d "$ILM_DIR" ]]; then
  echo "--- Deploying ILM policies ---"
  for policy_file in "${ILM_DIR}"/*.json; do
    [[ -f "$policy_file" ]] || continue
    policy_name="$(basename "${policy_file}" .json)"
    echo "  PUT _ilm/policy/${policy_name}"
    es_curl PUT "/_ilm/policy/${policy_name}" --data-binary "@${policy_file}" > /dev/null
  done
  echo "  Done."
else
  echo "--- ILM policies: directory not found, skipping ---"
fi

echo ""

# ---------------------------------------------------------------------------
# 2. Index templates
# ---------------------------------------------------------------------------

TEMPLATES_DIR="${SCRIPT_DIR}/setup/index_templates"
if [[ -d "$TEMPLATES_DIR" ]]; then
  echo "--- Deploying index templates ---"
  for tmpl_file in "${TEMPLATES_DIR}"/*.json; do
    [[ -f "$tmpl_file" ]] || continue
    tmpl_name="$(basename "${tmpl_file}" .json)"
    echo "  PUT _index_template/${tmpl_name}"
    es_curl PUT "/_index_template/${tmpl_name}" --data-binary "@${tmpl_file}" > /dev/null
  done
  echo "  Done."
else
  echo "--- Index templates: directory not found, skipping ---"
fi

echo ""

# ---------------------------------------------------------------------------
# 3. Create regular indices (not data streams) that need to exist upfront.
#
#    Data-stream templates carry a top-level "data_stream": {} key — their
#    backing indices auto-create on the first document write.  Regular
#    index templates (attack-commands, difficulty-state, dead-letter) do NOT,
#    so we create the physical index here.
# ---------------------------------------------------------------------------

if [[ -d "$TEMPLATES_DIR" ]]; then
  echo "--- Creating regular (non-data-stream) indices ---"
  for tmpl_file in "${TEMPLATES_DIR}"/*.json; do
    [[ -f "$tmpl_file" ]] || continue

    # Check whether the template declares a data stream
    is_ds=$(python3 -c "
import json, sys
with open('${tmpl_file}') as f:
    d = json.load(f)
print('yes' if 'data_stream' in d else 'no')
")

    if [[ "$is_ds" == "no" ]]; then
      # Derive index name from the first element of index_patterns
      index_name=$(python3 -c "
import json, sys
with open('${tmpl_file}') as f:
    d = json.load(f)
print(d['index_patterns'][0])
")
      echo "  PUT /${index_name}"
      # 400 = index already exists — treat as success
      http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -u "${ES_USER}:${ES_PASS}" \
        -X PUT \
        -H "Content-Type: application/json" \
        "${ES_URL}/${index_name}")
      if [[ "$http_code" == "200" || "$http_code" == "400" ]]; then
        echo "    -> ${http_code} (ok)"
      else
        echo "    ERROR: HTTP ${http_code} when creating ${index_name}" >&2
        exit 1
      fi
    fi
  done
  echo "  Done."
fi

echo ""

# ---------------------------------------------------------------------------
# 4. Seed data
# ---------------------------------------------------------------------------

SEED_DIR="${SCRIPT_DIR}/setup/seed_data"
if [[ -d "$SEED_DIR" ]]; then
  echo "--- Seeding data ---"
  for seed_file in "${SEED_DIR}"/*.json; do
    [[ -f "$seed_file" ]] || continue
    echo "  Seeding from $(basename "${seed_file}")"

    # Parse index and body out of the seed file
    seed_index=$(python3 -c "
import json, sys
with open('${seed_file}') as f:
    d = json.load(f)
print(d['index'])
")
    seed_body=$(python3 -c "
import json, sys
with open('${seed_file}') as f:
    d = json.load(f)
print(json.dumps(d['body']))
")

    echo "  POST /${seed_index}/_doc"
    es_curl POST "/${seed_index}/_doc" --data "${seed_body}" > /dev/null
  done
  echo "  Done."
else
  echo "--- Seed data: directory not found, skipping ---"
fi

echo ""

# ---------------------------------------------------------------------------
# 5. Agent Builder agents
# ---------------------------------------------------------------------------

AGENTS_DIR="${SCRIPT_DIR}/agents"
if [[ -d "$AGENTS_DIR" ]]; then
  echo "--- Deploying Agent Builder agents ---"
  agent_count=0
  for agent_file in "${AGENTS_DIR}"/*.json; do
    [[ -f "$agent_file" ]] || continue
    agent_id="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['id'])" "${agent_file}")"
    echo "  Agent: ${agent_id} ($(basename "${agent_file}"))"
    # Create agent; if it already exists (400), update it via PUT (strip id from body)
    if ! kbn_curl POST "/api/agent_builder/agents" --data-binary "@${agent_file}" > /dev/null 2>&1; then
      # Agent likely exists — update via PUT with id removed from body
      body_no_id="$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); d.pop('id',None); print(json.dumps(d))" "${agent_file}")"
      kbn_curl PUT "/api/agent_builder/agents/${agent_id}" --data "$body_no_id" > /dev/null 2>&1 || echo "    (warning: could not create or update ${agent_id})"
    fi
    agent_count=$(( agent_count + 1 ))
  done
  if [[ $agent_count -eq 0 ]]; then
    echo "  No agent files found."
  else
    echo "  Done (${agent_count} agent(s))."
  fi
else
  echo "--- Agents: directory not found, skipping ---"
fi

echo ""

# ---------------------------------------------------------------------------
# 6. Workflows
# ---------------------------------------------------------------------------

WORKFLOWS_DIR="${SCRIPT_DIR}/workflows"
if [[ -d "$WORKFLOWS_DIR" ]]; then
  echo "--- Deploying workflows ---"
  workflow_files=()
  for wf_file in "${WORKFLOWS_DIR}"/*.yaml "${WORKFLOWS_DIR}"/*.yml; do
    [[ -f "$wf_file" ]] && workflow_files+=("$wf_file")
  done

  if [[ ${#workflow_files[@]} -eq 0 ]]; then
    echo "  No workflow files found."
  else
    # Build JSON payload: {"workflows": [{"yaml": "..."}, ...]}
    payload=$(python3 - "${workflow_files[@]}" <<'PYEOF'
import json, sys

files = sys.argv[1:]
workflows = []
for path in files:
    with open(path) as f:
        workflows.append({"yaml": f.read()})

print(json.dumps({"workflows": workflows}))
PYEOF
)
    echo "  POST /api/workflows?overwrite=true (${#workflow_files[@]} workflow(s))"
    if kbn_curl_versioned POST "/api/workflows?overwrite=true" --data "${payload}" > /dev/null 2>&1; then
      echo "  Done."
    else
      echo "  Warning: bulk workflow create failed (API may not be available in this Kibana build)."
      echo "  Workflows can be created manually via Kibana UI: Management > Workflows."
    fi
  fi
else
  echo "--- Workflows: directory not found, skipping ---"
fi

echo ""

# ---------------------------------------------------------------------------
# 7. Dashboards + data views (saved objects)
# ---------------------------------------------------------------------------

deploy_saved_objects() {
  local label="$1"
  local dir="$2"
  local glob_pattern="$3"

  if [[ ! -d "$dir" ]]; then
    echo "--- ${label}: directory not found, skipping ---"
    return 0
  fi

  echo "--- Deploying ${label} ---"
  local count=0
  for ndjson_file in "${dir}"/${glob_pattern}; do
    [[ -f "$ndjson_file" ]] || continue
    echo "  POST /api/saved_objects/_import?overwrite=true ($(basename "${ndjson_file}"))"
    # Saved objects import uses multipart form — override Content-Type
    curl -sf -u "${ES_USER}:${ES_PASS}" \
      -X POST \
      -H "kbn-xsrf: true" \
      "${KIBANA_URL}/api/saved_objects/_import?overwrite=true" \
      --form "file=@${ndjson_file};type=application/ndjson" > /dev/null
    count=$(( count + 1 ))
  done

  if [[ $count -eq 0 ]]; then
    echo "  No files found."
  else
    echo "  Done (${count} file(s))."
  fi
}

deploy_saved_objects "Dashboards"  "${SCRIPT_DIR}/setup/dashboards"  "*.ndjson"
echo ""
deploy_saved_objects "Data views"  "${SCRIPT_DIR}/setup/data_views"  "*.ndjson"

echo ""

# ---------------------------------------------------------------------------
# 8. Detection rules
# ---------------------------------------------------------------------------

RULES_FILE="${SCRIPT_DIR}/detection_rules/rules.ndjson"
if [[ -f "$RULES_FILE" ]]; then
  echo "--- Deploying detection rules ---"
  echo "  POST /api/detection_engine/rules/_import?overwrite=true"
  curl -sf -u "${ES_USER}:${ES_PASS}" \
    -X POST \
    -H "kbn-xsrf: true" \
    "${KIBANA_URL}/api/detection_engine/rules/_import?overwrite=true" \
    --form "file=@${RULES_FILE};type=application/ndjson" > /dev/null
  echo "  Done."
else
  echo "--- Detection rules: file not found, skipping ---"
fi

echo ""
echo "=== SOC Simulation Setup Complete ==="

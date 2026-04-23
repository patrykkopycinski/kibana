#!/usr/bin/env bash
# soc-simulation/teardown.sh
# Remove SOC simulation artifacts from a Kibana/ES instance.
#
# Default: delete EVERYTHING (data streams + indices + index templates + ILM
# policies + agents + skills + workflows). Pass one of the --only flags to
# restrict scope — useful when you only need to re-deploy part of the stack
# without nuking expensive-to-rebuild state.
#
# Usage:
#   ./teardown.sh --confirm [--env <env-file>] [--indices-only|--workflows-only|--agents-only|--skills-only|--templates-only|--ilm-only]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
CONFIRMED=false
SCOPE="all"

usage() {
  cat <<EOF
Usage: ./teardown.sh --confirm [options]

Options:
  --confirm              Required. Teardown refuses to run without it.
  --env <env-file>       Path to env file (default: soc-simulation/.env)

Scope (mutually exclusive; default is --all):
  --all                  Delete everything (default)
  --indices-only         Only delete data streams + regular indices
  --workflows-only       Only delete SOC workflows
  --agents-only          Only delete Agent Builder agents
  --skills-only          Only delete Agent Builder skills
  --templates-only       Only delete index templates
  --ilm-only             Only delete ILM policies
EOF
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --confirm) CONFIRMED=true; shift ;;
    --env) ENV_FILE="$2"; shift 2 ;;
    --all) SCOPE="all"; shift ;;
    --indices-only) SCOPE="indices"; shift ;;
    --workflows-only) SCOPE="workflows"; shift ;;
    --agents-only) SCOPE="agents"; shift ;;
    --skills-only) SCOPE="skills"; shift ;;
    --templates-only) SCOPE="templates"; shift ;;
    --ilm-only) SCOPE="ilm"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
done

if [[ "$CONFIRMED" != "true" ]]; then
  usage
  echo ""
  echo "Refusing to run without --confirm."
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
    -H "Elastic-Api-Version: 2023-10-31" \
    "$@"
}

# scope_active <scope_name> -> 0 if active, 1 if not
scope_active() {
  local want="$1"
  [[ "$SCOPE" == "all" || "$SCOPE" == "$want" ]]
}

echo "=== SOC Simulation Teardown (scope: ${SCOPE}) ==="
echo "Elasticsearch: ${ES_HOST}"
echo "Kibana:        ${KIBANA_HOST}"
echo ""

# ---------------------------------------------------------------------------
# Indices + data streams
# ---------------------------------------------------------------------------
if scope_active "indices"; then
  echo "--- Deleting data streams ---"
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
    ".soc-argus-eval-runs"
    ".soc-detection-eval-runs"
    ".soc-reasoning-eval-runs"
    ".soc-rule-backtester-runs"
  )
  for ds in "${DATA_STREAMS[@]}"; do
    echo "  Deleting data stream: ${ds}"
    es_curl -X DELETE "${ES_HOST}/_data_stream/${ds}" || true
  done

  echo ""
  echo "--- Deleting regular indices ---"
  REGULAR_INDICES=(
    ".soc-attack-commands"
    ".soc-difficulty-state"
    ".soc-dead-letter"
  )
  for idx in "${REGULAR_INDICES[@]}"; do
    echo "  Deleting index: ${idx}"
    es_curl -X DELETE "${ES_HOST}/${idx}" || true
  done
  echo ""
fi

# ---------------------------------------------------------------------------
# Index templates
# ---------------------------------------------------------------------------
if scope_active "templates"; then
  echo "--- Deleting index templates ---"
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
  echo ""
fi

# ---------------------------------------------------------------------------
# ILM policies
# ---------------------------------------------------------------------------
if scope_active "ilm"; then
  echo "--- Deleting ILM policies ---"
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
  echo ""
fi

# ---------------------------------------------------------------------------
# Agent Builder agents
# ---------------------------------------------------------------------------
if scope_active "agents"; then
  echo "--- Deleting Agent Builder agents ---"
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
  echo ""
fi

# ---------------------------------------------------------------------------
# Agent Builder skills
# ---------------------------------------------------------------------------
if scope_active "skills"; then
  echo "--- Deleting Agent Builder skills ---"
  SKILLS_DIR="${SCRIPT_DIR}/skills"

  if [[ -d "$SKILLS_DIR" ]]; then
    for skill_file in "${SKILLS_DIR}"/*.json; do
      [[ -f "$skill_file" ]] || continue
      skill_id="$(python3 -c "import json,sys; d=json.load(open('${skill_file}')); print(d.get('id',''))" 2>/dev/null || true)"
      if [[ -n "$skill_id" ]]; then
        echo "  Deleting skill: ${skill_id}"
        kb_curl -X DELETE "${KIBANA_HOST}/api/agent_builder/skills/${skill_id}" || true
      else
        echo "  Warning: could not parse id from $(basename "${skill_file}")"
      fi
    done
  else
    echo "  No skills directory found at ${SKILLS_DIR} — skipping"
  fi
  echo ""
fi

# ---------------------------------------------------------------------------
# Workflows
# ---------------------------------------------------------------------------
if scope_active "workflows"; then
  echo "--- Deleting SOC workflows ---"

  workflows_response=$(kb_curl "${KIBANA_HOST}/api/workflows" 2>/dev/null || echo "")

  if [[ -n "$workflows_response" ]]; then
    soc_workflow_ids=$(echo "$workflows_response" | python3 -c "
import json, sys
data = json.load(sys.stdin)
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
  echo ""
fi

echo "=== Teardown complete (scope: ${SCOPE}) ==="

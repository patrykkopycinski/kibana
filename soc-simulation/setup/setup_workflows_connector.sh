#!/usr/bin/env bash
#
# Documentation-oriented setup: create a Kibana connector for the Workflows action
# type (`.workflows`) and wire it to run `soc-alert-sweeper` when detection rules fire.
#
# Prerequisites:
#   - curl, jq
#   - Kibana reachable at KIBANA_URL (default: http://localhost:${KIBANA_PORT:-15601})
#   - Credentials with rights to create connectors and update detection rules
#
# Usage:
#   export KIBANA_URL="https://my-kibana:5601"
#   export KIBANA_AUTH="elastic:changeme"   # or use curl --cacert / -u
#   ./soc-simulation/setup/setup_workflows_connector.sh
#
set -euo pipefail

KIBANA_URL="${KIBANA_URL:-http://localhost:${KIBANA_PORT:-15601}}"
CONNECTOR_NAME="${WORKFLOWS_CONNECTOR_NAME:-ARGUS SOC — Workflows}"
TARGET_WORKFLOW_ID="${WORKFLOWS_TARGET_ID:-soc-alert-sweeper}"

hdr_auth=()
if [[ -n "${KIBANA_AUTH:-}" ]]; then
  hdr_auth=(-u "${KIBANA_AUTH}")
fi

common_curl=(
  curl -sS "${hdr_auth[@]}"
  -H "kbn-xsrf: true"
  -H "Content-Type: application/json"
)

echo "==> Creating .workflows connector (idempotent: use a new name if this fails)"
create_body="$(jq -nc \
  --arg name "${CONNECTOR_NAME}" \
  '{name: $name, connector_type_id: ".workflows", config: {}, secrets: {}}')"

create_resp="$("${common_curl[@]}" -X POST "${KIBANA_URL}/api/actions/connector" -d "${create_body}")"
connector_id="$(echo "${create_resp}" | jq -r '.id // empty')"

if [[ -z "${connector_id}" || "${connector_id}" == "null" ]]; then
  echo "Connector create response:" >&2
  echo "${create_resp}" | jq . >&2 || echo "${create_resp}" >&2
  exit 1
fi

echo "    connector id: ${connector_id}"

echo "==> Example action params for a detection rule (run soc-alert-sweeper)"
jq -nc \
  --arg wf "${TARGET_WORKFLOW_ID}" \
  '{
    subAction: "run",
    subActionParams: {
      workflowId: $wf,
      summaryMode: true,
      alertStates: { new: true, ongoing: true, recovered: false }
    }
  }' | tee /dev/stderr >/dev/null

echo
echo "Attach the above JSON as the action configuration on your rule, using connector id: ${connector_id}"
echo "Rule updates typically use:"
echo "  PUT ${KIBANA_URL}/api/detection_engine/rules/<rule_id>"
echo "with the rule payload's actions[] array including group, id, params, action_type_id, uuid, frequency, etc."
echo "See: soc-simulation/docs/argus/workflows-connector-setup.md"

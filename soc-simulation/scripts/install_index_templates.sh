#!/usr/bin/env bash
#
# Install composable Elasticsearch index templates for Argus `.soc-*` indices.
# Idempotent: uses PUT /_index_template/<name> (re-run safe).
#
# Usage:
#   soc-simulation/scripts/install_index_templates.sh
#
# Env:
#   ES_URL  (default http://localhost:9200)
#   ES_AUTH (default elastic:changeme)

set -euo pipefail

ES_URL="${ES_URL:-http://localhost:9200}"
ES_AUTH="${ES_AUTH:-elastic:changeme}"

CURL_PUT=(
  curl -sS -f
  -u "${ES_AUTH}"
  -H 'Content-Type: application/json'
  -H 'Connection: close'
  --max-time 60
  -X PUT
)

CURL_GET=(
  curl -sS
  -u "${ES_AUTH}"
  -H 'Connection: close'
  --max-time 60
)

# Assemble composable index template JSON: $1 = index pattern, $2 = properties object JSON
template_body() {
  local pattern="$1"
  local props="$2"
  cat <<EOF
{
  "index_patterns": ["${pattern}"],
  "priority": 100,
  "template": {
    "mappings": {
      "dynamic_templates": [
        {
          "strings_as_keyword_with_text": {
            "match_mapping_type": "string",
            "mapping": {
              "type": "keyword",
              "ignore_above": 2048,
              "fields": {
                "text": { "type": "text" }
              }
            }
          }
        }
      ],
      "properties": ${props}
    }
  }
}
EOF
}

put_template() {
  local name="$1"
  local pattern="$2"
  local props
  props="$(cat)"
  echo "[install_index_templates] PUT _index_template/${name} (pattern ${pattern})"
  "${CURL_PUT[@]}" "${ES_URL}/_index_template/${name}" -d "$(template_body "${pattern}" "${props}")"
  echo
}

echo "[install_index_templates] ES: ${ES_URL}"

put_template soc_argus_recommendations '.soc-recommendations*' <<'PROPS'
{
  "@timestamp": { "type": "date" },
  "status": { "type": "keyword" },
  "type": { "type": "keyword" },
  "source": { "type": "keyword" },
  "track": { "type": "keyword" },
  "trust_gate_decision": { "type": "keyword" },
  "shadow_gate": { "type": "keyword" },
  "shadow_gate_reason": { "type": "keyword" },
  "rec_id": { "type": "keyword" },
  "schema_version": { "type": "integer" },
  "confidence": { "type": "float" },
  "housekeeping": { "type": "boolean" }
}
PROPS

put_template soc_argus_audit_trail '.soc-audit-trail*' <<'PROPS'
{
  "@timestamp": { "type": "date" },
  "event_type": { "type": "keyword" },
  "source": { "type": "keyword" },
  "reason": { "type": "keyword" }
}
PROPS

put_template soc_argus_autonomy_decisions '.soc-autonomy-decisions*' <<'PROPS'
{
  "@timestamp": { "type": "date" },
  "final_status": { "type": "keyword" },
  "action": { "type": "keyword" },
  "source_workflow": { "type": "keyword" },
  "source_agent": { "type": "keyword" },
  "rec_id": { "type": "keyword" },
  "artifact_type": { "type": "keyword" },
  "artifact_id": { "type": "keyword" },
  "op": { "type": "keyword" },
  "auto_applied": { "type": "boolean" },
  "required_human": { "type": "boolean" }
}
PROPS

put_template soc_argus_evolution_log '.soc-evolution-log*' <<'PROPS'
{
  "@timestamp": { "type": "date" },
  "source": { "type": "keyword" },
  "result": { "type": "keyword" },
  "event_type": { "type": "keyword" },
  "artifact_id": { "type": "keyword" },
  "artifact_type": { "type": "keyword" }
}
PROPS

put_template soc_argus_dead_letter '.soc-dead-letter*' <<'PROPS'
{
  "@timestamp": { "type": "date" },
  "source": { "type": "keyword" },
  "reason": { "type": "keyword" },
  "rec_id": { "type": "keyword" },
  "error": {
    "type": "text",
    "fields": {
      "keyword": { "type": "keyword", "ignore_above": 2048 }
    }
  }
}
PROPS

put_template soc_argus_backtests '.soc-backtests*' <<'PROPS'
{
  "@timestamp": { "type": "date" },
  "verdict": { "type": "keyword" },
  "action": { "type": "keyword" },
  "rec_id": { "type": "keyword" },
  "rule_id": { "type": "keyword" },
  "simulator_used": { "type": "keyword" }
}
PROPS

put_template soc_argus_outcomes '.soc-outcomes*' <<'PROPS'
{
  "@timestamp": { "type": "date" },
  "disposition": { "type": "keyword" },
  "pipeline": { "type": "keyword" },
  "stage": { "type": "keyword" },
  "actor_id": { "type": "keyword" },
  "rec_id": { "type": "keyword" }
}
PROPS

put_template soc_argus_trust_scores '.soc-trust-scores*' <<'PROPS'
{
  "@timestamp": { "type": "date" },
  "agent_id": { "type": "keyword" },
  "tier": { "type": "keyword" }
}
PROPS

put_template soc_argus_reasoning_trace '.soc-reasoning-trace*' <<'PROPS'
{
  "@timestamp": { "type": "date" },
  "agent_id": { "type": "keyword" },
  "run_id": { "type": "keyword" },
  "step_type": { "type": "keyword" }
}
PROPS

put_template soc_argus_decision_graph '.soc-decision-graph*' <<'PROPS'
{
  "@timestamp": { "type": "date" },
  "from_kind": { "type": "keyword" },
  "from_type": { "type": "keyword" },
  "to_kind": { "type": "keyword" },
  "to_type": { "type": "keyword" },
  "from_id": { "type": "keyword" },
  "to_id": { "type": "keyword" },
  "relation": { "type": "keyword" },
  "edge_label": { "type": "keyword" },
  "source": { "type": "keyword" }
}
PROPS

put_template soc_argus_coverage_gaps '.soc-coverage-gaps*' <<'PROPS'
{
  "@timestamp": { "type": "date" },
  "technique_id": { "type": "keyword" },
  "tactic_id": { "type": "keyword" }
}
PROPS

put_template soc_argus_kill_switch '.soc-kill-switch*' <<'PROPS'
{
  "@timestamp": { "type": "date" },
  "scope": { "type": "keyword" },
  "autonomy_enabled": { "type": "boolean" }
}
PROPS

put_template soc_argus_artifact_registry '.soc-artifact-registry*' <<'PROPS'
{
  "@timestamp": { "type": "date" },
  "artifact_id": { "type": "keyword" },
  "type": { "type": "keyword" },
  "owner": { "type": "keyword" }
}
PROPS

echo "[install_index_templates] Verification — installed soc_argus_* templates:"
VERIFY_LIST="soc_argus_recommendations,soc_argus_audit_trail,soc_argus_autonomy_decisions,soc_argus_evolution_log,soc_argus_dead_letter,soc_argus_backtests,soc_argus_outcomes,soc_argus_trust_scores,soc_argus_reasoning_trace,soc_argus_decision_graph,soc_argus_coverage_gaps,soc_argus_kill_switch,soc_argus_artifact_registry"
"${CURL_GET[@]}" "${ES_URL}/_index_template/${VERIFY_LIST}?pretty"
echo

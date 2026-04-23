#!/usr/bin/env bash
# Creates ML anomaly detection jobs for ARGUS security monitoring.
# Aligns with soc-simulation/setup.sh env: ES_URL, ES_USER, ES_PASS.

set -euo pipefail

KIBANA_URL="${KIBANA_URL:-http://localhost:${KIBANA_PORT:-15601}}"
ES_URL="${ES_URL:-http://localhost:${ES_PORT:-19200}}"
ES_USER="${ES_USER:-elastic}"
ES_PASS="${ES_PASS:-${ELASTIC_PASSWORD:-changeme}}"

es_put() {
  local path="$1"
  shift
  curl -sS -u "${ES_USER}:${ES_PASS}" \
    -X PUT \
    -H "Content-Type: application/json" \
    "${ES_URL}${path}" \
    "$@"
}

echo "Creating ML anomaly detectors against ${ES_URL} ..."

# Job 1: Alert volume anomaly detection
es_put "/_ml/anomaly_detectors/argus-alert-volume" \
  -d '{
    "description": "ARGUS: Detect anomalous alert volume patterns",
    "analysis_config": {
      "bucket_span": "15m",
      "detectors": [
        {
          "function": "count",
          "partition_field_name": "kibana.alert.rule.name"
        }
      ],
      "influencers": ["kibana.alert.rule.name", "host.name", "user.name"]
    },
    "data_description": {
      "time_field": "@timestamp"
    },
    "datafeed_config": {
      "indices": [".alerts-security.alerts-*"],
      "query": {"match_all": {}}
    }
  }'

# Job 2: Entity behavior anomaly detection
es_put "/_ml/anomaly_detectors/argus-entity-behavior" \
  -d '{
    "description": "ARGUS: Detect anomalous entity behaviors",
    "analysis_config": {
      "bucket_span": "1h",
      "detectors": [
        {
          "function": "rare",
          "by_field_name": "process.name",
          "partition_field_name": "host.name"
        },
        {
          "function": "rare",
          "by_field_name": "source.ip",
          "partition_field_name": "user.name"
        }
      ],
      "influencers": ["host.name", "user.name", "process.name", "source.ip"]
    },
    "data_description": {
      "time_field": "@timestamp"
    },
    "datafeed_config": {
      "indices": ["logs-*", ".ds-logs-*"],
      "query": {"match_all": {}}
    }
  }'

echo "ML anomaly jobs created."
echo "Start datafeeds with:"
echo "  curl -u \"\${ES_USER}:\${ES_PASS}\" -X POST \"\${ES_URL}/_ml/datafeeds/datafeed-argus-alert-volume/_start\""
echo "  curl -u \"\${ES_USER}:\${ES_PASS}\" -X POST \"\${ES_URL}/_ml/datafeeds/datafeed-argus-entity-behavior/_start\""
echo "(Kibana URL for reference: ${KIBANA_URL})"

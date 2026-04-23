#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Provision the Argus Operations Overview dashboard (+ unified data view) into
# a running Kibana, idempotently, from the checked-in NDJSON bundle.
#
# The NDJSON under soc-simulation/dashboards/ is the source of truth and was
# produced by soc-simulation/scripts/_build_argus_dashboard.py. This shell
# script only imports it.
#
# Usage:
#   ./soc-simulation/scripts/provision_argus_dashboards.sh
#   KBN_BASE=http://localhost:15601 KBN_AUTH=elastic:changeme ./provision_argus_dashboards.sh
# -----------------------------------------------------------------------------
set -euo pipefail

KBN_BASE="${KBN_BASE:-http://localhost:15601}"
KBN_AUTH="${KBN_AUTH:-elastic:changeme}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
bundle="${repo_root}/soc-simulation/dashboards/argus_operations_overview.ndjson"

if [[ ! -f "${bundle}" ]]; then
  echo "ERROR: dashboard bundle not found at ${bundle}" >&2
  exit 1
fi

# Pre-flight: make sure Kibana is reachable.
if ! curl -fsS -u "${KBN_AUTH}" -o /dev/null "${KBN_BASE}/api/status"; then
  echo "ERROR: Kibana at ${KBN_BASE} is not responding (auth=${KBN_AUTH%%:*}:…)" >&2
  exit 1
fi

# Step 1: ensure the unified `.soc-*` data view exists. The TSVB-based
# dashboard itself does not depend on this data view (it queries the index
# pattern directly), but the Argus Console header's "Audit in Discover"
# deep-link navigates to it. Creating the DV here keeps the deep-link
# working even on a clean Kibana.
echo "ensuring unified data view argus-all-soc-dv"
curl -fsS -u "${KBN_AUTH}" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -X POST "${KBN_BASE}/api/data_views/data_view" \
  -d '{
    "data_view": {
      "id": "argus-all-soc-dv",
      "name": "Argus — All SOC data",
      "title": ".soc-*,.ds-.soc-*-*",
      "timeFieldName": "@timestamp",
      "allowNoIndex": true
    },
    "override": true
  }' > /dev/null

echo "importing $(wc -l <"${bundle}" | tr -d ' ') saved objects from:"
echo "  ${bundle}"
echo "into ${KBN_BASE}"

# `overwrite=true` makes this idempotent — re-running updates existing objects
# instead of erroring out.
response="$(
  curl -fsS -u "${KBN_AUTH}" \
    -H "kbn-xsrf: true" \
    -X POST "${KBN_BASE}/api/saved_objects/_import?overwrite=true" \
    --form file=@"${bundle}"
)"

# The import API always returns 200 — we have to parse JSON to see if it
# actually succeeded.
success=$(printf '%s' "${response}" | sed -nE 's/.*"success":(true|false).*/\1/p')
success_count=$(printf '%s' "${response}" | sed -nE 's/.*"successCount":([0-9]+).*/\1/p')

if [[ "${success}" != "true" ]]; then
  echo "ERROR: import reported failure:" >&2
  echo "${response}" >&2
  exit 2
fi

echo "imported ${success_count:-?} objects successfully"
echo
echo "Dashboard:"
echo "  ${KBN_BASE}/app/dashboards#/view/argus-operations-overview"
echo
echo "Discover (unified .soc-* view):"
echo "  ${KBN_BASE}/app/discover#/?_g=(time:(from:now-24h,to:now))&_a=(index:'argus-all-soc-dv')"

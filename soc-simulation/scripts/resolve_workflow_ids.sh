#!/usr/bin/env bash
# soc-simulation/scripts/resolve_workflow_ids.sh
#
# After workflows are bulk-imported into Kibana (POST /api/workflows), the
# Workflows Management plugin assigns each workflow a random saved-object id
# of the form `workflow-<uuid>`. That id is what the Workflows Management
# detail page expects at `/app/workflows/<id>` — the slug we use everywhere
# else in soc-simulation (e.g. `soc-argus-exploit-to-detection`) is NOT a
# valid saved-object id and 404s the detail page.
#
# This resolver closes the gap:
#   1. Walk every `soc-*.yaml` under soc-simulation/workflows/.
#   2. Extract the top-level `name:` field (the workflow's human display
#      name).
#   3. Page through Kibana's `/api/workflows` list and build a map from
#      `yaml.name` (parsed from each workflow's stored yaml source) to the
#      Kibana saved-object id. We parse the yaml text instead of using the
#      saved-object `name` field because Workflows Management doesn't
#      always populate `name` from the yaml on import (it can land as
#      "Untitled workflow" for otherwise-valid yaml), so the saved-object
#      `name` is unreliable for matching.
#   4. Upsert the matching id into the corresponding `.soc-workflow-registry`
#      doc under `kibana_workflow_id`.
#
# The ARGUS Playbooks tab server route surfaces `kibana_workflow_id` on
# every playbook entry; the page wrapper uses it to deep-link to
# `/app/workflows/<kibana_workflow_id>` instead of the slug.
#
# Idempotent: re-runs overwrite the field in place with the current match.
# Fails soft on individual slugs (prints [miss]) so one unmapped workflow
# can't break the whole demo.
#
# Usage:
#   bash soc-simulation/scripts/resolve_workflow_ids.sh
#
# Honours the same env conventions as setup.sh / reseed_workflow_registry.sh:
#   ES_URL   default http://localhost:${ES_PORT:-19200}
#   KBN_URL  default http://localhost:${KBN_PORT:-15601}
#   ES_USER  default elastic
#   ES_PASS  default ${ELASTIC_PASSWORD:-changeme}

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOC_SIM_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKFLOWS_DIR="${SOC_SIM_DIR}/workflows"

ES_URL="${ES_URL:-http://localhost:${ES_PORT:-19200}}"
KBN_URL="${KBN_URL:-http://localhost:${KBN_PORT:-15601}}"
ES_USER="${ES_USER:-elastic}"
ES_PASS="${ES_PASS:-${ELASTIC_PASSWORD:-changeme}}"
AUTH="${ES_USER}:${ES_PASS}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required" >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required" >&2
  exit 1
fi
if [[ ! -d "${WORKFLOWS_DIR}" ]]; then
  echo "ERROR: workflows dir not found at ${WORKFLOWS_DIR}" >&2
  exit 1
fi

echo "=== Resolving Kibana workflow ids into .soc-workflow-registry ==="
echo "ES:         ${ES_URL}"
echo "Kibana:     ${KBN_URL}"
echo "Workflows:  ${WORKFLOWS_DIR}"
echo ""

# Step 1: scan `.workflows-workflows-*` directly in ES and parse the
# stored `yaml` source of every workflow, building a JSON map of
# { yaml_name: kibana_id } on disk. We scan ES (not Kibana's
# `/api/workflows` list) because the list API filters by the current
# user's space/permissions and can miss workflows that exist in storage —
# `.workflows-workflows-*` is the authoritative set. The stored yaml is
# not indexed for search, so we pull `_source.yaml` and parse it here.
map_file=$(mktemp)
trap 'rm -f "${map_file}"' EXIT

python3 - "${ES_URL}" "${ES_USER}" "${ES_PASS}" "${map_file}" <<'PYEOF'
import base64
import json
import re
import sys
import urllib.request
import urllib.error

es_url, user, password, out_path = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
auth = base64.b64encode(f"{user}:{password}".encode()).decode()
headers = {
    "Authorization": f"Basic {auth}",
    "Content-Type": "application/json",
}

def es_post(path, body):
    url = f"{es_url}{path}"
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        print(f"ERROR: {exc.code} from {url}: {exc.read().decode()[:500]}", file=sys.stderr)
        sys.exit(1)

# Use search_after (not from/size) because scrolling handles >10k docs
# cleanly and stays stable across index refreshes. A sort by _doc is the
# cheapest tiebreaker Elasticsearch offers.
mapping = {}
last_updated_seen = {}
search_after = None
page_size = 500
scanned = 0
while True:
    body = {
        "size": page_size,
        "_source": ["yaml", "lastUpdatedAt"],
        "sort": [{"_doc": "asc"}],
        "query": {"match_all": {}},
    }
    if search_after is not None:
        body["search_after"] = search_after
    resp = es_post("/.workflows-workflows-*/_search", body)
    hits = resp.get("hits", {}).get("hits", [])
    if not hits:
        break
    scanned += len(hits)
    for hit in hits:
        kid = hit.get("_id")
        src = hit.get("_source", {}) or {}
        yaml_src = src.get("yaml", "") or ""
        m = re.search(r'(?m)^name:\s*(.+?)\s*$', yaml_src)
        if not m or not kid:
            continue
        val = m.group(1)
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        # On duplicate YAML names (e.g. re-imports) prefer the most
        # recently updated revision so we track the currently-served copy.
        cur_ts = src.get("lastUpdatedAt", "") or ""
        if val not in mapping or cur_ts > last_updated_seen.get(val, ""):
            mapping[val] = kid
            last_updated_seen[val] = cur_ts
    if len(hits) < page_size:
        break
    search_after = hits[-1].get("sort")

with open(out_path, "w") as f:
    json.dump(mapping, f)
print(f"Scanned {scanned} Kibana workflow docs; indexed {len(mapping)} unique yaml name→id mappings")
PYEOF

resolved=0
missing=0
skipped=0
for wf_file in "${WORKFLOWS_DIR}"/soc-*.yaml "${WORKFLOWS_DIR}"/soc-*.yml; do
  [[ -f "${wf_file}" ]] || continue
  slug="$(basename "${wf_file}")"
  slug="${slug%.yaml}"
  slug="${slug%.yml}"

  # Extract the top-level `name:` field from the on-disk YAML so we can
  # look it up in the map we built above.
  display_name="$(
    python3 - "${wf_file}" <<'PYEOF'
import re, sys
with open(sys.argv[1]) as f:
    for line in f:
        m = re.match(r'^name:\s*(.+?)\s*$', line)
        if m:
            val = m.group(1)
            if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            print(val)
            break
PYEOF
  )"

  if [[ -z "${display_name}" ]]; then
    echo "  [skip] ${slug}: no top-level name: in yaml"
    skipped=$((skipped + 1))
    continue
  fi

  kibana_id="$(python3 - "${map_file}" "${display_name}" <<'PYEOF'
import json, sys
m = json.load(open(sys.argv[1]))
print(m.get(sys.argv[2], ""))
PYEOF
  )"

  if [[ -z "${kibana_id}" ]]; then
    echo "  [miss] ${slug}: no Kibana workflow with yaml name=\"${display_name}\""
    missing=$((missing + 1))
    continue
  fi

  # Upsert `kibana_workflow_id` into the registry doc. setup.sh writes the
  # canonical doc with `_id == workflow_id`, so a partial update lands on
  # the same id deterministically. When the doc doesn't yet exist (cold
  # cluster) the upsert creates a minimal stub so we don't lose the
  # mapping — setup.sh / reseed_workflow_registry.sh fill in the rest on
  # the next run.
  update_body=$(python3 - "${slug}" "${kibana_id}" <<'PYEOF'
import json, sys
slug, kid = sys.argv[1], sys.argv[2]
print(json.dumps({
  "doc": {"kibana_workflow_id": kid},
  "upsert": {"workflow_id": slug, "kibana_workflow_id": kid}
}))
PYEOF
)
  http_code=$(curl -sS -o /dev/null -w '%{http_code}' -u "${AUTH}" \
    -H 'Content-Type: application/json' \
    -X POST "${ES_URL}/.soc-workflow-registry/_update/${slug}?refresh=wait_for" \
    --data-binary "${update_body}")

  if [[ "${http_code}" != "200" && "${http_code}" != "201" ]]; then
    echo "  [warn] ${slug}: registry update returned HTTP ${http_code}"
    continue
  fi
  echo "  [ ok ] ${slug}  →  ${kibana_id}"
  resolved=$((resolved + 1))
done

echo ""
echo "Resolved: ${resolved}   Missing in Kibana: ${missing}   Skipped (no name): ${skipped}"

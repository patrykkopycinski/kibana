#!/usr/bin/env bash
# soc-simulation/setup.sh
# Deploy all SOC simulation artifacts to a Kibana/ES instance.
# Usage: ./setup.sh [--env <env-file>]
#
# Idempotent — safe to re-run. Existing resources are overwritten.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

# ARGUS-specific toggles. Default is "seed-all advisories, do NOT nuke
# pre-existing recommendations" — the safe demo reset story. Operators
# running a second live run who want a clean recommendation feed pass
# --reset-recommendations explicitly.
SEED_ADVISORIES="true"
RESET_RECOMMENDATIONS="false"
NO_DEMO_DATA="false"

while [[ $# -gt 0 ]]; do
  case $1 in
    --env) ENV_FILE="$2"; shift 2 ;;
    --no-seed-advisories) SEED_ADVISORIES="false"; shift ;;
    --no-demo-data) NO_DEMO_DATA="true"; SEED_ADVISORIES="false"; shift ;;
    --reset-recommendations) RESET_RECOMMENDATIONS="true"; shift ;;
    -h|--help)
      cat <<USAGE
Usage: ./setup.sh [--env <env-file>] [--no-seed-advisories] [--no-demo-data] [--reset-recommendations]

  --env <env-file>            Load ES/Kibana creds from a dotenv file (default: ./.env)
  --no-seed-advisories        Skip the ARGUS exploit-to-detection CLI seeding step.
                              By default setup runs the CLI with --seed-all so the
                              three demo advisories land in .soc-cve-advisories
                              (status=ingested) and the reconciler picks them up.
  --no-demo-data              Skip demo-only data: ARGUS variant bank bulk load, Caldera
                              profile seeding, difficulty-state seed, and exploit-to-detection
                              --seed-all (same as --no-seed-advisories for advisories).
                              Index templates, agents, skills, workflows, registry, governance
                              seeds (e.g. kill switch), and detection rules import still run.
  --reset-recommendations     Delete every document in .soc-recommendations before
                              seeding. Useful for clean-slate demos; do NOT run
                              against a shared cluster with real recs.
  -h, --help                  Show this message.
USAGE
      exit 0
      ;;
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

if [[ "${NO_DEMO_DATA}" == "true" ]]; then
  echo "--- Demo data disabled (--no-demo-data): skipping ARGUS variant bank, Caldera adversary profiles, difficulty-state seed, and exploit-to-detection advisory seed-all ---"
  echo ""
fi

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

# ---------------------------------------------------------------------------
# 0c. Initialize Fleet + create Fleet Server policy
# ---------------------------------------------------------------------------

echo -n "Initializing Fleet... "
kbn_curl POST "/api/fleet/setup" > /dev/null 2>&1 || true
echo "OK"

echo -n "Creating Fleet Server policy... "
kbn_curl POST "/api/fleet/agent_policies" \
  --data '{"id":"fleet-server-policy","name":"Fleet Server Policy","namespace":"default","is_default_fleet_server":true,"has_fleet_server":true}' \
  > /dev/null 2>&1 || true
echo "OK"

echo -n "Creating SOC Endpoint policy... "
kbn_curl POST "/api/fleet/agent_policies" \
  --data '{"id":"soc-endpoint-policy","name":"SOC Endpoint Policy","namespace":"default","monitoring_enabled":["logs","metrics"]}' \
  > /dev/null 2>&1 || true
echo "OK"

echo -n "Attaching Elastic Defend integration... "
kbn_curl POST "/api/fleet/package_policies" \
  --data '{"name":"Elastic Defend - SOC Simulation","namespace":"default","policy_id":"soc-endpoint-policy","package":{"name":"endpoint","title":"Elastic Defend","version":"9.0.2"}}' \
  > /dev/null 2>&1 || true
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
# 1b. Ingest pipelines
#
# Ingest pipelines MUST be deployed before index templates, because a template
# that declares `default_pipeline` is rejected at PUT time if the pipeline does
# not yet exist on the cluster.
# ---------------------------------------------------------------------------

PIPELINES_DIR="${SCRIPT_DIR}/setup/ingest_pipelines"
if [[ -d "$PIPELINES_DIR" ]]; then
  echo "--- Deploying ingest pipelines ---"
  for pipe_file in "${PIPELINES_DIR}"/*.json; do
    [[ -f "$pipe_file" ]] || continue
    pipe_name="$(basename "${pipe_file}" .json)"
    echo "  PUT _ingest/pipeline/${pipe_name}"
    es_curl PUT "/_ingest/pipeline/${pipe_name}" --data-binary "@${pipe_file}" > /dev/null
  done
  echo "  Done."
else
  echo "--- Ingest pipelines: directory not found, skipping ---"
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

  echo "--- Pre-creating data streams ---"
  for tmpl_file in "${TEMPLATES_DIR}"/*.json; do
    [[ -f "$tmpl_file" ]] || continue

    is_ds=$(python3 -c "
import json, sys
with open('${tmpl_file}') as f:
    d = json.load(f)
print('yes' if 'data_stream' in d else 'no')
")

    if [[ "$is_ds" == "yes" ]]; then
      ds_name=$(python3 -c "
import json, sys
with open('${tmpl_file}') as f:
    d = json.load(f)
print(d['index_patterns'][0])
")
      echo "  Seed ${ds_name}"
      curl -sf -u "${ES_USER}:${ES_PASS}" \
        -X POST "${ES_URL}/${ds_name}/_doc" \
        -H "Content-Type: application/json" \
        -d "{\"@timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"source\": \"seed\", \"message\": \"Index initialization\"}" > /dev/null 2>&1 || true
    fi
  done
  echo "  Done."
fi

echo ""

# ---------------------------------------------------------------------------
# 3b. Entity Store v2, ML jobs, Agent Builder UI flags, workflows connector note
# ---------------------------------------------------------------------------

echo "--- Enabling Entity Store v2 ---"
if kbn_curl POST "/api/security/entity_store/enable" \
  --data '{"entityTypes": ["host", "user"]}' > /dev/null 2>&1; then
  echo "  Entity Store v2 enable request accepted."
else
  echo "  WARN: Entity Store enable failed (license, privileges, or endpoint unavailable)."
fi

echo "--- ML anomaly detection jobs (ARGUS) ---"
ML_JOBS_SCRIPT="${SCRIPT_DIR}/setup/ml_anomaly_jobs.sh"
if [[ -f "$ML_JOBS_SCRIPT" ]]; then
  chmod +x "$ML_JOBS_SCRIPT" 2>/dev/null || true
  if ES_URL="${ES_URL}" ES_USER="${ES_USER}" ES_PASS="${ES_PASS}" \
      bash "$ML_JOBS_SCRIPT"; then
    echo "  ML jobs script completed."
  else
    echo "  WARN: ml_anomaly_jobs.sh failed (ML API, license, or indices missing)."
  fi
else
  echo "  ml_anomaly_jobs.sh not found, skipping."
fi

echo "--- Kibana UI: Agent Builder experimental features ---"
if kbn_curl POST "/api/kibana/settings" \
  --data '{"changes":{"agentBuilder:experimentalFeatures":true}}' > /dev/null 2>&1; then
  echo "  agentBuilder:experimentalFeatures enabled."
else
  echo "  WARN: could not set agentBuilder:experimentalFeatures (needs manage_advanced_settings)."
fi

echo "--- Security Solution experimental flags (kibana.yml) ---"
cat <<'EONOTE'
  For ARGUS Console + Entity Store v2 server routes, also set in kibana.yml and restart Kibana:
    xpack.securitySolution.enableExperimental:
      - argusConsoleEnabled
      - entityAnalyticsEntityStoreV2
  setup.sh cannot modify kibana.yml from this script.
EONOTE

echo "--- Workflows connector (alert-triggered execution) ---"
echo "  Use Stack Management > Connectors: the Workflows connector type id is '.workflows' (system)."
echo "  Detection rules and custom rules can invoke workflows on alert via this connector when licensed."

echo ""

# ---------------------------------------------------------------------------
# 4. Seed data
# ---------------------------------------------------------------------------

SEED_DIR="${SCRIPT_DIR}/setup/seed_data"
if [[ -d "$SEED_DIR" ]]; then
  echo "--- Seeding data ---"
  for seed_file in "${SEED_DIR}"/*.json; do
    [[ -f "$seed_file" ]] || continue
    seed_basename="$(basename "${seed_file}")"
    if [[ "${NO_DEMO_DATA}" == "true" && "${seed_basename}" == "difficulty-state-initial.json" ]]; then
      echo "  Skipping ${seed_basename} (--no-demo-data)"
      continue
    fi

    echo "  Seeding from ${seed_basename}"

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
    # Optional: fixed doc_id + create-if-missing semantics for idempotent seeds
    # (e.g. governance kill-switch). Default is POST with auto-id (history log).
    seed_meta=$(python3 -c "
import json
with open('${seed_file}') as f:
    d = json.load(f)
print(d.get('doc_id',''), '1' if d.get('create_if_missing') else '0')
")
    read -r seed_doc_id seed_create_only <<< "$seed_meta"

    if [[ -n "$seed_doc_id" ]]; then
      # PUT with op_type=create: idempotent — if doc already exists, 409 is fine.
      echo "  PUT /${seed_index}/_doc/${seed_doc_id}?op_type=create"
      http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -u "${ES_USER}:${ES_PASS}" \
        -X PUT \
        -H "Content-Type: application/json" \
        "${ES_URL}/${seed_index}/_doc/${seed_doc_id}?op_type=create" \
        --data "${seed_body}")
      if [[ "$http_code" == "201" || "$http_code" == "200" ]]; then
        echo "    -> ${http_code} (created)"
      elif [[ "$http_code" == "409" && "$seed_create_only" == "1" ]]; then
        echo "    -> 409 (already exists, preserved)"
      else
        echo "    WARN: HTTP ${http_code} seeding ${seed_index}/${seed_doc_id}"
      fi
    else
      echo "  POST /${seed_index}/_doc"
      es_curl POST "/${seed_index}/_doc" --data "${seed_body}" > /dev/null
    fi
  done
  echo "  Done."
else
  echo "--- Seed data: directory not found, skipping ---"
fi

echo ""

# ---------------------------------------------------------------------------
# 4b. Caldera adversary profiles
#     Read soc-simulation/caldera_profiles/*.json and upsert each as a document
#     in .soc-attack-profiles with id `level-{difficulty_level}`. The
#     soc-caldera-dispatcher workflow reads these at dispatch time to look up
#     the Caldera adversary_id for each pending attack command.
# ---------------------------------------------------------------------------

PROFILES_DIR="${SCRIPT_DIR}/caldera_profiles"
if [[ -d "$PROFILES_DIR" && "${NO_DEMO_DATA}" != "true" ]]; then
  echo "--- Seeding Caldera adversary profiles into .soc-attack-profiles ---"
  profile_count=0
  for profile_file in "${PROFILES_DIR}"/*.json; do
    [[ -f "$profile_file" ]] || continue

    profile_level=$(python3 -c "
import json, sys
with open('${profile_file}') as f:
    d = json.load(f)
print(d['difficulty_level'])
")
    profile_doc_id="level-${profile_level}"

    profile_body=$(python3 -c "
import json, sys
from datetime import datetime, timezone
with open('${profile_file}') as f:
    d = json.load(f)
d['source_file'] = '$(basename "${profile_file}")'
d['seeded_at'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
print(json.dumps(d))
")

    echo "  PUT /.soc-attack-profiles/_doc/${profile_doc_id} (from $(basename "${profile_file}"))"
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
      -u "${ES_USER}:${ES_PASS}" \
      -X PUT \
      -H "Content-Type: application/json" \
      "${ES_URL}/.soc-attack-profiles/_doc/${profile_doc_id}" \
      --data "${profile_body}")
    if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
      echo "    -> ${http_code} (ok)"
      profile_count=$(( profile_count + 1 ))
    else
      echo "    WARN: HTTP ${http_code} seeding ${profile_doc_id}"
    fi
  done
  if [[ $profile_count -eq 0 ]]; then
    echo "  No profile files found."
  else
    echo "  Done (${profile_count} profile(s))."
  fi
elif [[ -d "$PROFILES_DIR" && "${NO_DEMO_DATA}" == "true" ]]; then
  echo "--- Skipping Caldera adversary profiles (--no-demo-data) ---"
else
  echo "--- Caldera profiles: directory not found, skipping ---"
fi

echo ""

# ---------------------------------------------------------------------------
# 4c. ARGUS variant bank (M2.4)
#     Bulk-load the labelled Mythos-era corpus from
#     soc-simulation/scripts/argus-variant-bank/ into .soc-eval-corpus-<corpus_id>.
#     Each .ndjson file contains one document per line; docs carry an _argus.corpus_id
#     which determines the target index. Re-running is idempotent at the variant
#     level because we use op_type=create with _id = <primitive>-<axis>-<index>.
# ---------------------------------------------------------------------------

BANK_DIR="${SCRIPT_DIR}/scripts/argus-variant-bank"
if [[ -d "$BANK_DIR" && "${NO_DEMO_DATA}" != "true" ]]; then
  echo "--- Seeding ARGUS variant bank into .soc-eval-corpus-* ---"
  variant_count=0

  # Build a single big NDJSON bulk body across all axis files + negatives.
  bulk_body="$(python3 - "${BANK_DIR}" <<'PY'
import glob, json, os, sys
root = sys.argv[1]
out_lines = []
patterns = [
    os.path.join(root, "*", "axis-*.ndjson"),
    # ARGUS R1 — corpora organised into named subtrees
    # (e.g. attack-er7/T1190/axis-*.ndjson). Each subtree has its own
    # corpus_id stamped on every doc so they land in separate indices.
    os.path.join(root, "*", "*", "axis-*.ndjson"),
    os.path.join(root, "_negatives", "*.ndjson"),
    os.path.join(root, "*", "_negatives", "*.ndjson"),
]
for pat in patterns:
    for path in sorted(glob.glob(pat)):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                doc = json.loads(line)
                argus = doc.get("_argus", {})
                corpus_id = argus.get("corpus_id")
                primitive = argus.get("primitive_id", "unknown")
                axis = argus.get("variant_axis", "unknown")
                idx = argus.get("variant_index", 0)
                if not corpus_id:
                    continue
                target_index = f".soc-eval-corpus-{corpus_id}"
                doc_id = f"{primitive}-{axis}-{idx}"
                header = {"index": {"_index": target_index, "_id": doc_id}}
                out_lines.append(json.dumps(header))
                out_lines.append(json.dumps(doc))
print("\n".join(out_lines) + ("\n" if out_lines else ""))
PY
  )"

  variant_count=$(printf '%s\n' "$bulk_body" | grep -c '^{"index"' || true)

  if [[ $variant_count -gt 0 ]]; then
    echo "  Bulk-loading ${variant_count} variant(s)..."
    # ES bulk API requires the body to terminate with a newline. Bash command
    # substitution ($(...)) strips trailing newlines from $bulk_body, so we
    # append one explicitly here; otherwise ES returns 400.
    printf '%s\n' "$bulk_body" | curl -sf -u "${ES_USER}:${ES_PASS}" \
      -X POST \
      -H "Content-Type: application/x-ndjson" \
      "${ES_URL}/_bulk?refresh=wait_for" \
      --data-binary @- > /dev/null
    echo "  Done (${variant_count} variant(s))."
  else
    echo "  No variants found in bank."
  fi
elif [[ -d "$BANK_DIR" && "${NO_DEMO_DATA}" == "true" ]]; then
  echo "--- Skipping ARGUS variant bank (--no-demo-data) ---"
else
  echo "--- ARGUS variant bank: directory not found, skipping ---"
fi

echo ""

# ---------------------------------------------------------------------------
# 4d. ARGUS recommendation reset (opt-in via --reset-recommendations)
#     Clears pre-existing recommendations so a live demo starts from a clean
#     feed. The `.soc-recommendations` template stays in place — only the
#     documents are deleted.
# ---------------------------------------------------------------------------

if [[ "${RESET_RECOMMENDATIONS}" == "true" ]]; then
  echo "--- Resetting .soc-recommendations + .soc-cve-advisories (fresh demo state) ---"
  for idx in ".soc-recommendations" ".soc-cve-advisories" ".soc-argus-eval-runs"; do
    deleted=$(es_curl POST "/${idx}/_delete_by_query?conflicts=proceed&refresh=true" \
      --data-binary '{"query":{"match_all":{}}}' \
      2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("deleted", 0))' \
      2>/dev/null || echo 0)
    echo "  ${idx}: deleted ${deleted} doc(s)"
  done
else
  echo "--- Skipping recommendation reset (pass --reset-recommendations to enable) ---"
fi

echo ""

# ---------------------------------------------------------------------------
# 4e. ARGUS exploit-to-detection seeding (M2.2)
#     Runs the CLI with --seed-all so every ARGUS_DEMO_ADVISORIES entry lands
#     in `.soc-cve-advisories` with status=ingested + a filed recommendation
#     + a labelled corpus. The reconciler workflow promotes them on its next
#     3m tick.
# ---------------------------------------------------------------------------

if [[ "${SEED_ADVISORIES}" == "true" ]]; then
  E2D_CLI_JS="${REPO_ROOT}/x-pack/solutions/security/packages/kbn-argus-exploit-to-detection/scripts/run_exploit_to_detection.js"
  if [[ -f "${E2D_CLI_JS}" ]]; then
    echo "--- Seeding ARGUS demo advisories via exploit-to-detection CLI ---"
    if ES_URL="${ES_URL}" ES_USER="${ES_USER}" ES_PASS="${ES_PASS}" \
        node "${E2D_CLI_JS}" \
          --es-url "${ES_URL}" \
          --es-user "${ES_USER}" \
          --es-pass "${ES_PASS}" \
          --seed-all; then
      echo "  ARGUS advisories seeded successfully."
    else
      echo "  WARN: exploit-to-detection CLI failed — demo will be missing advisories."
      echo "  You can re-run manually:"
      echo "    node ${E2D_CLI_JS} --seed-all"
    fi
  else
    echo "--- ARGUS exploit-to-detection CLI not found at ${E2D_CLI_JS} ---"
    echo "    Run 'yarn kbn bootstrap' to build it, then re-run setup.sh."
  fi
else
  echo "--- Skipping ARGUS advisory seeding (--no-seed-advisories set) ---"
fi

echo ""

# ---------------------------------------------------------------------------
# 5. Skills (Agent Builder)
# ---------------------------------------------------------------------------

SKILLS_DIR="${SCRIPT_DIR}/skills"
if [[ -d "$SKILLS_DIR" ]]; then
  echo "--- Deploying Agent Builder skills ---"
  skill_count=0
  for skill_file in "${SKILLS_DIR}"/*.json; do
    [[ -f "$skill_file" ]] || continue
    skill_id="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['id'])" "${skill_file}")"
    echo "  Skill: ${skill_id} ($(basename "${skill_file}"))"
    if ! kbn_curl POST "/api/agent_builder/skills" --data-binary "@${skill_file}" > /dev/null 2>&1; then
      body_no_id="$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); d.pop('id',None); print(json.dumps(d))" "${skill_file}")"
      kbn_curl PUT "/api/agent_builder/skills/${skill_id}" --data "$body_no_id" > /dev/null 2>&1 || echo "    (warning: could not create or update ${skill_id})"
    fi
    skill_count=$(( skill_count + 1 ))
  done
  if [[ $skill_count -eq 0 ]]; then
    echo "  No skill files found."
  else
    echo "  Done (${skill_count} skill(s))."
  fi
else
  echo "--- Skills: directory not found, skipping ---"
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

  # Validate that every canonical soc-*.yaml has an entry in _registry.json.
  # This is the single source of truth for workflow metadata; drift fails setup.
  WF_REGISTRY_MANIFEST="${WORKFLOWS_DIR}/_registry.json"
  if [[ -f "$WF_REGISTRY_MANIFEST" ]]; then
    missing_entries=$(python3 - "$WF_REGISTRY_MANIFEST" "${workflow_files[@]}" <<'PYEOF'
import json, os, sys
manifest_path = sys.argv[1]
wf_paths = sys.argv[2:]
with open(manifest_path) as f:
    manifest = json.load(f)
declared = {w["workflow_id"] for w in manifest.get("workflows", [])}
seen, missing = set(), []
for p in wf_paths:
    base = os.path.basename(p)
    wid = os.path.splitext(base)[0]
    if not wid.startswith("soc-"):
        continue
    seen.add(wid)
    if wid not in declared:
        missing.append(wid)
stale = sorted(declared - seen)
if missing:
    print("MISSING_IN_MANIFEST:" + ",".join(missing))
if stale:
    print("STALE_IN_MANIFEST:" + ",".join(stale))
PYEOF
)
    if [[ -n "$missing_entries" ]]; then
      echo "  ERROR: workflow registry drift detected:" >&2
      echo "$missing_entries" >&2
      echo "  Edit soc-simulation/workflows/_registry.json to match on-disk workflow files." >&2
      exit 1
    fi
  else
    echo "  WARN: _registry.json manifest not found; skipping registry seeding." >&2
  fi

  if [[ ${#workflow_files[@]} -eq 0 ]]; then
    echo "  No workflow files found."
  else
    # Build bulk payload: {"workflows": [{"yaml": "..."}, ...]}
    payload_file=$(mktemp)
    python3 - "${workflow_files[@]}" <<'PYEOF' > "${payload_file}"
import json, sys
files = sys.argv[1:]
workflows = []
for path in files:
    with open(path) as f:
        workflows.append({"yaml": f.read()})
print(json.dumps({"workflows": workflows}))
PYEOF
    echo "  POST /api/workflows?overwrite=true (${#workflow_files[@]} workflow(s))"
    if kbn_curl_versioned POST "/api/workflows?overwrite=true" --data-binary "@${payload_file}" > /dev/null 2>&1; then
      echo "  Done (${#workflow_files[@]}/${#workflow_files[@]} workflow(s))."
    else
      echo "  Bulk create failed, trying individual..."
      wf_count=0
      for wf_file in "${workflow_files[@]}"; do
        wf_name="$(basename "${wf_file}" .yaml)"
        single_file=$(mktemp)
        python3 -c "import json,sys; json.dump({'yaml':open(sys.argv[1]).read()},open(sys.argv[2],'w'))" "${wf_file}" "${single_file}"
        if kbn_curl_versioned POST "/api/workflows?overwrite=true" --data-binary "@${single_file}" > /dev/null 2>&1; then
          echo "    Created: ${wf_name}"
          wf_count=$(( wf_count + 1 ))
        else
          echo "    Failed: ${wf_name}"
        fi
      done
      echo "  Done (${wf_count}/${#workflow_files[@]} workflow(s))."
    fi
  fi
else
  echo "--- Workflows: directory not found, skipping ---"
fi

echo ""

# ---------------------------------------------------------------------------
# 6b. Workflow registry — upsert one doc per canonical workflow from the
#     authored manifest soc-simulation/workflows/_registry.json. Stale docs
#     (workflow_id not in the manifest on this deploy) are deleted to prevent
#     the dashboard from displaying workflows that no longer exist on disk.
# ---------------------------------------------------------------------------

if [[ -f "$WF_REGISTRY_MANIFEST" ]]; then
  echo "--- Seeding .soc-workflow-registry from manifest ---"
  seed_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # Build a newline-separated list of "workflow_id\tJSON-body" tuples. We
  # deliberately avoid pushing the manifest through a single heredoc because
  # bash would mangle embedded JSON quoting.
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
        "owner":             w.get("owner", "canonical"),
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
    # Use `_update` with `doc` + `upsert` so we merge rather than replace.
    # This preserves derived fields written after setup.sh (notably
    # `kibana_workflow_id`, populated by resolve_workflow_ids.sh once the
    # Workflows Management bulk import has finished assigning saved-object
    # ids) across subsequent reseeds.
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

  # Delete any older docs that are no longer declared.
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
  echo "  Seeded ${#declared_ids[@]} workflow(s) into .soc-workflow-registry."

  # Resolve Kibana saved-object ids for the Workflows Management bulk
  # import we just ran above. This is what makes the ARGUS Playbooks
  # "Run" action deep-link to the correct /app/workflows/<id> URL instead
  # of the slug (which 404s the detail page because the Workflows app
  # keys documents by a random `workflow-<uuid>` id). Fails soft: a miss
  # just leaves `kibana_workflow_id` unset and the UI falls back to the
  # search-filtered list.
  if [[ -f "${SCRIPT_DIR}/scripts/resolve_workflow_ids.sh" ]]; then
    ES_URL="${ES_URL}" ES_USER="${ES_USER}" ES_PASS="${ES_PASS}" \
      bash "${SCRIPT_DIR}/scripts/resolve_workflow_ids.sh" || \
      echo "  WARN: resolve_workflow_ids.sh failed; Playbooks links will fall back to ?search=" >&2
  fi
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

RULES_E2E="${SCRIPT_DIR}/detection_rules/rules-e2e.ndjson"
RULES_DEMO="${SCRIPT_DIR}/detection_rules/rules-demo.ndjson"

deploy_rules_ndjson() {
  local label="$1"
  local path="$2"
  if [[ ! -f "$path" ]]; then
    echo "--- Detection rules (${label}): file not found, skipping ---"
    return 0
  fi
  echo "--- Deploying detection rules (${label}) ---"
  echo "  POST /api/detection_engine/rules/_import?overwrite=true ($(basename "${path}"))"
  curl -sf -u "${ES_USER}:${ES_PASS}" \
    -X POST \
    -H "kbn-xsrf: true" \
    "${KIBANA_URL}/api/detection_engine/rules/_import?overwrite=true" \
    --form "file=@${path};type=application/ndjson" > /dev/null
  echo "  Done."
}

deploy_rules_ndjson "e2e" "${RULES_E2E}"
if [[ "${NO_DEMO_DATA}" != "true" ]]; then
  deploy_rules_ndjson "demo" "${RULES_DEMO}"
else
  echo "--- Skipping detection rules (demo bundle) (--no-demo-data) ---"
fi

echo ""

# ---------------------------------------------------------------------------
# 9. Governance: retro-tag canonical artifacts in .soc-artifact-registry
#    Delegated to the soc-registry-retro-tag workflow, which uses kibana.request
#    + elasticsearch.index steps — no Python, no sidecars. We simply trigger it
#    once, at the tail of deploy.
# ---------------------------------------------------------------------------

echo "--- Governance: triggering soc-registry-retro-tag workflow ---"
RETRO_WF_ID="soc-registry-retro-tag"
retro_resp=$(kbn_curl_versioned POST "/api/workflows/workflow/${RETRO_WF_ID}/run" \
  -H "Content-Type: application/json" \
  --data '{"inputs":{}}' 2>/dev/null || true)
if [[ -n "$retro_resp" ]]; then
  echo "  triggered soc-registry-retro-tag (response snippet): $(echo "$retro_resp" | head -c 200)"
else
  echo "  (warning: retro-tag workflow trigger failed; rerun manually in Kibana Workflows UI)"
fi

echo ""

# ---------------------------------------------------------------------------
# 10. Verification — end-to-end pass/fail check of every created artifact.
#     This is the single source of truth that `./setup.sh` actually succeeded.
#     Prints PASS / FAIL per-check and a final summary. Non-zero exit if any
#     FAIL. Opt-out with SOC_SKIP_VERIFY=1 (useful for partial installs / CI
#     smoke tests that run verify separately).
# ---------------------------------------------------------------------------

if [[ "${SOC_SKIP_VERIFY:-0}" == "1" ]]; then
  echo "--- Verification skipped (SOC_SKIP_VERIFY=1) ---"
  echo ""
  echo "=== SOC Simulation Setup Complete ==="
  exit 0
fi

echo "--- Verifying deployed artifacts ---"

# Global counters. Using integers instead of arrays for speed and simplicity.
VERIFY_PASS=0
VERIFY_FAIL=0
VERIFY_SKIP=0
FAIL_DETAILS=()

# verify_http <label> <es|kbn> <path> [extra-header...]
# Returns 0 on PASS, 1 on FAIL. Prints one line to stdout.
verify_http() {
  local label="$1"
  local host="$2"
  local path="$3"
  shift 3

  local base
  if [[ "$host" == "kbn" ]]; then
    base="${KIBANA_URL}"
  else
    base="${ES_URL}"
  fi

  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -u "${ES_USER}:${ES_PASS}" \
    -H "kbn-xsrf: true" \
    -H "Elastic-Api-Version: 2023-10-31" \
    "${base}${path}" \
    "$@")

  if [[ "$code" == "200" ]]; then
    printf "  [PASS] %s\n" "$label"
    VERIFY_PASS=$(( VERIFY_PASS + 1 ))
    return 0
  else
    printf "  [FAIL] %s (HTTP %s at %s)\n" "$label" "$code" "${base}${path}"
    FAIL_DETAILS+=("${label} -> HTTP ${code}")
    VERIFY_FAIL=$(( VERIFY_FAIL + 1 ))
    return 1
  fi
}

# ---- Elasticsearch: index templates ---------------------------------------
if [[ -d "$TEMPLATES_DIR" ]]; then
  for tmpl_file in "${TEMPLATES_DIR}"/*.json; do
    [[ -f "$tmpl_file" ]] || continue
    tmpl_name="$(basename "${tmpl_file}" .json)"
    verify_http "index_template:${tmpl_name}" es "/_index_template/${tmpl_name}" || true
  done
fi

# ---- Elasticsearch: ILM policies ------------------------------------------
if [[ -d "$ILM_DIR" ]]; then
  for policy_file in "${ILM_DIR}"/*.json; do
    [[ -f "$policy_file" ]] || continue
    policy_name="$(basename "${policy_file}" .json)"
    verify_http "ilm_policy:${policy_name}" es "/_ilm/policy/${policy_name}" || true
  done
fi

# ---- Elasticsearch: regular (non-data-stream) indices ---------------------
if [[ -d "$TEMPLATES_DIR" ]]; then
  for tmpl_file in "${TEMPLATES_DIR}"/*.json; do
    [[ -f "$tmpl_file" ]] || continue
    is_ds=$(python3 -c "
import json
with open('${tmpl_file}') as f:
    d = json.load(f)
print('yes' if 'data_stream' in d else 'no')
")
    if [[ "$is_ds" == "no" ]]; then
      index_name=$(python3 -c "
import json
with open('${tmpl_file}') as f:
    d = json.load(f)
print(d['index_patterns'][0])
")
      verify_http "index:${index_name}" es "/${index_name}" || true
    fi
  done
fi

# ---- Elasticsearch: data streams ------------------------------------------
if [[ -d "$TEMPLATES_DIR" ]]; then
  for tmpl_file in "${TEMPLATES_DIR}"/*.json; do
    [[ -f "$tmpl_file" ]] || continue
    is_ds=$(python3 -c "
import json
with open('${tmpl_file}') as f:
    d = json.load(f)
print('yes' if 'data_stream' in d else 'no')
")
    if [[ "$is_ds" == "yes" ]]; then
      ds_name=$(python3 -c "
import json
with open('${tmpl_file}') as f:
    d = json.load(f)
print(d['index_patterns'][0])
")
      verify_http "data_stream:${ds_name}" es "/_data_stream/${ds_name}" || true
    fi
  done
fi

# ---- Kibana: workflows ----------------------------------------------------
if [[ -d "$WORKFLOWS_DIR" ]]; then
  for wf_file in "${WORKFLOWS_DIR}"/*.yaml "${WORKFLOWS_DIR}"/*.yml; do
    [[ -f "$wf_file" ]] || continue
    wf_name="$(basename "${wf_file}")"
    wf_id="${wf_name%.*}"
    [[ "$wf_id" == _* ]] && continue
    verify_http "workflow:${wf_id}" kbn "/api/workflows/${wf_id}" || true
  done
fi

# ---- Kibana: skills -------------------------------------------------------
if [[ -d "$SKILLS_DIR" ]]; then
  for skill_file in "${SKILLS_DIR}"/*.json; do
    [[ -f "$skill_file" ]] || continue
    skill_id="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['id'])" "${skill_file}")"
    verify_http "skill:${skill_id}" kbn "/api/agent_builder/skills/${skill_id}" || true
  done
fi

# ---- Elasticsearch: workflow registry row per manifest entry --------------
if [[ -f "$WF_REGISTRY_MANIFEST" ]]; then
  while IFS= read -r wf_id; do
    [[ -z "$wf_id" ]] && continue
    verify_http "workflow_registry:${wf_id}" es "/.soc-workflow-registry/_doc/${wf_id}" || true
  done < <(python3 -c "
import json
with open('${WF_REGISTRY_MANIFEST}') as f:
    data = json.load(f)
for w in data['workflows']:
    print(w['workflow_id'])
")
fi

echo ""
echo "--- Verification summary ---"
printf "  PASS: %d\n" "$VERIFY_PASS"
printf "  FAIL: %d\n" "$VERIFY_FAIL"
printf "  SKIP: %d\n" "$VERIFY_SKIP"

if [[ $VERIFY_FAIL -gt 0 ]]; then
  echo ""
  echo "Failure details:"
  for detail in "${FAIL_DETAILS[@]}"; do
    echo "  - ${detail}"
  done
  echo ""
  echo "=== SOC Simulation Setup FAILED verification (${VERIFY_FAIL} failing check(s)) ==="
  exit 1
fi

echo ""
echo "=== SOC Simulation Setup Complete (all ${VERIFY_PASS} checks passed) ==="

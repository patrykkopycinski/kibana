# SOC Simulation Phase 1: Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the full Docker Compose stack (ES, Kibana, Fleet Server, Caldera, Caldera Bridge) on non-default ports, with all 12 index templates, ILM policies, and portable setup/teardown scripts that deploy to any Kibana/ES instance.

**Architecture:** Docker Compose orchestrates 5 containers (ES, Kibana, Fleet Server, Caldera, Caldera Bridge) using `9.4.0-SNAPSHOT` images on ports 19200/15601/18220/18888. The Caldera Bridge is a Python container that polls `.soc-attack-commands` from ES and calls the Caldera REST API. All SOC artifacts (index templates, ILM, agents, workflows, dashboards) are deployed via `setup.sh` using REST APIs — making the entire setup portable to any cluster.

**Tech Stack:** Docker Compose, Elasticsearch 9.4.0-SNAPSHOT, Kibana 9.4.0-SNAPSHOT, Elastic Agent (Fleet Server) 9.4.0-SNAPSHOT, Caldera (Python), Python 3.11 (bridge), bash/curl (setup scripts)

**Spec:** `docs/superpowers/specs/2026-04-14-autonomous-soc-simulation-design.md`

**Reference:** The `elastic-attack-emulation` plugin's `docker/` directory provides a working Caldera + Elastic stack Docker Compose setup to use as a foundation.

---

## File Map

```
soc-simulation/
  docker-compose.yml                    # Task 1: Full local stack
  .env.example                          # Task 1: Port config, credentials
  .env.cloud.example                    # Task 1: Cloud deployment template

  infra/
    caldera/
      Dockerfile                        # Task 2: Caldera + Cortado image
      entrypoint.sh                     # Task 2: Config merge + startup
      conf/
        local.yml                       # Task 2: Caldera config overrides

  bridge/
    caldera_bridge.py                   # Task 3: Polling agent
    requirements.txt                    # Task 3: Python deps
    Dockerfile                          # Task 3: Bridge container
    tests/
      test_bridge.py                    # Task 3: Unit tests

  setup/
    index_templates/
      soc-triage-results.json           # Task 4
      soc-entity-enrichment.json        # Task 4
      soc-hunt-findings.json            # Task 4
      soc-response-actions.json         # Task 4
      soc-outcomes.json                 # Task 4
      soc-agent-health.json             # Task 4
      soc-evolution-log.json            # Task 4
      soc-coverage-gaps.json            # Task 4
      soc-dead-letter.json              # Task 4
      soc-difficulty-state.json         # Task 4
      soc-attack-commands.json          # Task 4
      soc-audit-trail.json              # Task 4
    ilm_policies/
      soc-default.json                  # Task 5
      soc-audit-permanent.json          # Task 5
    seed_data/
      difficulty-state-initial.json     # Task 5

  setup.sh                              # Task 6: Deploy artifacts via REST
  teardown.sh                           # Task 7: Remove artifacts via REST
```

---

### Task 1: Docker Compose Stack

**Files:**
- Create: `soc-simulation/docker-compose.yml`
- Create: `soc-simulation/.env.example`
- Create: `soc-simulation/.env.cloud.example`

This task creates the Docker Compose file for the full local stack. The Caldera and Bridge containers reference Dockerfiles created in Tasks 2 and 3 — they won't build until those tasks are done. ES, Kibana, and Fleet Server will work immediately.

- [ ] **Step 1: Create `.env.example`**

```bash
# soc-simulation/.env.example
# Stack version
STACK_VERSION=9.4.0-SNAPSHOT

# Credentials
ELASTIC_PASSWORD=changeme
CALDERA_API_KEY=ADMIN123

# Host ports (non-default to avoid conflicts)
ES_PORT=19200
KIBANA_PORT=15601
FLEET_PORT=18220
CALDERA_PORT=18888

# Caldera agent contact ports (for Sandcat)
CALDERA_CONTACT_TCP=17010
CALDERA_CONTACT_HTTP=17012
CALDERA_CONTACT_UDP=17011

# Fleet — external URLs for remote agent enrollment
# Set to Tailscale IP or public IP when using GCE VMs
# Leave empty for local-only usage
FLEET_ELASTICSEARCH_HOST=
FLEET_SERVER_EXTERNAL_HOST=

# GCP (for endpoint VMs)
GCP_ZONE=us-central1-a
GCP_PROJECT=
```

- [ ] **Step 2: Create `.env.cloud.example`**

```bash
# soc-simulation/.env.cloud.example
# Elastic Cloud deployment
ES_URL=https://<deployment>.es.us-central1.gcp.cloud.es.io
KIBANA_URL=https://<deployment>.kb.us-central1.gcp.cloud.es.io
FLEET_URL=https://<deployment>.fleet.us-central1.gcp.cloud.es.io
ES_USER=elastic
ES_PASS=<cloud-password>

# Caldera (on GCE VM, reachable from bridge)
CALDERA_URL=http://<caldera-gce-internal-ip>:8888
CALDERA_API_KEY=ADMIN123
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
# soc-simulation/docker-compose.yml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:${STACK_VERSION:-9.4.0-SNAPSHOT}
    container_name: soc-elasticsearch
    environment:
      discovery.type: single-node
      xpack.security.enabled: "true"
      ELASTIC_PASSWORD: ${ELASTIC_PASSWORD:-changeme}
      xpack.security.http.ssl.enabled: "false"
    ports:
      - "0.0.0.0:${ES_PORT:-19200}:9200"
    volumes:
      - es_data:/usr/share/elasticsearch/data
    healthcheck:
      test: ["CMD-SHELL", "curl -sf -u elastic:${ELASTIC_PASSWORD:-changeme} http://localhost:9200/_cluster/health || exit 1"]
      interval: 10s
      retries: 30
    mem_limit: 2g

  setup:
    image: docker.elastic.co/elasticsearch/elasticsearch:${STACK_VERSION:-9.4.0-SNAPSHOT}
    container_name: soc-setup
    depends_on:
      elasticsearch:
        condition: service_healthy
    restart: "no"
    command: >
      bash -c '
        echo "Setting kibana_system password...";
        until curl -sf -u "elastic:${ELASTIC_PASSWORD:-changeme}" http://elasticsearch:9200; do sleep 5; done;
        curl -sf -X POST -u "elastic:${ELASTIC_PASSWORD:-changeme}" \
          -H "Content-Type: application/json" \
          http://elasticsearch:9200/_security/user/kibana_system/_password \
          -d "{\"password\":\"${ELASTIC_PASSWORD:-changeme}\"}" \
        && echo " Done." || echo " Failed.";
        touch /tmp/setup-done
      '
    healthcheck:
      test: ["CMD-SHELL", "[ -f /tmp/setup-done ] || exit 1"]
      interval: 5s
      retries: 1

  kibana:
    image: docker.elastic.co/kibana/kibana:${STACK_VERSION:-9.4.0-SNAPSHOT}
    container_name: soc-kibana
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
      ELASTICSEARCH_USERNAME: kibana_system
      ELASTICSEARCH_PASSWORD: ${ELASTIC_PASSWORD:-changeme}
      XPACK_ENCRYPTEDSAVEDOBJECTS_ENCRYPTIONKEY: "soc-sim-random-32-char-encrypt-key!!"
      XPACK_FLEET_AGENTS_ELASTICSEARCH_HOSTS: '["${FLEET_ELASTICSEARCH_HOST:-http://elasticsearch:9200}"]'
      XPACK_FLEET_AGENTS_FLEET_SERVER_HOSTS: '["${FLEET_SERVER_EXTERNAL_HOST:-http://fleet-server:8220}"]'
    ports:
      - "0.0.0.0:${KIBANA_PORT:-15601}:5601"
    depends_on:
      elasticsearch:
        condition: service_healthy
      setup:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:5601/api/status || exit 1"]
      interval: 10s
      retries: 60
      start_period: 30s

  fleet-server:
    image: docker.elastic.co/elastic-agent/elastic-agent:${STACK_VERSION:-9.4.0-SNAPSHOT}
    container_name: soc-fleet-server
    environment:
      FLEET_SERVER_ENABLE: "true"
      FLEET_SERVER_HOST: "0.0.0.0"
      FLEET_SERVER_INSECURE_HTTP: "true"
      FLEET_SERVER_ELASTICSEARCH_HOST: http://elasticsearch:9200
      FLEET_SERVER_ELASTICSEARCH_USERNAME: elastic
      FLEET_SERVER_ELASTICSEARCH_PASSWORD: ${ELASTIC_PASSWORD:-changeme}
      FLEET_SERVER_POLICY_ID: fleet-server-policy
      FLEET_URL: http://fleet-server:8220
      KIBANA_FLEET_SETUP: "1"
      KIBANA_FLEET_HOST: http://kibana:5601
      KIBANA_FLEET_USERNAME: elastic
      KIBANA_FLEET_PASSWORD: ${ELASTIC_PASSWORD:-changeme}
    ports:
      - "0.0.0.0:${FLEET_PORT:-18220}:8220"
    depends_on:
      elasticsearch:
        condition: service_healthy
      kibana:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8220/api/status || exit 1"]
      interval: 15s
      retries: 60
      start_period: 120s

  caldera:
    build:
      context: ./infra/caldera
      dockerfile: Dockerfile
    container_name: soc-caldera
    ports:
      - "0.0.0.0:${CALDERA_PORT:-18888}:8888"
      - "0.0.0.0:${CALDERA_CONTACT_TCP:-17010}:7010"
      - "0.0.0.0:${CALDERA_CONTACT_HTTP:-17012}:7012"
      - "0.0.0.0:${CALDERA_CONTACT_UDP:-17011}:7011/udp"
    volumes:
      - caldera_data:/opt/caldera/data
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8888/api/v2/health || exit 1"]
      interval: 10s
      retries: 30
      start_period: 120s
    restart: unless-stopped

  caldera-bridge:
    build:
      context: ./bridge
      dockerfile: Dockerfile
    container_name: soc-caldera-bridge
    environment:
      ES_URL: http://elasticsearch:9200
      ES_USER: elastic
      ES_PASS: ${ELASTIC_PASSWORD:-changeme}
      CALDERA_URL: http://caldera:8888
      CALDERA_API_KEY: ${CALDERA_API_KEY:-ADMIN123}
      POLL_INTERVAL_SECONDS: "30"
      PROFILES_DIR: /app/profiles
    volumes:
      - ./caldera_profiles:/app/profiles:ro
    depends_on:
      elasticsearch:
        condition: service_healthy
      caldera:
        condition: service_healthy
    restart: unless-stopped

volumes:
  caldera_data: {}
  es_data: {}
```

- [ ] **Step 4: Verify ES + Kibana start**

Run: `cd soc-simulation && cp .env.example .env && docker compose up -d elasticsearch setup kibana`
Expected: After ~60s, `curl -sf -u elastic:changeme http://localhost:19200/_cluster/health` returns `green` or `yellow`, and `curl -sf http://localhost:15601/api/status` returns 200.

- [ ] **Step 5: Verify Fleet Server starts**

Run: `docker compose up -d fleet-server`
Expected: After ~2min, `curl -sf http://localhost:18220/api/status` returns 200.

- [ ] **Step 6: Commit**

```bash
git add soc-simulation/docker-compose.yml soc-simulation/.env.example soc-simulation/.env.cloud.example
git commit -m "feat(soc-sim): add Docker Compose stack for ES, Kibana, Fleet Server"
```

---

### Task 2: Caldera Container

**Files:**
- Create: `soc-simulation/infra/caldera/Dockerfile`
- Create: `soc-simulation/infra/caldera/entrypoint.sh`
- Create: `soc-simulation/infra/caldera/conf/local.yml`

Based on the `elastic-attack-emulation` plugin's Caldera Dockerfile — same build process (clone Caldera + Cortado plugin, install deps, merge config).

- [ ] **Step 1: Create `infra/caldera/conf/local.yml`**

```yaml
# soc-simulation/infra/caldera/conf/local.yml
# Caldera config overrides for SOC simulation
app.contact.http: http://0.0.0.0:8888
plugins:
  - sandcat
  - stockpile
  - atomic
  - cortado
users:
  red:
    admin: admin
  blue:
    blue: admin
```

- [ ] **Step 2: Create `infra/caldera/entrypoint.sh`**

```bash
#!/usr/bin/env bash
# soc-simulation/infra/caldera/entrypoint.sh
set -euo pipefail

CALDERA_DIR="/opt/caldera"
CONF_DIR="${CALDERA_DIR}/conf"

DEFAULT_CFG="${CONF_DIR}/default.yml"
LOCAL_CFG="${CONF_DIR}/local.yml"
MERGED_CFG="${CONF_DIR}/merged.yml"

if [[ -f "${LOCAL_CFG}" ]]; then
  export DEFAULT_CFG LOCAL_CFG MERGED_CFG
  python - <<'PY'
import os
import yaml

default_path = os.environ["DEFAULT_CFG"]
local_path = os.environ["LOCAL_CFG"]
merged_path = os.environ["MERGED_CFG"]

with open(default_path, "r", encoding="utf-8") as f:
    base = yaml.safe_load(f) or {}

with open(local_path, "r", encoding="utf-8") as f:
    local = yaml.safe_load(f) or {}

for k, v in local.items():
    if k == "plugins":
        continue
    base[k] = v

plugins_dir = "/opt/caldera/plugins"
available = []
try:
    for name in sorted(os.listdir(plugins_dir)):
        if name.startswith("."):
            continue
        path = os.path.join(plugins_dir, name)
        if not os.path.isdir(path):
            continue
        if os.path.isfile(os.path.join(path, "hook.py")):
            available.append(name)
except FileNotFoundError:
    pass

default_order = list(base.get("plugins") or [])
ordered = [p for p in default_order if p in available] + [
    p for p in available if p not in default_order
]

local_plugins = list(local.get("plugins") or [])
for p in local_plugins:
    if p not in ordered:
        ordered.append(p)

base["plugins"] = ordered

with open(merged_path, "w", encoding="utf-8") as f:
    yaml.safe_dump(base, f, sort_keys=False)

print(f"Wrote merged config: {merged_path}")
PY
else
  MERGED_CFG="${DEFAULT_CFG}"
fi

exec python server.py --insecure --build
```

- [ ] **Step 3: Create `infra/caldera/Dockerfile`**

```dockerfile
# soc-simulation/infra/caldera/Dockerfile
FROM python:3.11-slim

ARG CALDERA_REPO=https://github.com/mitre/caldera.git
ARG CALDERA_REF=master

ARG CALDERA_ATOMIC_PLUGIN_REPO=https://github.com/mitre/atomic.git
ARG CALDERA_ATOMIC_PLUGIN_REF=master

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    git ca-certificates build-essential haproxy golang-go nodejs npm curl \
    && rm -rf /var/lib/apt/lists/*

# Clone Caldera with submodules
RUN git clone --recursive --depth 1 --branch "${CALDERA_REF}" "${CALDERA_REPO}" /opt/caldera

WORKDIR /opt/caldera

# Install Python deps
RUN pip install --upgrade pip setuptools wheel \
    && if [ -f requirements.txt ]; then pip install -r requirements.txt; fi

# Install plugin deps (skip stockpile donut — doesn't build on all arches)
RUN for d in plugins/*/; do \
      [ -f "$d/requirements.txt" ] || continue; \
      case "$d" in */stockpile/*) pip install -r "$d/requirements.txt" --ignore-installed 2>/dev/null || true ;; \
      *) pip install -r "$d/requirements.txt" || true ;; esac; \
    done

# Clone Atomic Red Team plugin
RUN git clone --depth 1 --branch "${CALDERA_ATOMIC_PLUGIN_REF}" "${CALDERA_ATOMIC_PLUGIN_REPO}" plugins/atomic \
    && if [ -f plugins/atomic/requirements.txt ]; then pip install -r plugins/atomic/requirements.txt; fi

# Copy Cortado plugin (included in elastic-attack-emulation)
# For SOC simulation, we use the stockpile + atomic plugins which are already cloned
# Cortado can be added later by copying from elastic-attack-emulation/docker/caldera/plugins/cortado

# Copy config and entrypoint
COPY conf/local.yml /opt/caldera/conf/local.yml
COPY entrypoint.sh /usr/local/bin/caldera-entrypoint
RUN chmod +x /usr/local/bin/caldera-entrypoint

EXPOSE 8888 7010 7011/udp 7012

ENTRYPOINT ["caldera-entrypoint"]
```

- [ ] **Step 4: Make entrypoint executable**

Run: `chmod +x soc-simulation/infra/caldera/entrypoint.sh`

- [ ] **Step 5: Verify Caldera builds and starts**

Run: `cd soc-simulation && docker compose up -d caldera`
Expected: After ~2min build + ~2min startup, `curl -sf -H "KEY: ADMIN123" http://localhost:18888/api/v2/health` returns a JSON response.

- [ ] **Step 6: Commit**

```bash
git add soc-simulation/infra/caldera/
git commit -m "feat(soc-sim): add Caldera container with Atomic Red Team plugin"
```

---

### Task 3: Caldera Bridge

**Files:**
- Create: `soc-simulation/bridge/requirements.txt`
- Create: `soc-simulation/bridge/caldera_bridge.py`
- Create: `soc-simulation/bridge/Dockerfile`
- Create: `soc-simulation/bridge/tests/test_bridge.py`

The bridge polls `.soc-attack-commands` from ES for `status: "pending"` documents, claims them via optimistic concurrency, maps difficulty to Caldera adversary profiles, creates Caldera operations, monitors them, and writes results back.

- [ ] **Step 1: Create `bridge/requirements.txt`**

```
# soc-simulation/bridge/requirements.txt
elasticsearch>=8.0.0,<10.0.0
requests>=2.28.0,<3.0.0
```

- [ ] **Step 2: Write the bridge**

```python
#!/usr/bin/env python3
"""
soc-simulation/bridge/caldera_bridge.py

Caldera Bridge — polls Elasticsearch for attack commands and executes them via Caldera API.

Flow:
  1. Query .soc-attack-commands for status: "pending"
  2. Claim document (optimistic concurrency via _seq_no/_primary_term)
  3. Map difficulty → Caldera adversary profile
  4. Create Caldera operation via REST API
  5. Poll operation until finished or timeout
  6. Write result back to .soc-attack-commands
"""

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from elasticsearch import Elasticsearch, ConflictError, NotFoundError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("caldera-bridge")

INDEX = ".soc-attack-commands"
OPERATION_TIMEOUT_SECONDS = 600  # 10 minutes
OPERATION_POLL_SECONDS = 15


def create_es_client() -> Elasticsearch:
    url = os.environ.get("ES_URL", "http://localhost:19200")
    user = os.environ.get("ES_USER", "elastic")
    password = os.environ.get("ES_PASS", "changeme")
    return Elasticsearch(url, basic_auth=(user, password))


def load_profiles(profiles_dir: str) -> dict[int, dict]:
    """Load Caldera adversary profiles from JSON files keyed by difficulty level."""
    profiles = {}
    profiles_path = Path(profiles_dir)
    if not profiles_path.exists():
        log.warning("Profiles directory %s does not exist, using empty profiles", profiles_dir)
        return profiles
    for f in profiles_path.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            level = data.get("difficulty_level")
            if level is not None:
                profiles[int(level)] = data
                log.info("Loaded profile level %d: %s", level, data.get("name", f.name))
        except (json.JSONDecodeError, KeyError) as e:
            log.warning("Failed to load profile %s: %s", f, e)
    return profiles


def claim_pending_command(es: Elasticsearch) -> dict | None:
    """Find and atomically claim a pending attack command."""
    try:
        result = es.search(
            index=INDEX,
            body={
                "query": {"term": {"status": "pending"}},
                "size": 1,
                "sort": [{"created_at": "asc"}],
            },
        )
    except NotFoundError:
        return None

    hits = result.get("hits", {}).get("hits", [])
    if not hits:
        return None

    hit = hits[0]
    doc_id = hit["_id"]
    seq_no = hit["_seq_no"]
    primary_term = hit["_primary_term"]

    try:
        es.update(
            index=INDEX,
            id=doc_id,
            body={
                "doc": {
                    "status": "running",
                    "claimed_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            if_seq_no=seq_no,
            if_primary_term=primary_term,
        )
    except ConflictError:
        log.info("Command %s already claimed by another instance, skipping", doc_id)
        return None

    hit["_source"]["_id"] = doc_id
    hit["_source"]["status"] = "running"
    return hit["_source"]


def create_caldera_operation(
    caldera_url: str, api_key: str, adversary_id: str, group: str = "all-endpoints"
) -> str | None:
    """Create a Caldera operation and return its ID."""
    url = f"{caldera_url}/api/v2/operations"
    payload = {
        "name": f"soc-sim-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
        "adversary": {"adversary_id": adversary_id},
        "group": group,
    }
    try:
        resp = requests.post(url, json=payload, headers={"KEY": api_key}, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        op_id = data.get("id") or data.get("operation_id")
        log.info("Created Caldera operation %s (adversary=%s)", op_id, adversary_id)
        return op_id
    except requests.RequestException as e:
        log.error("Failed to create Caldera operation: %s", e)
        return None


def wait_for_operation(caldera_url: str, api_key: str, operation_id: str) -> dict:
    """Poll Caldera until operation is finished or timeout."""
    url = f"{caldera_url}/api/v2/operations/{operation_id}"
    start = time.monotonic()
    while time.monotonic() - start < OPERATION_TIMEOUT_SECONDS:
        try:
            resp = requests.get(url, headers={"KEY": api_key}, timeout=15)
            resp.raise_for_status()
            op = resp.json()
            state = op.get("state", "")
            if state in ("finished", "cleanup", "paused"):
                techniques = []
                for link in op.get("chain", []):
                    ability = link.get("ability", {})
                    tid = ability.get("technique_id")
                    if tid and tid not in techniques:
                        techniques.append(tid)
                return {"state": state, "techniques_executed": techniques}
        except requests.RequestException as e:
            log.warning("Error polling operation %s: %s", operation_id, e)
        time.sleep(OPERATION_POLL_SECONDS)
    return {"state": "timeout", "techniques_executed": []}


def update_command_result(
    es: Elasticsearch, doc_id: str, status: str, operation_id: str | None = None,
    techniques: list[str] | None = None, error: str | None = None,
) -> None:
    """Write result back to .soc-attack-commands."""
    body: dict = {
        "status": status,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    if operation_id:
        body["operation_id"] = operation_id
    if techniques:
        body["techniques_executed"] = techniques
    if error:
        body["error"] = error
    es.update(index=INDEX, id=doc_id, body={"doc": body})
    log.info("Updated command %s → %s", doc_id, status)


def process_command(
    es: Elasticsearch, command: dict, profiles: dict[int, dict],
    caldera_url: str, api_key: str,
) -> None:
    """Process a single attack command."""
    doc_id = command["_id"]
    difficulty = int(command.get("difficulty", 1))

    profile = profiles.get(difficulty)
    if not profile:
        update_command_result(es, doc_id, "failed", error=f"No profile for difficulty {difficulty}")
        return

    adversary_id = profile.get("adversary_id")
    if not adversary_id:
        update_command_result(es, doc_id, "failed", error=f"Profile level {difficulty} has no adversary_id")
        return

    group = profile.get("group", "all-endpoints")
    operation_id = create_caldera_operation(caldera_url, api_key, adversary_id, group)
    if not operation_id:
        update_command_result(es, doc_id, "failed", error="Failed to create Caldera operation")
        return

    result = wait_for_operation(caldera_url, api_key, operation_id)
    if result["state"] == "timeout":
        update_command_result(
            es, doc_id, "failed", operation_id=operation_id, error="Operation timed out after 10min"
        )
    else:
        update_command_result(
            es, doc_id, "completed", operation_id=operation_id, techniques=result["techniques_executed"]
        )


def main() -> None:
    poll_interval = int(os.environ.get("POLL_INTERVAL_SECONDS", "30"))
    caldera_url = os.environ.get("CALDERA_URL", "http://localhost:18888")
    api_key = os.environ.get("CALDERA_API_KEY", "ADMIN123")
    profiles_dir = os.environ.get("PROFILES_DIR", "/app/profiles")

    log.info("Caldera Bridge starting (ES=%s, Caldera=%s, poll=%ds)",
             os.environ.get("ES_URL", "http://localhost:19200"), caldera_url, poll_interval)

    es = create_es_client()
    profiles = load_profiles(profiles_dir)
    log.info("Loaded %d adversary profiles", len(profiles))

    while True:
        try:
            command = claim_pending_command(es)
            if command:
                process_command(es, command, profiles, caldera_url, api_key)
            else:
                log.debug("No pending commands")
        except Exception:
            log.exception("Unexpected error in poll loop")
        time.sleep(poll_interval)


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Create `bridge/Dockerfile`**

```dockerfile
# soc-simulation/bridge/Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY caldera_bridge.py .

CMD ["python", "caldera_bridge.py"]
```

- [ ] **Step 4: Write unit tests**

```python
# soc-simulation/bridge/tests/test_bridge.py
"""Unit tests for Caldera Bridge — tests core logic without live ES/Caldera."""

import json
from unittest.mock import MagicMock, patch

import pytest

# Import the module under test
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
import caldera_bridge


def test_load_profiles_from_directory(tmp_path):
    profile = {
        "difficulty_level": 1,
        "name": "script-kiddie-profile",
        "adversary_id": "abc-123",
        "group": "all-endpoints",
    }
    (tmp_path / "level1.json").write_text(json.dumps(profile))

    profiles = caldera_bridge.load_profiles(str(tmp_path))

    assert 1 in profiles
    assert profiles[1]["adversary_id"] == "abc-123"
    assert profiles[1]["name"] == "script-kiddie-profile"


def test_load_profiles_empty_directory(tmp_path):
    profiles = caldera_bridge.load_profiles(str(tmp_path))
    assert profiles == {}


def test_load_profiles_nonexistent_directory():
    profiles = caldera_bridge.load_profiles("/nonexistent/path")
    assert profiles == {}


def test_load_profiles_skips_invalid_json(tmp_path):
    (tmp_path / "bad.json").write_text("not json")
    profiles = caldera_bridge.load_profiles(str(tmp_path))
    assert profiles == {}


def test_claim_pending_command_returns_none_when_empty():
    es = MagicMock()
    es.search.return_value = {"hits": {"hits": []}}
    result = caldera_bridge.claim_pending_command(es)
    assert result is None


def test_claim_pending_command_claims_document():
    es = MagicMock()
    es.search.return_value = {
        "hits": {
            "hits": [{
                "_id": "doc-1",
                "_seq_no": 5,
                "_primary_term": 1,
                "_source": {
                    "status": "pending",
                    "difficulty": 2,
                    "profile": "opportunistic-profile",
                },
            }]
        }
    }
    es.update.return_value = {}

    result = caldera_bridge.claim_pending_command(es)

    assert result is not None
    assert result["_id"] == "doc-1"
    assert result["status"] == "running"
    es.update.assert_called_once()
    call_kwargs = es.update.call_args
    assert call_kwargs.kwargs["if_seq_no"] == 5
    assert call_kwargs.kwargs["if_primary_term"] == 1


def test_claim_pending_command_handles_conflict():
    from elasticsearch import ConflictError

    es = MagicMock()
    es.search.return_value = {
        "hits": {
            "hits": [{
                "_id": "doc-1",
                "_seq_no": 5,
                "_primary_term": 1,
                "_source": {"status": "pending", "difficulty": 1},
            }]
        }
    }
    es.update.side_effect = ConflictError(message="conflict", meta=None, body=None)

    result = caldera_bridge.claim_pending_command(es)
    assert result is None


def test_process_command_fails_without_profile():
    es = MagicMock()
    command = {"_id": "doc-1", "difficulty": 99}
    caldera_bridge.process_command(es, command, {}, "http://cal:8888", "KEY")
    es.update.assert_called_once()
    update_body = es.update.call_args.kwargs["body"]["doc"]
    assert update_body["status"] == "failed"
    assert "No profile for difficulty 99" in update_body["error"]


@patch("caldera_bridge.create_caldera_operation", return_value=None)
def test_process_command_fails_when_operation_creation_fails(mock_create):
    es = MagicMock()
    command = {"_id": "doc-1", "difficulty": 1}
    profiles = {1: {"adversary_id": "adv-1", "group": "all-endpoints"}}
    caldera_bridge.process_command(es, command, profiles, "http://cal:8888", "KEY")
    update_body = es.update.call_args.kwargs["body"]["doc"]
    assert update_body["status"] == "failed"


@patch("caldera_bridge.wait_for_operation", return_value={"state": "finished", "techniques_executed": ["T1059.004"]})
@patch("caldera_bridge.create_caldera_operation", return_value="op-123")
def test_process_command_succeeds(mock_create, mock_wait):
    es = MagicMock()
    command = {"_id": "doc-1", "difficulty": 1}
    profiles = {1: {"adversary_id": "adv-1", "group": "all-endpoints"}}
    caldera_bridge.process_command(es, command, profiles, "http://cal:8888", "KEY")
    update_body = es.update.call_args.kwargs["body"]["doc"]
    assert update_body["status"] == "completed"
    assert update_body["operation_id"] == "op-123"
    assert update_body["techniques_executed"] == ["T1059.004"]
```

- [ ] **Step 5: Run tests**

Run: `cd soc-simulation/bridge && pip install -r requirements.txt pytest && python -m pytest tests/ -v`
Expected: All 8 tests pass.

- [ ] **Step 6: Verify bridge container builds**

Run: `cd soc-simulation && docker compose build caldera-bridge`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add soc-simulation/bridge/
git commit -m "feat(soc-sim): add Caldera Bridge polling agent with tests"
```

---

### Task 4: Index Templates (12 indices)

**Files:**
- Create: `soc-simulation/setup/index_templates/soc-triage-results.json`
- Create: `soc-simulation/setup/index_templates/soc-entity-enrichment.json`
- Create: `soc-simulation/setup/index_templates/soc-hunt-findings.json`
- Create: `soc-simulation/setup/index_templates/soc-response-actions.json`
- Create: `soc-simulation/setup/index_templates/soc-outcomes.json`
- Create: `soc-simulation/setup/index_templates/soc-agent-health.json`
- Create: `soc-simulation/setup/index_templates/soc-evolution-log.json`
- Create: `soc-simulation/setup/index_templates/soc-coverage-gaps.json`
- Create: `soc-simulation/setup/index_templates/soc-dead-letter.json`
- Create: `soc-simulation/setup/index_templates/soc-difficulty-state.json`
- Create: `soc-simulation/setup/index_templates/soc-attack-commands.json`
- Create: `soc-simulation/setup/index_templates/soc-audit-trail.json`

Each index template uses the field schemas from the spec's Communication Indices table (Section 3) and the Bridge Index Schema (Section 7).

- [ ] **Step 1: Create `soc-triage-results.json`**

```json
{
  "index_patterns": [".soc-triage-results*"],
  "priority": 500,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "soc-default"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "correlation_id": { "type": "keyword" },
        "hop_count": { "type": "integer" },
        "alert_ids": { "type": "keyword" },
        "classification": { "type": "keyword" },
        "confidence": { "type": "integer" },
        "reasoning": { "type": "text" },
        "entities": {
          "properties": {
            "hosts": { "type": "keyword" },
            "users": { "type": "keyword" },
            "ips": { "type": "ip" }
          }
        },
        "mitre_techniques": { "type": "keyword" },
        "enrichment_requests": { "type": "keyword" },
        "sml_patterns_matched": { "type": "keyword" }
      }
    }
  }
}
```

- [ ] **Step 2: Create `soc-entity-enrichment.json`**

```json
{
  "index_patterns": [".soc-entity-enrichment*"],
  "priority": 500,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "soc-default"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "correlation_id": { "type": "keyword" },
        "hop_count": { "type": "integer" },
        "confidence": { "type": "integer" },
        "confidence_delta": { "type": "integer" },
        "entities_enriched": {
          "type": "nested",
          "properties": {
            "entity_id": { "type": "keyword" },
            "risk_score": { "type": "integer" },
            "asset_criticality": { "type": "keyword" },
            "behavioral_anomalies": { "type": "keyword" },
            "relationships": { "type": "keyword" },
            "baseline_summary": { "type": "text" }
          }
        },
        "enrichment_summary": { "type": "text" }
      }
    }
  }
}
```

- [ ] **Step 3: Create `soc-hunt-findings.json`**

```json
{
  "index_patterns": [".soc-hunt-findings*"],
  "priority": 500,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "soc-default"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "correlation_id": { "type": "keyword" },
        "hop_count": { "type": "integer" },
        "confidence": { "type": "integer" },
        "confidence_delta": { "type": "integer" },
        "hypotheses_tested": {
          "type": "nested",
          "properties": {
            "hypothesis": { "type": "text" },
            "queries_executed": { "type": "text" },
            "evidence": { "type": "text" },
            "verdict": { "type": "keyword" }
          }
        },
        "iocs_discovered": { "type": "keyword" },
        "related_alerts_found": { "type": "keyword" },
        "investigation_summary": { "type": "text" }
      }
    }
  }
}
```

- [ ] **Step 4: Create `soc-response-actions.json`**

```json
{
  "index_patterns": [".soc-response-actions*"],
  "priority": 500,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "soc-default"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "correlation_id": { "type": "keyword" },
        "action_type": { "type": "keyword" },
        "target": { "type": "keyword" },
        "status": { "type": "keyword" },
        "confidence_at_response": { "type": "integer" },
        "workflow_execution_id": { "type": "keyword" }
      }
    }
  }
}
```

- [ ] **Step 5: Create `soc-outcomes.json`**

```json
{
  "index_patterns": [".soc-outcomes*"],
  "priority": 500,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "soc-default"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "correlation_id": { "type": "keyword" },
        "case_id": { "type": "keyword" },
        "disposition": { "type": "keyword" },
        "confidence_history": {
          "type": "nested",
          "properties": {
            "agent": { "type": "keyword" },
            "confidence": { "type": "integer" }
          }
        },
        "time_to_detect": { "type": "long" },
        "time_to_respond": { "type": "long" },
        "agents_involved": { "type": "keyword" },
        "techniques_observed": { "type": "keyword" },
        "confidence_accuracy": { "type": "float" }
      }
    }
  }
}
```

- [ ] **Step 6: Create `soc-agent-health.json`**

```json
{
  "index_patterns": [".soc-agent-health*"],
  "priority": 500,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "soc-default"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "agent_id": { "type": "keyword" },
        "throughput": { "type": "float" },
        "latency_p50": { "type": "float" },
        "latency_p95": { "type": "float" },
        "error_rate": { "type": "float" },
        "status": { "type": "keyword" }
      }
    }
  }
}
```

- [ ] **Step 7: Create `soc-evolution-log.json`**

```json
{
  "index_patterns": [".soc-evolution-log*"],
  "priority": 500,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "soc-audit-permanent"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "action_type": { "type": "keyword" },
        "agent_id": { "type": "keyword" },
        "reasoning": { "type": "text" },
        "before": { "type": "object", "enabled": false },
        "after": { "type": "object", "enabled": false }
      }
    }
  }
}
```

- [ ] **Step 8: Create `soc-coverage-gaps.json`**

```json
{
  "index_patterns": [".soc-coverage-gaps*"],
  "priority": 500,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "soc-default"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "technique_id": { "type": "keyword" },
        "occurrences": { "type": "integer" },
        "avg_confidence": { "type": "float" }
      }
    }
  }
}
```

- [ ] **Step 9: Create `soc-dead-letter.json`**

```json
{
  "index_patterns": [".soc-dead-letter*"],
  "priority": 500,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "soc-audit-permanent"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "source": { "type": "keyword" },
        "correlation_id": { "type": "keyword" },
        "error": { "type": "text" },
        "retry_count": { "type": "integer" },
        "alert_ids": { "type": "keyword" },
        "last_retry_at": { "type": "date" }
      }
    }
  }
}
```

- [ ] **Step 10: Create `soc-difficulty-state.json`**

```json
{
  "index_patterns": [".soc-difficulty-state*"],
  "priority": 500,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "soc-audit-permanent"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "level": { "type": "integer" },
        "level_name": { "type": "keyword" },
        "previous_level": { "type": "integer" },
        "decision": { "type": "keyword" },
        "reasoning": { "type": "text" }
      }
    }
  }
}
```

- [ ] **Step 11: Create `soc-attack-commands.json`**

```json
{
  "index_patterns": [".soc-attack-commands*"],
  "priority": 500,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "soc-default"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "status": { "type": "keyword" },
        "difficulty": { "type": "integer" },
        "profile": { "type": "keyword" },
        "techniques": { "type": "keyword" },
        "correlation_id": { "type": "keyword" },
        "created_at": { "type": "date" },
        "claimed_at": { "type": "date" },
        "completed_at": { "type": "date" },
        "operation_id": { "type": "keyword" },
        "techniques_executed": { "type": "keyword" },
        "error": { "type": "text" }
      }
    }
  }
}
```

- [ ] **Step 12: Create `soc-audit-trail.json`**

```json
{
  "index_patterns": [".soc-audit-trail*"],
  "priority": 500,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "soc-audit-permanent"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "correlation_id": { "type": "keyword" },
        "agent_name": { "type": "keyword" },
        "action": { "type": "keyword" },
        "confidence": { "type": "integer" },
        "classification": { "type": "keyword" },
        "hop_count": { "type": "integer" },
        "details": { "type": "object", "enabled": false }
      }
    }
  }
}
```

- [ ] **Step 13: Commit**

```bash
git add soc-simulation/setup/index_templates/
git commit -m "feat(soc-sim): add 12 index templates for SOC communication indices"
```

---

### Task 5: ILM Policies & Seed Data

**Files:**
- Create: `soc-simulation/setup/ilm_policies/soc-default.json`
- Create: `soc-simulation/setup/ilm_policies/soc-audit-permanent.json`
- Create: `soc-simulation/setup/seed_data/difficulty-state-initial.json`

- [ ] **Step 1: Create `soc-default.json` ILM policy (90-day retention)**

```json
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_age": "7d",
            "max_primary_shard_size": "10gb"
          }
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

- [ ] **Step 2: Create `soc-audit-permanent.json` ILM policy (permanent retention)**

```json
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_age": "30d",
            "max_primary_shard_size": "50gb"
          }
        }
      }
    }
  }
}
```

- [ ] **Step 3: Create seed data for initial difficulty state (Level 1)**

```json
{
  "index": ".soc-difficulty-state",
  "body": {
    "@timestamp": "2026-04-15T00:00:00.000Z",
    "level": 1,
    "level_name": "Script Kiddie",
    "previous_level": 0,
    "decision": "initial",
    "reasoning": "Initial deployment — starting at Level 1 (Script Kiddie)"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add soc-simulation/setup/ilm_policies/ soc-simulation/setup/seed_data/
git commit -m "feat(soc-sim): add ILM policies and initial difficulty seed data"
```

---

### Task 6: setup.sh

**Files:**
- Create: `soc-simulation/setup.sh`

Deploys all artifacts to any Kibana/ES via REST APIs. Idempotent — safe to re-run.

- [ ] **Step 1: Create `setup.sh`**

```bash
#!/usr/bin/env bash
# soc-simulation/setup.sh
# Deploy all SOC simulation artifacts to a Kibana/ES instance.
# Usage: ./setup.sh [--env <env-file>]
#
# Reads from .env by default (or .env.cloud, etc. via --env flag):
#   ES_URL, KIBANA_URL, ES_USER, ES_PASS

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --env) ENV_FILE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Load env
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

# Defaults for local Docker mode
ES_URL="${ES_URL:-http://localhost:${ES_PORT:-19200}}"
KIBANA_URL="${KIBANA_URL:-http://localhost:${KIBANA_PORT:-15601}}"
ES_USER="${ES_USER:-elastic}"
ES_PASS="${ES_PASS:-${ELASTIC_PASSWORD:-changeme}}"

AUTH="-u ${ES_USER}:${ES_PASS}"
HEADERS='-H "Content-Type: application/json" -H "kbn-xsrf: true"'

echo "=== SOC Simulation Setup ==="
echo "ES:     $ES_URL"
echo "Kibana: $KIBANA_URL"
echo ""

# Wait for ES
echo "Waiting for Elasticsearch..."
until curl -sf $AUTH "$ES_URL/_cluster/health" > /dev/null 2>&1; do
  sleep 5
done
echo "Elasticsearch is ready."

# Wait for Kibana
echo "Waiting for Kibana..."
until curl -sf "$KIBANA_URL/api/status" > /dev/null 2>&1; do
  sleep 5
done
echo "Kibana is ready."

# 1. ILM Policies
echo ""
echo "--- Creating ILM policies ---"
for f in "$SCRIPT_DIR"/setup/ilm_policies/*.json; do
  name="$(basename "$f" .json)"
  echo "  ILM: $name"
  curl -sf $AUTH -X PUT "$ES_URL/_ilm/policy/$name" \
    -H "Content-Type: application/json" \
    -d @"$f" > /dev/null
done

# 2. Index Templates
echo ""
echo "--- Creating index templates ---"
for f in "$SCRIPT_DIR"/setup/index_templates/*.json; do
  name="$(basename "$f" .json)"
  echo "  Template: $name"
  curl -sf $AUTH -X PUT "$ES_URL/_index_template/$name" \
    -H "Content-Type: application/json" \
    -d @"$f" > /dev/null
done

# 3. Seed Data
echo ""
echo "--- Indexing seed data ---"
for f in "$SCRIPT_DIR"/setup/seed_data/*.json; do
  index="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['index'])" "$f")"
  body="$(python3 -c "import json,sys; print(json.dumps(json.load(open(sys.argv[1]))['body']))" "$f")"
  echo "  Seed: $index"
  curl -sf $AUTH -X POST "$ES_URL/$index/_doc" \
    -H "Content-Type: application/json" \
    -d "$body" > /dev/null
done

# 4. Agents (Agent Builder API)
echo ""
echo "--- Creating agents ---"
if ls "$SCRIPT_DIR"/agents/*.json 1>/dev/null 2>&1; then
  for f in "$SCRIPT_DIR"/agents/*.json; do
    name="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['name'])" "$f")"
    echo "  Agent: $name"
    curl -sf -u "$ES_USER:$ES_PASS" -X POST "$KIBANA_URL/api/agent_builder/agents" \
      -H "Content-Type: application/json" -H "kbn-xsrf: true" \
      -d @"$f" > /dev/null 2>&1 || echo "    (may already exist)"
  done
else
  echo "  No agent definitions found (agents/ dir), skipping."
fi

# 5. Workflows (bulk create)
echo ""
echo "--- Creating workflows ---"
if ls "$SCRIPT_DIR"/workflows/*.yaml 1>/dev/null 2>&1; then
  workflows_json="[]"
  for f in "$SCRIPT_DIR"/workflows/*.yaml; do
    yaml_content="$(cat "$f")"
    workflows_json="$(echo "$workflows_json" | python3 -c "
import json, sys
arr = json.load(sys.stdin)
arr.append({'yaml': sys.argv[1]})
print(json.dumps(arr))
" "$yaml_content")"
  done
  payload="{\"workflows\": $workflows_json}"
  echo "  Bulk creating $(echo "$workflows_json" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" ) workflows"
  curl -sf -u "$ES_USER:$ES_PASS" -X POST "$KIBANA_URL/api/workflows?overwrite=true" \
    -H "Content-Type: application/json" -H "kbn-xsrf: true" \
    -d "$payload" > /dev/null 2>&1 || echo "    (bulk create may have partial failures)"
else
  echo "  No workflow definitions found (workflows/ dir), skipping."
fi

# 6. Dashboards + Data Views (saved objects)
echo ""
echo "--- Importing saved objects ---"
for dir in dashboards data_views; do
  if ls "$SCRIPT_DIR"/setup/$dir/*.ndjson 1>/dev/null 2>&1; then
    for f in "$SCRIPT_DIR"/setup/$dir/*.ndjson; do
      echo "  Import: $(basename "$f")"
      curl -sf -u "$ES_USER:$ES_PASS" -X POST \
        "$KIBANA_URL/api/saved_objects/_import?overwrite=true" \
        -H "kbn-xsrf: true" \
        --form file=@"$f" > /dev/null 2>&1 || echo "    (import may have partial failures)"
    done
  else
    echo "  No $dir found, skipping."
  fi
done

# 7. Detection rules
echo ""
echo "--- Importing detection rules ---"
if [[ -f "$SCRIPT_DIR/detection_rules/rules.ndjson" ]]; then
  curl -sf -u "$ES_USER:$ES_PASS" -X POST \
    "$KIBANA_URL/api/detection_engine/rules/_import?overwrite=true" \
    -H "kbn-xsrf: true" \
    --form file=@"$SCRIPT_DIR/detection_rules/rules.ndjson" > /dev/null 2>&1 || echo "    (import may have partial failures)"
else
  echo "  No detection rules found, skipping."
fi

echo ""
echo "=== Setup complete ==="
echo "Kibana: $KIBANA_URL"
```

- [ ] **Step 2: Make executable**

Run: `chmod +x soc-simulation/setup.sh`

- [ ] **Step 3: Test against local Docker stack**

Run: `cd soc-simulation && docker compose up -d elasticsearch setup kibana && sleep 30 && ./setup.sh`
Expected: All index templates and ILM policies created successfully. Agent/workflow/dashboard steps skip with "No ... found" since those artifacts don't exist yet.

- [ ] **Step 4: Verify templates were created**

Run: `curl -sf -u elastic:changeme http://localhost:19200/_index_template/soc-* | python3 -c "import json,sys; templates=json.load(sys.stdin)['index_templates']; print(f'{len(templates)} templates created'); [print(f'  - {t[\"name\"]}') for t in templates]"`
Expected: 12 templates listed.

- [ ] **Step 5: Commit**

```bash
git add soc-simulation/setup.sh
git commit -m "feat(soc-sim): add portable setup.sh for deploying artifacts via REST APIs"
```

---

### Task 7: teardown.sh

**Files:**
- Create: `soc-simulation/teardown.sh`

Reverse of setup.sh — removes all SOC simulation artifacts. Requires `--confirm` flag to prevent accidental deletion.

- [ ] **Step 1: Create `teardown.sh`**

```bash
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

if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

ES_URL="${ES_URL:-http://localhost:${ES_PORT:-19200}}"
KIBANA_URL="${KIBANA_URL:-http://localhost:${KIBANA_PORT:-15601}}"
ES_USER="${ES_USER:-elastic}"
ES_PASS="${ES_PASS:-${ELASTIC_PASSWORD:-changeme}}"
AUTH="-u ${ES_USER}:${ES_PASS}"

echo "=== SOC Simulation Teardown ==="
echo "ES:     $ES_URL"
echo "Kibana: $KIBANA_URL"
echo ""

# 1. Delete indices
echo "--- Deleting indices ---"
curl -sf $AUTH -X DELETE "$ES_URL/.soc-*" > /dev/null 2>&1 || echo "  (no indices to delete)"
echo "  Done."

# 2. Delete index templates
echo ""
echo "--- Deleting index templates ---"
for f in "$SCRIPT_DIR"/setup/index_templates/*.json; do
  name="$(basename "$f" .json)"
  curl -sf $AUTH -X DELETE "$ES_URL/_index_template/$name" > /dev/null 2>&1 || true
  echo "  Deleted template: $name"
done

# 3. Delete ILM policies
echo ""
echo "--- Deleting ILM policies ---"
for f in "$SCRIPT_DIR"/setup/ilm_policies/*.json; do
  name="$(basename "$f" .json)"
  curl -sf $AUTH -X DELETE "$ES_URL/_ilm/policy/$name" > /dev/null 2>&1 || true
  echo "  Deleted ILM: $name"
done

# 4. Delete agents
echo ""
echo "--- Deleting agents ---"
if ls "$SCRIPT_DIR"/agents/*.json 1>/dev/null 2>&1; then
  for f in "$SCRIPT_DIR"/agents/*.json; do
    agent_id="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['id'])" "$f")"
    curl -sf -u "$ES_USER:$ES_PASS" -X DELETE "$KIBANA_URL/api/agent_builder/agents/$agent_id" \
      -H "kbn-xsrf: true" > /dev/null 2>&1 || true
    echo "  Deleted agent: $agent_id"
  done
else
  echo "  No agent definitions found, skipping."
fi

# 5. Delete workflows
echo ""
echo "--- Deleting workflows ---"
# List all workflows and delete those created by setup
all_workflows="$(curl -sf -u "$ES_USER:$ES_PASS" "$KIBANA_URL/api/workflows" \
  -H "kbn-xsrf: true" 2>/dev/null || echo '{"workflows":[]}')"
echo "$all_workflows" | python3 -c "
import json, sys
data = json.load(sys.stdin)
workflows = data.get('workflows', data.get('data', []))
soc_ids = [w['id'] for w in workflows if w.get('name', '').startswith('SOC ')]
print(f'Found {len(soc_ids)} SOC workflows to delete')
for wid in soc_ids:
    print(wid)
" 2>/dev/null | while read -r wid; do
  [[ -z "$wid" || "$wid" == Found* ]] && { echo "  $wid"; continue; }
  curl -sf -u "$ES_USER:$ES_PASS" -X DELETE "$KIBANA_URL/api/workflows/workflow/$wid" \
    -H "kbn-xsrf: true" > /dev/null 2>&1 || true
  echo "  Deleted workflow: $wid"
done

echo ""
echo "=== Teardown complete ==="
```

- [ ] **Step 2: Make executable**

Run: `chmod +x soc-simulation/teardown.sh`

- [ ] **Step 3: Verify teardown works**

Run: `cd soc-simulation && ./teardown.sh --confirm`
Expected: All 12 index templates, 2 ILM policies, and `.soc-*` indices deleted. Agent/workflow steps skip gracefully if none exist.

- [ ] **Step 4: Verify cleanup is complete**

Run: `curl -sf -u elastic:changeme "http://localhost:19200/_index_template/soc-*" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('index_templates',[])), 'templates remaining')"`
Expected: `0 templates remaining`

- [ ] **Step 5: Commit**

```bash
git add soc-simulation/teardown.sh
git commit -m "feat(soc-sim): add teardown.sh for clean artifact removal"
```

---

### Task 8: End-to-End Smoke Test

No new files — this task verifies the full Phase 1 stack works together.

- [ ] **Step 1: Start the full stack**

Run: `cd soc-simulation && docker compose down -v && docker compose up -d`
Expected: All 6 services start (elasticsearch, setup, kibana, fleet-server, caldera, caldera-bridge). Wait ~3min for everything to be healthy.

- [ ] **Step 2: Check all services are healthy**

Run: `docker compose ps`
Expected: All containers show `healthy` or `running` status.

- [ ] **Step 3: Run setup.sh to deploy artifacts**

Run: `./setup.sh`
Expected: 12 index templates created, 2 ILM policies created, 1 seed document indexed.

- [ ] **Step 4: Verify bridge is running and polling**

Run: `docker compose logs caldera-bridge --tail 5`
Expected: Logs show "Caldera Bridge starting" and "No pending commands" messages (no pending attack commands yet since we haven't created the Difficulty Controller workflow).

- [ ] **Step 5: Test bridge by manually inserting an attack command**

Run:
```bash
curl -sf -u elastic:changeme -X POST "http://localhost:19200/.soc-attack-commands/_doc" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "pending",
    "difficulty": 1,
    "profile": "script-kiddie-profile",
    "correlation_id": "test-001",
    "created_at": "2026-04-15T12:00:00Z"
  }'
```
Expected: Document created. Within 30s, bridge picks it up. Check: `docker compose logs caldera-bridge --tail 10` — should show "No profile for difficulty 1" (since we haven't created caldera_profiles/ yet, but the claim + update cycle works).

- [ ] **Step 6: Verify the command was claimed**

Run:
```bash
curl -sf -u elastic:changeme "http://localhost:19200/.soc-attack-commands/_search" \
  -H "Content-Type: application/json" \
  -d '{"query":{"term":{"correlation_id":"test-001"}}}' | python3 -c "
import json,sys
hit = json.load(sys.stdin)['hits']['hits'][0]['_source']
print(f'status: {hit[\"status\"]}')
print(f'error: {hit.get(\"error\", \"none\")}')
"
```
Expected: `status: failed` and `error: No profile for difficulty 1` (expected — no profiles yet, but the bridge's full claim→process→report cycle is verified).

- [ ] **Step 7: Run teardown and verify clean state**

Run: `./teardown.sh --confirm`
Expected: All artifacts removed cleanly.

- [ ] **Step 8: Commit (if any fixes were needed)**

```bash
git add -A soc-simulation/
git commit -m "fix(soc-sim): address issues found during e2e smoke test"
```

Only commit if changes were made to fix issues. If everything passed cleanly, skip this step.

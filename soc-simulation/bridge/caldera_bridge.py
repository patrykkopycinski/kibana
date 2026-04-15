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
            seq_no_primary_term=True,
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

#!/usr/bin/env python3
# Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
# or more contributor license agreements. Licensed under the Elastic License
# 2.0; you may not use this file except in compliance with the Elastic License
# 2.0.
#
# ARGUS — mirror-mode validation for two workflows that the local Kibana
# workflow runtime does not expose:
#
#   * soc-argus-arm-mythos-preset.yaml
#   * soc-argus-frontier-simulator.yaml
#
# The script executes the exact ES data contract of each workflow (same
# indices, same queries, same document shapes) and prints a compact,
# grep-able report that is then captured into the proof directory.

import base64
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ES = os.environ.get("ES_URL", "http://localhost:19200")
USER = os.environ.get("ES_USER", "elastic")
PASS = os.environ.get("ES_PASS", "changeme")
AUTH = "Basic " + base64.b64encode(f"{USER}:{PASS}".encode()).decode()


def req(method: str, path: str, body=None):
    url = f"{ES}{path}"
    data = None
    headers = {"Authorization": AUTH}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=10) as resp:
        payload = resp.read().decode()
        return json.loads(payload) if payload else {}


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def section(title: str):
    print(f"\n=== {title} ===")


def arm_mythos_preset() -> dict:
    """Mirror of soc-argus-arm-mythos-preset.yaml — idempotent."""
    section("soc-argus-arm-mythos-preset (mirror)")

    # 1. verify_profile_seeded
    try:
        profile = req("GET", "/.soc-attack-profiles/_doc/level-6")
    except urllib.error.HTTPError as e:
        profile = {"found": False, "error": f"HTTP {e.code}"}
    found = bool(profile.get("found"))
    print(f"step=verify_profile_seeded profile_found={found}")
    if not found:
        print("  (gate_profile_found=no — would skip arm_attack_command)")

    # 2. arm_attack_command (only if profile found)
    cmd_id = None
    cmd_result = None
    if found:
        ts = now_iso()
        cmd_doc = {
            "@timestamp": ts,
            "status": "pending",
            "source": "soc-argus-arm-mythos-preset",
            "difficulty": "6",
            "operation_profile": "mythos_class_frontier",
            "argus": {
                "preset": "mythos_class_frontier",
                "pressures_exercised": ["P1", "P2", "P3"],
                "arm_reason": "mirror_validation_2026_04_17",
            },
        }
        r = req(
            "POST", "/.soc-attack-commands/_doc?refresh=wait_for", cmd_doc
        )
        cmd_id = r.get("_id")
        cmd_result = r.get("result")
        print(
            f"step=arm_attack_command _id={cmd_id} result={cmd_result} index={r.get('_index')}"
        )

    # 3. audit_arm
    audit_doc = {
        "@timestamp": now_iso(),
        "event_type": "argus_mythos_preset_armed",
        "source": "soc-argus-arm-mythos-preset",
        "difficulty": "6",
        "operation_profile": "mythos_class_frontier",
        "profile_found": found,
        "validation_run": "mirror_2026_04_17",
    }
    a = req("POST", "/.soc-audit-trail/_doc", audit_doc)
    print(f"step=audit_arm _id={a.get('_id')} result={a.get('result')}")

    return {
        "profile_found": found,
        "command_id": cmd_id,
        "command_result": cmd_result,
        "audit_id": a.get("_id"),
    }


def arm_preset_armed_flag() -> None:
    """Flip .soc-difficulty-state.preset_armed = 'level-6' so the frontier
    simulator guard lets us through. Idempotent upsert of doc id=current."""
    section("prep: .soc-difficulty-state/current preset_armed=level-6")
    body = {
        "doc": {
            "@timestamp": now_iso(),
            "preset_armed": "level-6",
            "armed_by": "mirror_validation_2026_04_17",
        },
        "doc_as_upsert": True,
    }
    r = req("POST", "/.soc-difficulty-state/_update/current?refresh=wait_for", body)
    print(f"update result={r.get('result')} _id={r.get('_id')}")


def frontier_simulator_tick() -> dict:
    """Mirror of soc-argus-frontier-simulator.yaml."""
    section("soc-argus-frontier-simulator (mirror, single tick)")

    corpus_id = "argus-corpus-mythos-2026-04"
    corpus_index = ".soc-eval-corpus-argus-corpus-mythos-2026-04"
    emission_source = "soc-argus-frontier-simulator"

    # 1. preset_state + gate_preset_armed
    try:
        preset = req("GET", "/.soc-difficulty-state/_doc/current")
    except urllib.error.HTTPError as e:
        preset = {"found": False, "error": f"HTTP {e.code}"}
    armed = (
        preset.get("_source", {}).get("preset_armed") == "level-6"
        if preset.get("found")
        else False
    )
    print(f"step=preset_state armed={armed} preset_armed={preset.get('_source', {}).get('preset_armed')}")
    if not armed:
        print("  guard-not-armed: emitting skipped heartbeat")
        req(
            "POST",
            "/.soc-audit-trail/_doc",
            {
                "@timestamp": now_iso(),
                "event_type": "argus_frontier_simulator_skipped",
                "source": emission_source,
                "reason": "preset_not_armed",
            },
        )
        return {"skipped": True}

    # 2. pick_variant — function_score random over corpus
    query = {
        "size": 1,
        "query": {
            "function_score": {
                "query": {
                    "bool": {
                        "filter": [
                            {"term": {"_argus.corpus_id": corpus_id}},
                            {"term": {"_argus.should_fire": True}},
                        ]
                    }
                },
                "random_score": {},
                "boost_mode": "replace",
            }
        },
    }
    picked = req("POST", f"/{urllib.parse.quote(corpus_index)}/_search", query)
    hits = picked.get("hits", {}).get("hits", [])
    if not hits:
        print("step=pick_variant variant_bank_empty=yes")
        req(
            "POST",
            "/.soc-audit-trail/_doc",
            {
                "@timestamp": now_iso(),
                "event_type": "argus_frontier_simulator_error",
                "source": emission_source,
                "reason": "variant_bank_empty",
                "corpus_id": corpus_id,
            },
        )
        return {"skipped": True}

    variant = hits[0]["_source"]
    argus_env = variant.get("_argus", {})
    primitive_id = argus_env.get("primitive_id", "unknown")
    variant_axis = argus_env.get("variant_axis", "unknown")
    variant_index = argus_env.get("variant_index", -1)
    print(
        f"step=pick_variant primitive_id={primitive_id} axis={variant_axis} idx={variant_index}"
    )

    # 3. emit_variant — re-index with fresh ts + emission id
    emission_id = f"{int(time.time())}-{primitive_id}"
    emit_doc = {
        "@timestamp": now_iso(),
        "_argus": {
            **argus_env,
            "source": emission_source,
            "is_simulation_emission": True,
            "emission_id": emission_id,
        },
    }
    for field in ("host", "user", "process", "event", "file", "network", "destination"):
        if field in variant:
            emit_doc[field] = variant[field]
    emission_source_field = variant.get("source")
    if emission_source_field is not None:
        emit_doc["source"] = emission_source_field
    r = req(
        "POST",
        f"/{urllib.parse.quote(corpus_index)}/_doc?refresh=wait_for",
        emit_doc,
    )
    print(
        f"step=emit_variant _id={r.get('_id')} result={r.get('result')} emission_id={emission_id}"
    )

    # 4. heartbeat
    req(
        "POST",
        "/.soc-audit-trail/_doc",
        {
            "@timestamp": now_iso(),
            "event_type": "argus_frontier_simulator_tick",
            "source": emission_source,
            "corpus_id": corpus_id,
            "primitive_id": primitive_id,
            "variant_axis": variant_axis,
            "variant_index": variant_index,
            "emission_id": emission_id,
        },
    )
    print("step=heartbeat ok")
    return {
        "primitive_id": primitive_id,
        "variant_axis": variant_axis,
        "variant_index": variant_index,
        "emission_id": emission_id,
        "emitted_doc_id": r.get("_id"),
    }


def post_checks() -> dict:
    """Confirm side-effects landed via count + recent-doc queries."""
    section("post-checks")

    results = {}

    cmd = req(
        "POST",
        "/.soc-attack-commands/_search",
        {
            "size": 1,
            "query": {"term": {"source": "soc-argus-arm-mythos-preset"}},
            "sort": [{"@timestamp": {"order": "desc"}}],
        },
    )
    newest_cmd = cmd["hits"]["hits"][0]["_source"] if cmd["hits"]["hits"] else None
    print(
        "check=.soc-attack-commands newest_from_arm_preset_ts="
        + (newest_cmd.get("@timestamp") if newest_cmd else "none")
    )
    results["latest_attack_command"] = newest_cmd

    corpus = req(
        "POST",
        "/.soc-eval-corpus-argus-corpus-mythos-2026-04/_search",
        {
            "size": 1,
            "query": {"term": {"_argus.is_simulation_emission": True}},
            "sort": [{"@timestamp": {"order": "desc"}}],
        },
    )
    newest_emit = corpus["hits"]["hits"][0]["_source"] if corpus["hits"]["hits"] else None
    print(
        "check=.soc-eval-corpus-* newest_simulation_emission_ts="
        + (newest_emit.get("@timestamp") if newest_emit else "none")
    )
    results["latest_simulation_emission"] = newest_emit

    tick_count = req(
        "POST",
        "/.soc-audit-trail/_count",
        {
            "query": {
                "bool": {
                    "filter": [
                        {
                            "terms": {
                                "event_type": [
                                    "argus_mythos_preset_armed",
                                    "argus_frontier_simulator_tick",
                                    "argus_frontier_simulator_skipped",
                                    "argus_frontier_simulator_error",
                                ]
                            }
                        }
                    ]
                }
            }
        },
    )
    print(f"check=.soc-audit-trail argus_workflow_events_total={tick_count.get('count')}")
    results["audit_event_total"] = tick_count.get("count")

    return results


def main() -> int:
    report = {}
    try:
        report["arm_mythos_preset"] = arm_mythos_preset()
        arm_preset_armed_flag()
        report["frontier_simulator_tick_1"] = frontier_simulator_tick()
        time.sleep(1)
        report["frontier_simulator_tick_2"] = frontier_simulator_tick()
        report["post_checks"] = post_checks()
    except Exception as e:
        print(f"ERROR: {e.__class__.__name__}: {e}", file=sys.stderr)
        return 1

    section("summary")
    print(json.dumps(report, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())

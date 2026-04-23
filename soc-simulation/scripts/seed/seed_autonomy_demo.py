#!/usr/bin/env python3
"""
Seed autonomy-first demo data into the Elastic cluster.

Populates:
  - .soc-recommendations  : mutation_intent documents covering the full lifecycle
  - .soc-backtests        : before/after projections with verdicts
  - .soc-autonomy-decisions : append-only audit trail of every gate
  - .soc-snapshots        : immutable pre-mutation rule snapshots
  - .soc-trust-scores     : per-tier aggregate + per-agent rows with tiers

Realism:
  - References real rule UUIDs from the live cluster (top 7 by alert count)
  - Stages are coherent: every applied intent has a snapshot + decisions chain
  - Rolled_back intents have matching observer decisions + snapshot
  - Trust scores reflect per-agent history (trusted / probationary / observing /
    quarantined).

Idempotent-ish: uses `op_type: create` where a deterministic _id exists, otherwise
appends. Safe to run multiple times; duplicates will be emitted for decisions/
backtests (which are append-only by design).
"""
from __future__ import annotations

import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any

_ES_PORT = os.environ.get("ES_PORT", "19200")
ES_URL = os.environ.get("ES_URL", f"http://localhost:{_ES_PORT}")
ES_USER = os.environ.get("ES_USER", "elastic")
ES_PASS = os.environ.get("ES_PASS", "changeme")

random.seed(42)  # deterministic demo

UTC = timezone.utc
NOW = datetime.now(UTC).replace(microsecond=0)


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def hours_ago(h: float) -> datetime:
    return NOW - timedelta(hours=h)


def minutes_ago(m: float) -> datetime:
    return NOW - timedelta(minutes=m)


def es_post(path: str, body: Any, content_type: str = "application/json") -> dict:
    data = body if isinstance(body, (bytes, str)) else json.dumps(body)
    if isinstance(data, str):
        data = data.encode("utf-8")
    req = urllib.request.Request(
        url=f"{ES_URL}{path}",
        data=data,
        method="POST",
        headers={"Content-Type": content_type},
    )
    import base64

    token = base64.b64encode(f"{ES_USER}:{ES_PASS}".encode()).decode()
    req.add_header("Authorization", f"Basic {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"HTTP {e.code} {path}: {body[:400]}")


DATA_STREAM_INDICES = {".soc-autonomy-decisions"}


def bulk_index(index: str, docs: list[dict]) -> dict:
    lines = []
    is_data_stream = index in DATA_STREAM_INDICES
    for d in docs:
        _id = d.pop("_id", None)
        op = "create" if is_data_stream else "index"
        meta = {op: {"_index": index}}
        if _id and not is_data_stream:
            meta[op]["_id"] = _id
        lines.append(json.dumps(meta))
        lines.append(json.dumps(d))
    payload = ("\n".join(lines) + "\n").encode("utf-8")
    return es_post("/_bulk?refresh=false", payload, content_type="application/x-ndjson")


# Real rule UUIDs from the live cluster
RULES = [
    {
        "id": "b3db65c3-5d1b-4b5b-b12d-0723f78ad26b",
        "name": "[SOC-Sim] Shell Command Execution (T1059.004)",
        "technique": "T1059.004",
        "baseline_alerts_per_day": 232,
        "baseline_fp_rate": 0.72,
    },
    {
        "id": "0f89e859-aa51-490e-8e6a-e1583bb28da4",
        "name": "SOC Sim - System Discovery (T1033)",
        "technique": "T1033",
        "baseline_alerts_per_day": 135,
        "baseline_fp_rate": 0.64,
    },
    {
        "id": "854a189e-b1a5-40ac-b56e-c7dc11ae1c6d",
        "name": "[SOC-Sim] System Owner/User Discovery (T1033)",
        "technique": "T1033",
        "baseline_alerts_per_day": 96,
        "baseline_fp_rate": 0.58,
    },
    {
        "id": "68a5b14f-db55-4692-87ee-d5e36cafeb7f",
        "name": "SOC Sim - Crypto Mining (T1496)",
        "technique": "T1496",
        "baseline_alerts_per_day": 63,
        "baseline_fp_rate": 0.31,
    },
    {
        "id": "e78961fc-626d-48b2-8a97-dee6da617966",
        "name": "[SOC-Sim] Crypto Mining Activity (T1496)",
        "technique": "T1496",
        "baseline_alerts_per_day": 59,
        "baseline_fp_rate": 0.35,
    },
    {
        "id": "fae21fc3-886e-4001-a402-cd0433248ff2",
        "name": "SOC Sim - Shell Execution (T1059.004)",
        "technique": "T1059.004",
        "baseline_alerts_per_day": 7,
        "baseline_fp_rate": 0.2,
    },
    {
        "id": "8647a1c4-28b9-4705-85cd-0b8bb7588011",
        "name": "SOC Sim - Suspicious Shell Execution (T1059.004)",
        "technique": "T1059.004",
        "baseline_alerts_per_day": 7,
        "baseline_fp_rate": 0.18,
    },
]

# Author agents for mutation intents. `executor` is the applier agent; the author
# trust tier determines whether the applier auto-applies or defers.
AGENTS = {
    "default": {"tier": "probationary", "trust_score": 0.78, "rollbacks_24h": 1},
    "experimental-tuner-v3": {"tier": "quarantined", "trust_score": 0.35, "rollbacks_24h": 3},
}

EXECUTOR = "soc-autonomous-applier-agent"


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------


def build_patch(rule: dict, new_interval: str, new_threshold: int) -> dict:
    return {
        "action": "raise_threshold",
        "rule_id": rule["id"],
        "rule_name": rule["name"],
        "rule_type": "query",
        "current_values": {
            "interval": "5m",
            "threshold_count": 5,
            "enabled": True,
            "severity": "medium",
        },
        "patch_fields": {
            "interval": new_interval,
            "threshold_count": new_threshold,
        },
        "impact_prediction": {
            "expected_fp_reduction_pct": random.randint(40, 85),
            "expected_tp_impact": "preserve",
            "tp_preservation_pct": random.randint(92, 100),
            "alerts_per_day_after": max(1, int(rule["baseline_alerts_per_day"] * random.uniform(0.15, 0.55))),
        },
        "reason": (
            f"Baseline {rule['baseline_alerts_per_day']} alerts/day with "
            f"{int(rule['baseline_fp_rate']*100)}% FP. Tighter threshold and longer "
            f"interval project to reduce FP dominance while preserving attack hits."
        ),
    }


def build_mutation_intent(
    *,
    rec_id: str,
    timestamp: datetime,
    rule: dict,
    source_agent: str,
    status: str,
    patch: dict,
    extra: dict | None = None,
) -> dict:
    confidence = random.randint(72, 98)
    doc = {
        "_id": rec_id,
        "@timestamp": iso(timestamp),
        "schema_version": 1,
        "rec_id": rec_id,
        "type": "mutation_intent",
        "source": source_agent,
        "source_doc_id": f"outcome-{random.randint(1000, 9999)}",
        "status": status,
        "title": f"Tune rule: {rule['name']}",
        "summary": (
            f"Reduce noise on {rule['name']} by tightening threshold "
            f"{patch['current_values']['threshold_count']} -> "
            f"{patch['patch_fields']['threshold_count']} and extending interval "
            f"{patch['current_values']['interval']} -> {patch['patch_fields']['interval']}."
        ),
        "details": {
            "artifact_type": "rule",
            "artifact_id": rule["id"],
            "op": "update",
            "expected_ownership": "canonical",
            "reason": (
                f"Tactical tuning to reduce false-positive load on {rule['name']} "
                f"based on 7-day triage outcomes and backtest projections."
            ),
            "patch": patch,
            "target_service": "security_solution",
        },
        "reasoning": (
            f"{source_agent} observed {rule['baseline_alerts_per_day']} alerts/day "
            f"on {rule['name']} with majority FP disposition in .soc-outcomes over "
            f"the last 7 days. Tightening thresholds projects to reduce volume "
            f"without dropping TPs from Caldera red-team runs."
        ),
        "confidence": confidence,
        "track": "agentic",
        "housekeeping": False,
        "expected_impact": {
            "fp_reduction_pct": float(patch["impact_prediction"]["expected_fp_reduction_pct"]),
            "tp_gain_pct": 0.0,
            "mttr_reduction_minutes": random.uniform(2, 11),
            "hours_saved_per_week": random.uniform(1.2, 6.5),
            "coverage_delta_pct": 0.0,
        },
        "evidence": [
            {
                "summary": (
                    f"7-day baseline: {rule['baseline_alerts_per_day']} alerts/day, "
                    f"FP rate {int(rule['baseline_fp_rate']*100)}%"
                ),
                "source_ref": f".soc-outcomes?rule_id={rule['id']}",
                "confidence": 0.9,
            },
            {
                "summary": "Triage verdicts skew false-positive for low-effort recon patterns",
                "source_ref": ".soc-triage/triage_verdict:false_positive",
                "confidence": 0.85,
            },
        ],
    }
    if extra:
        doc.update(extra)
    return doc


def build_backtest(*, rec_id: str, rule: dict, patch: dict, verdict: str, timestamp: datetime) -> dict:
    before_alerts = rule["baseline_alerts_per_day"] * 7
    after_alerts = patch["impact_prediction"]["alerts_per_day_after"] * 7
    fp_red = patch["impact_prediction"]["expected_fp_reduction_pct"]
    tp_preserve = patch["impact_prediction"]["tp_preservation_pct"]
    removed = max(0, before_alerts - after_alerts)
    return {
        "@timestamp": iso(timestamp),
        "rec_id": rec_id,
        "rule_id": rule["id"],
        "rule_type": "query",
        "action": "update_rule",
        "op": "update",
        "window_start": iso(timestamp - timedelta(days=7)),
        "window_end": iso(timestamp),
        "window_days": 7,
        "current_rule_snapshot": {"interval": "5m", "threshold_count": 5},
        "proposed_rule_snapshot": {
            "interval": patch["patch_fields"]["interval"],
            "threshold_count": patch["patch_fields"]["threshold_count"],
        },
        "metrics": {
            "before": {
                "alert_count": before_alerts,
                "distinct_hosts": random.randint(18, 54),
                "distinct_users": random.randint(12, 40),
                "alerts_per_day": float(rule["baseline_alerts_per_day"]),
            },
            "after": {
                "alert_count": after_alerts,
                "distinct_hosts": random.randint(8, 30),
                "distinct_users": random.randint(6, 24),
                "alerts_per_day": float(patch["impact_prediction"]["alerts_per_day_after"]),
            },
            "delta": {
                "alert_reduction_pct": round(((before_alerts - after_alerts) / max(1, before_alerts)) * 100, 2),
                "net_alert_volume": -removed,
                "fp_reduction_pct": float(fp_red),
                "tp_preservation_pct": float(tp_preserve),
                "removed_hits": removed,
                "added_hits": 0,
                "preserved_hits": after_alerts,
            },
        },
        "tp_misses": (
            []
            if verdict in ("projection_safe",)
            else [
                {
                    "alert_id": f"alert-{random.randint(100000, 999999)}",
                    "host_name": f"host-{random.randint(1, 200)}",
                    "triage_verdict": "true_positive",
                    "alerted_at": iso(timestamp - timedelta(days=random.randint(1, 6))),
                }
                for _ in range(random.randint(1, 3))
            ]
        ),
        "verdict": verdict,
        "verdict_reason": {
            "projection_safe": (
                f"Net FP reduction {fp_red}%, TPs preserved at {tp_preserve}%, "
                f"no regression signals in historical window."
            ),
            "projection_concerning": (
                f"FP reduction {fp_red}% but TP preservation only {tp_preserve}% — "
                f"defer to human review."
            ),
            "projection_unsafe": (
                f"Projected TP misses exceed threshold. Reject auto-apply; flag for "
                f"Principal DetEng review."
            ),
        }.get(verdict, "unknown"),
        "computed_at": iso(timestamp),
        "computed_by": "soc-rule-backtester",
        "compute_duration_ms": random.randint(420, 1800),
        "simulator_used": "historical_alerts_window_7d",
    }


def build_decision(
    *,
    rec_id: str,
    timestamp: datetime,
    rule: dict,
    source_agent: str,
    gates_evaluated: list[str],
    gates_passed: list[str],
    first_failing_gate: str | None,
    final_status: str,
    auto_applied: bool,
    required_human: bool,
    review_reason: str | None,
    trust_tier: str,
    trust_score: float,
    trust_n: int,
    backtest_verdict: str | None,
    backtest_ref: str | None,
    confidence: int,
    duration_ms: int,
    action: str = "update_rule",
) -> dict:
    return {
        "@timestamp": iso(timestamp),
        "rec_id": rec_id,
        "artifact_type": "detection_rule",
        "artifact_id": rule["id"],
        "op": "update",
        "action": action,
        "source_agent": source_agent,
        "source_workflow": "soc-autonomous-applier",
        "gates_evaluated": gates_evaluated,
        "gates_passed": gates_passed,
        "first_failing_gate": first_failing_gate,
        "final_status": final_status,
        "auto_applied": auto_applied,
        "required_human": required_human,
        "review_reason": review_reason,
        "trust_tier": trust_tier,
        "trust_score": round(trust_score, 3),
        "trust_n": trust_n,
        "backtest_verdict": backtest_verdict,
        "backtest_ref": backtest_ref,
        "confidence": confidence,
        "decision_duration_ms": duration_ms,
    }


def build_snapshot(*, rec_id: str, rule: dict, timestamp: datetime) -> dict:
    return {
        "@timestamp": iso(timestamp),
        "rec_id": rec_id,
        "artifact_type": "detection_rule",
        "artifact_id": rule["id"],
        "reason": "pre_mutation_snapshot",
        "captured_by": "soc-autonomous-applier",
        "snapshot": {
            "rule_id": rule["id"],
            "name": rule["name"],
            "type": "query",
            "interval": "5m",
            "threshold": {"field": [], "value": 5},
            "severity": "medium",
            "enabled": True,
            "from": "now-60s",
            "to": "now",
            "query": (
                "process.name:(bash OR sh OR zsh) AND event.action:\"exec\""
            ),
            "index": ["logs-*", "filebeat-*"],
        },
    }


# ---------------------------------------------------------------------------
# Scenario generation
# ---------------------------------------------------------------------------


def gen_trusted_auto_apply(seq: int, hours_back: float) -> dict:
    rule = RULES[seq % len(RULES)]
    rec_id = f"mi-trusted-{seq:03d}"
    ts0 = hours_ago(hours_back + 0.1)
    ts_propose = ts0
    ts_backtest = ts0 + timedelta(minutes=2)
    ts_snapshot = ts0 + timedelta(minutes=3)
    ts_applied = ts0 + timedelta(minutes=4)
    patch = build_patch(rule, new_interval="10m", new_threshold=random.randint(10, 20))
    source_agent = "default"
    agent_meta = AGENTS[source_agent]
    docs = {}
    docs["rec_applied"] = build_mutation_intent(
        rec_id=rec_id,
        timestamp=ts_applied,
        rule=rule,
        source_agent=source_agent,
        status="applied",
        patch=patch,
        extra={
            "applied_at": iso(ts_applied),
            "reviewed_by": "autosoc-auto",
            "reviewed_at": iso(ts_applied),
            "review_decision": "auto_applied",
        },
    )
    docs["backtest"] = build_backtest(
        rec_id=rec_id, rule=rule, patch=patch, verdict="projection_safe", timestamp=ts_backtest
    )
    docs["snapshot"] = build_snapshot(rec_id=rec_id, rule=rule, timestamp=ts_snapshot)
    gates = [
        "envelope_valid",
        "trust_tier",
        "backtest_verdict",
        "drift_check",
        "snapshot_taken",
        "kill_switch",
        "freeze_window",
    ]
    docs["decisions"] = [
        build_decision(
            rec_id=rec_id,
            timestamp=ts_propose + timedelta(seconds=5),
            rule=rule,
            source_agent=source_agent,
            gates_evaluated=["envelope_valid"],
            gates_passed=["envelope_valid"],
            first_failing_gate=None,
            final_status="pending_backtest",
            auto_applied=False,
            required_human=False,
            review_reason=None,
            trust_tier=agent_meta["tier"],
            trust_score=agent_meta["trust_score"],
            trust_n=42,
            backtest_verdict=None,
            backtest_ref=None,
            confidence=docs["rec_applied"]["confidence"],
            duration_ms=random.randint(120, 380),
        ),
        build_decision(
            rec_id=rec_id,
            timestamp=ts_backtest + timedelta(seconds=3),
            rule=rule,
            source_agent=source_agent,
            gates_evaluated=gates[:3],
            gates_passed=gates[:3],
            first_failing_gate=None,
            final_status="auto_apply_ready",
            auto_applied=False,
            required_human=False,
            review_reason=None,
            trust_tier=agent_meta["tier"],
            trust_score=agent_meta["trust_score"],
            trust_n=42,
            backtest_verdict="projection_safe",
            backtest_ref=rec_id,
            confidence=docs["rec_applied"]["confidence"],
            duration_ms=random.randint(620, 1400),
        ),
        build_decision(
            rec_id=rec_id,
            timestamp=ts_applied + timedelta(seconds=2),
            rule=rule,
            source_agent=source_agent,
            gates_evaluated=gates,
            gates_passed=gates,
            first_failing_gate=None,
            final_status="applied",
            auto_applied=True,
            required_human=False,
            review_reason=None,
            trust_tier=agent_meta["tier"],
            trust_score=agent_meta["trust_score"],
            trust_n=42,
            backtest_verdict="projection_safe",
            backtest_ref=rec_id,
            confidence=docs["rec_applied"]["confidence"],
            duration_ms=random.randint(1100, 2400),
        ),
    ]
    return docs


def gen_probationary_backtest_then_apply(seq: int, hours_back: float) -> dict:
    rule = RULES[(seq + 3) % len(RULES)]
    rec_id = f"mi-probationary-{seq:03d}"
    ts0 = hours_ago(hours_back)
    patch = build_patch(rule, new_interval="15m", new_threshold=random.randint(8, 15))
    source_agent = "default"
    agent_meta = AGENTS[source_agent]
    docs = {}
    ts_propose = ts0
    ts_backtest = ts0 + timedelta(minutes=4)
    ts_snapshot = ts0 + timedelta(minutes=6)
    ts_applied = ts0 + timedelta(minutes=7)
    docs["rec_applied"] = build_mutation_intent(
        rec_id=rec_id,
        timestamp=ts_applied,
        rule=rule,
        source_agent=source_agent,
        status="applied",
        patch=patch,
        extra={
            "applied_at": iso(ts_applied),
            "review_decision": "auto_applied_after_backtest",
        },
    )
    docs["backtest"] = build_backtest(
        rec_id=rec_id, rule=rule, patch=patch, verdict="projection_safe", timestamp=ts_backtest
    )
    docs["snapshot"] = build_snapshot(rec_id=rec_id, rule=rule, timestamp=ts_snapshot)
    gates = [
        "envelope_valid",
        "trust_tier",
        "backtest_verdict",
        "drift_check",
        "snapshot_taken",
        "kill_switch",
    ]
    docs["decisions"] = [
        build_decision(
            rec_id=rec_id,
            timestamp=ts_backtest + timedelta(seconds=2),
            rule=rule,
            source_agent=source_agent,
            gates_evaluated=gates[:3],
            gates_passed=gates[:3],
            first_failing_gate=None,
            final_status="auto_apply_ready",
            auto_applied=False,
            required_human=False,
            review_reason=None,
            trust_tier=agent_meta["tier"],
            trust_score=agent_meta["trust_score"],
            trust_n=18,
            backtest_verdict="projection_safe",
            backtest_ref=rec_id,
            confidence=docs["rec_applied"]["confidence"],
            duration_ms=random.randint(820, 1600),
        ),
        build_decision(
            rec_id=rec_id,
            timestamp=ts_applied + timedelta(seconds=1),
            rule=rule,
            source_agent=source_agent,
            gates_evaluated=gates,
            gates_passed=gates,
            first_failing_gate=None,
            final_status="applied",
            auto_applied=True,
            required_human=False,
            review_reason=None,
            trust_tier=agent_meta["tier"],
            trust_score=agent_meta["trust_score"],
            trust_n=18,
            backtest_verdict="projection_safe",
            backtest_ref=rec_id,
            confidence=docs["rec_applied"]["confidence"],
            duration_ms=random.randint(1400, 2800),
        ),
    ]
    return docs


def gen_rolled_back(seq: int, hours_back: float) -> dict:
    rule = RULES[(seq + 2) % len(RULES)]
    rec_id = f"mi-rollback-{seq:03d}"
    ts0 = hours_ago(hours_back)
    patch = build_patch(rule, new_interval="20m", new_threshold=random.randint(20, 40))
    source_agent = random.choice(["experimental-tuner-v3", "default"])
    agent_meta = AGENTS[source_agent]
    ts_backtest = ts0 + timedelta(minutes=3)
    ts_snapshot = ts0 + timedelta(minutes=5)
    ts_applied = ts0 + timedelta(minutes=6)
    ts_observed = ts_applied + timedelta(minutes=random.randint(18, 42))
    patch["impact_prediction"]["tp_preservation_pct"] = random.randint(88, 95)
    docs = {}
    docs["rec_rollback"] = build_mutation_intent(
        rec_id=rec_id,
        timestamp=ts_observed,
        rule=rule,
        source_agent=source_agent,
        status="rolled_back",
        patch=patch,
        extra={
            "applied_at": iso(ts_applied),
            "rolled_back_at": iso(ts_observed),
            "rollback_reason": (
                "Post-apply observer detected TP regression: 3 true-positive alerts "
                "from Caldera red-team run suppressed. Reverted rule to pre-mutation "
                "snapshot."
            ),
            "review_decision": "auto_rolled_back_by_observer",
        },
    )
    docs["backtest"] = build_backtest(
        rec_id=rec_id,
        rule=rule,
        patch=patch,
        verdict="projection_concerning",
        timestamp=ts_backtest,
    )
    docs["snapshot"] = build_snapshot(rec_id=rec_id, rule=rule, timestamp=ts_snapshot)
    gates = [
        "envelope_valid",
        "trust_tier",
        "backtest_verdict",
        "drift_check",
        "snapshot_taken",
        "kill_switch",
    ]
    docs["decisions"] = [
        build_decision(
            rec_id=rec_id,
            timestamp=ts_applied + timedelta(seconds=2),
            rule=rule,
            source_agent=source_agent,
            gates_evaluated=gates,
            gates_passed=gates,
            first_failing_gate=None,
            final_status="applied",
            auto_applied=True,
            required_human=False,
            review_reason=None,
            trust_tier=agent_meta["tier"],
            trust_score=agent_meta["trust_score"],
            trust_n=12,
            backtest_verdict="projection_concerning",
            backtest_ref=rec_id,
            confidence=docs["rec_rollback"]["confidence"],
            duration_ms=random.randint(1700, 3100),
        ),
        build_decision(
            rec_id=rec_id,
            timestamp=ts_observed + timedelta(seconds=3),
            rule=rule,
            source_agent="soc-post-apply-observer",
            gates_evaluated=["post_apply_tp_regression"],
            gates_passed=[],
            first_failing_gate="post_apply_tp_regression",
            final_status="rolled_back",
            auto_applied=False,
            required_human=False,
            review_reason="tp_regression_detected",
            trust_tier=agent_meta["tier"],
            trust_score=agent_meta["trust_score"],
            trust_n=12,
            backtest_verdict="projection_concerning",
            backtest_ref=rec_id,
            confidence=docs["rec_rollback"]["confidence"],
            duration_ms=random.randint(640, 1500),
        ),
    ]
    return docs


def gen_pending_backtest(seq: int, hours_back: float) -> dict:
    rule = RULES[seq % len(RULES)]
    rec_id = f"mi-pending-bt-{seq:03d}"
    ts0 = minutes_ago(hours_back * 60)
    patch = build_patch(rule, new_interval="12m", new_threshold=random.randint(8, 15))
    source_agent = "default"
    agent_meta = AGENTS[source_agent]
    docs = {}
    docs["rec"] = build_mutation_intent(
        rec_id=rec_id,
        timestamp=ts0,
        rule=rule,
        source_agent=source_agent,
        status="pending_backtest",
        patch=patch,
    )
    docs["decisions"] = [
        build_decision(
            rec_id=rec_id,
            timestamp=ts0 + timedelta(seconds=3),
            rule=rule,
            source_agent=source_agent,
            gates_evaluated=["envelope_valid", "backtest_required"],
            gates_passed=["envelope_valid"],
            first_failing_gate="backtest_required",
            final_status="pending_backtest",
            auto_applied=False,
            required_human=False,
            review_reason="backtest_deferral",
            trust_tier=agent_meta["tier"],
            trust_score=agent_meta["trust_score"],
            trust_n=42,
            backtest_verdict=None,
            backtest_ref=None,
            confidence=docs["rec"]["confidence"],
            duration_ms=random.randint(80, 260),
        )
    ]
    return docs


def gen_auto_apply_ready(seq: int, hours_back: float) -> dict:
    rule = RULES[(seq + 1) % len(RULES)]
    rec_id = f"mi-ready-{seq:03d}"
    ts0 = minutes_ago(hours_back * 60)
    patch = build_patch(rule, new_interval="10m", new_threshold=random.randint(10, 18))
    source_agent = "default"
    agent_meta = AGENTS[source_agent]
    docs = {}
    docs["rec"] = build_mutation_intent(
        rec_id=rec_id,
        timestamp=ts0,
        rule=rule,
        source_agent=source_agent,
        status="auto_apply_ready",
        patch=patch,
    )
    docs["backtest"] = build_backtest(
        rec_id=rec_id, rule=rule, patch=patch, verdict="projection_safe", timestamp=ts0 + timedelta(minutes=3)
    )
    gates = ["envelope_valid", "trust_tier", "backtest_verdict"]
    docs["decisions"] = [
        build_decision(
            rec_id=rec_id,
            timestamp=ts0 + timedelta(minutes=3, seconds=5),
            rule=rule,
            source_agent=source_agent,
            gates_evaluated=gates,
            gates_passed=gates,
            first_failing_gate=None,
            final_status="auto_apply_ready",
            auto_applied=False,
            required_human=False,
            review_reason=None,
            trust_tier=agent_meta["tier"],
            trust_score=agent_meta["trust_score"],
            trust_n=42,
            backtest_verdict="projection_safe",
            backtest_ref=rec_id,
            confidence=docs["rec"]["confidence"],
            duration_ms=random.randint(420, 1100),
        )
    ]
    return docs


def gen_rejected_backtest(seq: int, hours_back: float) -> dict:
    rule = RULES[(seq + 4) % len(RULES)]
    rec_id = f"mi-rejected-bt-{seq:03d}"
    ts0 = hours_ago(hours_back)
    patch = build_patch(rule, new_interval="30m", new_threshold=random.randint(25, 50))
    source_agent = "experimental-tuner-v3"
    agent_meta = AGENTS[source_agent]
    patch["impact_prediction"]["tp_preservation_pct"] = random.randint(65, 82)
    docs = {}
    docs["rec"] = build_mutation_intent(
        rec_id=rec_id,
        timestamp=ts0 + timedelta(minutes=4),
        rule=rule,
        source_agent=source_agent,
        status="rejected_backtest",
        patch=patch,
        extra={
            "review_decision": "auto_rejected_by_backtester",
            "rejection_reason": (
                f"Backtest projected {patch['impact_prediction']['tp_preservation_pct']}% TP "
                f"preservation — below 90% safety floor."
            ),
        },
    )
    docs["backtest"] = build_backtest(
        rec_id=rec_id, rule=rule, patch=patch, verdict="projection_unsafe", timestamp=ts0 + timedelta(minutes=3)
    )
    gates = ["envelope_valid", "trust_tier", "backtest_verdict"]
    docs["decisions"] = [
        build_decision(
            rec_id=rec_id,
            timestamp=ts0 + timedelta(minutes=3, seconds=5),
            rule=rule,
            source_agent=source_agent,
            gates_evaluated=gates,
            gates_passed=["envelope_valid", "trust_tier"],
            first_failing_gate="backtest_verdict",
            final_status="rejected_backtest",
            auto_applied=False,
            required_human=False,
            review_reason="backtest_projection_unsafe",
            trust_tier=agent_meta["tier"],
            trust_score=agent_meta["trust_score"],
            trust_n=9,
            backtest_verdict="projection_unsafe",
            backtest_ref=rec_id,
            confidence=docs["rec"]["confidence"],
            duration_ms=random.randint(520, 1400),
        )
    ]
    return docs


def gen_rejected_drift(seq: int, hours_back: float) -> dict:
    rule = RULES[(seq + 5) % len(RULES)]
    rec_id = f"mi-rejected-drift-{seq:03d}"
    ts0 = hours_ago(hours_back)
    patch = build_patch(rule, new_interval="8m", new_threshold=random.randint(8, 14))
    source_agent = "default"
    agent_meta = AGENTS[source_agent]
    docs = {}
    docs["rec"] = build_mutation_intent(
        rec_id=rec_id,
        timestamp=ts0 + timedelta(minutes=5),
        rule=rule,
        source_agent=source_agent,
        status="rejected_drift",
        patch=patch,
        extra={
            "review_decision": "auto_rejected_drift",
            "rejection_reason": (
                "Drift check: rule already modified since proposal. current_values "
                "mismatch. Upstream state moved; re-evaluate required."
            ),
        },
    )
    docs["backtest"] = build_backtest(
        rec_id=rec_id, rule=rule, patch=patch, verdict="projection_safe", timestamp=ts0 + timedelta(minutes=3)
    )
    gates = ["envelope_valid", "trust_tier", "backtest_verdict", "drift_check"]
    docs["decisions"] = [
        build_decision(
            rec_id=rec_id,
            timestamp=ts0 + timedelta(minutes=5, seconds=10),
            rule=rule,
            source_agent=source_agent,
            gates_evaluated=gates,
            gates_passed=gates[:3],
            first_failing_gate="drift_check",
            final_status="rejected_drift",
            auto_applied=False,
            required_human=False,
            review_reason="upstream_state_drift",
            trust_tier=agent_meta["tier"],
            trust_score=agent_meta["trust_score"],
            trust_n=22,
            backtest_verdict="projection_safe",
            backtest_ref=rec_id,
            confidence=docs["rec"]["confidence"],
            duration_ms=random.randint(720, 1700),
        )
    ]
    return docs


def gen_pending_review(seq: int, hours_back: float) -> dict:
    rule = RULES[(seq + 6) % len(RULES)]
    rec_id = f"mi-review-{seq:03d}"
    ts0 = hours_ago(hours_back)
    patch = build_patch(rule, new_interval="15m", new_threshold=random.randint(15, 25))
    source_agent = "experimental-tuner-v3"
    agent_meta = AGENTS[source_agent]
    docs = {}
    docs["rec"] = build_mutation_intent(
        rec_id=rec_id,
        timestamp=ts0,
        rule=rule,
        source_agent=source_agent,
        status="pending_review",
        patch=patch,
        extra={
            "review_decision": None,
            "review_reason": "author_trust_tier_quarantined",
        },
    )
    docs["backtest"] = build_backtest(
        rec_id=rec_id, rule=rule, patch=patch, verdict="projection_concerning", timestamp=ts0 + timedelta(minutes=3)
    )
    gates = ["envelope_valid", "trust_tier"]
    docs["decisions"] = [
        build_decision(
            rec_id=rec_id,
            timestamp=ts0 + timedelta(seconds=5),
            rule=rule,
            source_agent=source_agent,
            gates_evaluated=gates,
            gates_passed=["envelope_valid"],
            first_failing_gate="trust_tier",
            final_status="pending_review",
            auto_applied=False,
            required_human=True,
            review_reason="author_trust_tier_quarantined",
            trust_tier=agent_meta["tier"],
            trust_score=agent_meta["trust_score"],
            trust_n=9,
            backtest_verdict=None,
            backtest_ref=None,
            confidence=docs["rec"]["confidence"],
            duration_ms=random.randint(180, 420),
        )
    ]
    return docs


def gen_applying_inflight(seq: int, hours_back: float) -> dict:
    rule = RULES[(seq + 1) % len(RULES)]
    rec_id = f"mi-applying-{seq:03d}"
    ts0 = minutes_ago(hours_back * 60)
    patch = build_patch(rule, new_interval="10m", new_threshold=random.randint(10, 16))
    source_agent = "default"
    agent_meta = AGENTS[source_agent]
    docs = {}
    docs["rec"] = build_mutation_intent(
        rec_id=rec_id,
        timestamp=ts0,
        rule=rule,
        source_agent=source_agent,
        status="applying",
        patch=patch,
    )
    docs["backtest"] = build_backtest(
        rec_id=rec_id, rule=rule, patch=patch, verdict="projection_safe", timestamp=ts0 + timedelta(minutes=2)
    )
    docs["snapshot"] = build_snapshot(rec_id=rec_id, rule=rule, timestamp=ts0 + timedelta(minutes=3))
    gates = ["envelope_valid", "trust_tier", "backtest_verdict", "drift_check", "snapshot_taken"]
    docs["decisions"] = [
        build_decision(
            rec_id=rec_id,
            timestamp=ts0 + timedelta(minutes=3, seconds=2),
            rule=rule,
            source_agent=source_agent,
            gates_evaluated=gates,
            gates_passed=gates,
            first_failing_gate=None,
            final_status="applying",
            auto_applied=False,
            required_human=False,
            review_reason=None,
            trust_tier=agent_meta["tier"],
            trust_score=agent_meta["trust_score"],
            trust_n=42,
            backtest_verdict="projection_safe",
            backtest_ref=rec_id,
            confidence=docs["rec"]["confidence"],
            duration_ms=random.randint(1100, 2200),
        )
    ]
    return docs


# ---------------------------------------------------------------------------
# Build and write
# ---------------------------------------------------------------------------


def main() -> int:
    recs: list[dict] = []
    backtests: list[dict] = []
    decisions: list[dict] = []
    snapshots: list[dict] = []

    # Trusted auto-apply: 18 spread across 72 hours
    for i in range(18):
        d = gen_trusted_auto_apply(i, hours_back=72 * (i + 1) / 18)
        recs.append(d["rec_applied"])
        backtests.append(d["backtest"])
        snapshots.append(d["snapshot"])
        decisions.extend(d["decisions"])

    # Probationary backtest-then-apply: 8
    for i in range(8):
        d = gen_probationary_backtest_then_apply(i, hours_back=72 * (i + 1) / 8 - 0.2)
        recs.append(d["rec_applied"])
        backtests.append(d["backtest"])
        snapshots.append(d["snapshot"])
        decisions.extend(d["decisions"])

    # Rolled back: 6
    for i in range(6):
        d = gen_rolled_back(i, hours_back=36 * (i + 1) / 6)
        recs.append(d["rec_rollback"])
        backtests.append(d["backtest"])
        snapshots.append(d["snapshot"])
        decisions.extend(d["decisions"])

    # Pending backtest (in-flight): 6
    for i in range(6):
        d = gen_pending_backtest(i, hours_back=(i + 1) * 0.35)
        recs.append(d["rec"])
        decisions.extend(d["decisions"])

    # Auto-apply ready (waiting for applier): 7
    for i in range(7):
        d = gen_auto_apply_ready(i, hours_back=(i + 1) * 0.2 + 0.1)
        recs.append(d["rec"])
        backtests.append(d["backtest"])
        decisions.extend(d["decisions"])

    # Applying in-flight: 3
    for i in range(3):
        d = gen_applying_inflight(i, hours_back=0.05 + i * 0.03)
        recs.append(d["rec"])
        backtests.append(d["backtest"])
        snapshots.append(d["snapshot"])
        decisions.extend(d["decisions"])

    # Rejected backtest: 4
    for i in range(4):
        d = gen_rejected_backtest(i, hours_back=24 * (i + 1) / 4)
        recs.append(d["rec"])
        backtests.append(d["backtest"])
        decisions.extend(d["decisions"])

    # Rejected drift: 3
    for i in range(3):
        d = gen_rejected_drift(i, hours_back=18 * (i + 1) / 3)
        recs.append(d["rec"])
        backtests.append(d["backtest"])
        decisions.extend(d["decisions"])

    # Pending review (quarantined author): 4
    for i in range(4):
        d = gen_pending_review(i, hours_back=24 * (i + 1) / 4)
        recs.append(d["rec"])
        backtests.append(d["backtest"])
        decisions.extend(d["decisions"])

    # Trust scores — per-agent rows
    trust_scores: list[dict] = []
    for agent_id, meta in AGENTS.items():
        applied = sum(1 for r in recs if r.get("source") == agent_id and r.get("status") == "applied")
        rolled = sum(1 for r in recs if r.get("source") == agent_id and r.get("status") == "rolled_back")
        rejected = sum(
            1
            for r in recs
            if r.get("source") == agent_id and r.get("status", "").startswith("rejected_")
        )
        total = sum(1 for r in recs if r.get("source") == agent_id)
        approval_rate = applied / max(1, total) if total else 0.0
        trust_scores.append(
            {
                "@timestamp": iso(NOW),
                "source": "soc-trust-scorer",
                "scope": "per_agent",
                "agent_id": agent_id,
                "window_days": 7,
                "trust_tier": meta["tier"],
                "trust_score": meta["trust_score"],
                "total_intents": total,
                "applied_count": applied,
                "rolled_back_count": rolled,
                "rejected_count": rejected,
                "rollbacks_24h": meta["rollbacks_24h"],
                "approval_rate": round(approval_rate, 3),
                "auto_approve_eligible": meta["tier"] in ("trusted", "probationary"),
                "confidence_threshold": 0.95 if meta["tier"] == "trusted" else 0.90,
            }
        )
    # Legacy aggregate tier rows (Tier 1/2/3 as the original workflow emits)
    tier_totals = {"tier_1_workflows": {"applied": 0, "rejected": 0, "total": 0}}
    for r in recs:
        tier_totals["tier_1_workflows"]["total"] += 1
        if r.get("status") == "applied":
            tier_totals["tier_1_workflows"]["applied"] += 1
        elif r.get("status", "").startswith("rejected_"):
            tier_totals["tier_1_workflows"]["rejected"] += 1
    t1 = tier_totals["tier_1_workflows"]
    trust_scores.append(
        {
            "@timestamp": iso(NOW),
            "source": "soc-trust-scorer",
            "scope": "legacy_aggregate",
            "tier": "tier_1_workflows",
            "window_days": 7,
            "total_proposals": t1["total"],
            "approved_count": t1["applied"],
            "rejected_count": t1["rejected"],
            "applied_count": t1["applied"],
            "failed_count": 0,
            "approval_rate": round(t1["applied"] / max(1, t1["total"]), 3),
            "auto_approve_eligible": (t1["applied"] / max(1, t1["total"])) >= 0.9 and t1["total"] >= 5,
            "confidence_threshold": 0.95,
        }
    )

    print(
        f"Generated: recs={len(recs)} backtests={len(backtests)} "
        f"decisions={len(decisions)} snapshots={len(snapshots)} trust_rows={len(trust_scores)}"
    )

    def chunked_bulk(index: str, docs: list[dict], chunk: int = 200) -> None:
        for i in range(0, len(docs), chunk):
            batch = [dict(d) for d in docs[i : i + chunk]]
            resp = bulk_index(index, batch)
            if resp.get("errors"):
                first_err = None
                for item in resp.get("items", []):
                    for op_key in ("index", "create"):
                        entry = item.get(op_key)
                        if entry and "error" in entry:
                            first_err = entry["error"]
                            break
                    if first_err:
                        break
                raise RuntimeError(f"bulk errors -> {index}: {first_err}")

    chunked_bulk(".soc-recommendations", recs)
    chunked_bulk(".soc-backtests", backtests)
    chunked_bulk(".soc-autonomy-decisions", decisions)
    chunked_bulk(".soc-snapshots", snapshots)
    chunked_bulk(".soc-trust-scores", trust_scores)

    # Force refresh so dashboards see data immediately
    for idx in (
        ".soc-recommendations",
        ".soc-backtests",
        ".soc-autonomy-decisions",
        ".soc-snapshots",
        ".soc-trust-scores",
    ):
        es_post(f"/{idx}/_refresh", b"", content_type="application/json")

    print("Seeded all autonomy indices. Refresh triggered.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

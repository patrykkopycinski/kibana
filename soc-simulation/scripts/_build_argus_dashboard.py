#!/usr/bin/env python3
"""
Build the "Argus Operations Overview" dashboard in a running Kibana via the
saved-objects API, then export the bundle to NDJSON for check-in.

This is the _source of truth_ for the dashboard. Re-run it against a clean
Kibana to regenerate the NDJSON file under soc-simulation/dashboards/.

Implementation notes
--------------------
All non-markdown panels are **TSVB** (`type: "metrics"`) — a self-contained
visualization format that queries an index pattern directly without needing a
saved-object data-view reference. This keeps the dashboard bundle tiny and
portable: it can be imported into any Kibana with `.soc-*` data streams and
works immediately, with no pre-existing data views required.

We still provision a unified `argus-all-soc-dv` data view for the
"Audit in Discover" deep-link from the Argus Console header, but the
dashboard itself does not depend on it.

Usage
-----
    KBN_BASE=http://localhost:15601 KBN_AUTH=elastic:changeme \
        python3 soc-simulation/scripts/_build_argus_dashboard.py
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request
import uuid
from typing import Any

DEFAULT_BASE = os.environ.get("KBN_BASE", "http://localhost:15601")
DEFAULT_AUTH = os.environ.get("KBN_AUTH", "elastic:changeme")

DATA_VIEW_ID = "argus-all-soc-dv"
DATA_VIEW_TITLE = ".soc-*,.ds-.soc-*-*"
DATA_VIEW_NAME = "Argus — All SOC data"

DASHBOARD_ID = "argus-operations-overview"
DASHBOARD_TITLE = "Argus — Operations Overview"
DASHBOARD_DESCRIPTION = (
    "Unified view of every Argus action across telemetry, detection, mutation, "
    "response, and governance layers. Pair with the Argus Console at "
    "/app/security/argus for interactive drill-down."
)

# Time window the dashboard lands in by default. 24h gives enough backfill for
# the live ticker to look populated without pulling stale seed data.
DASHBOARD_DEFAULT_FROM = "now-24h"
DASHBOARD_DEFAULT_TO = "now"

INDEX_PATTERN = ".soc-*,.ds-.soc-*-*"

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
NDJSON_OUT = REPO_ROOT / "soc-simulation" / "dashboards" / "argus_operations_overview.ndjson"


def kbn_request(
    base: str,
    auth: str,
    method: str,
    path: str,
    body: Any | None = None,
    raw: bool = False,
) -> Any:
    data = None
    headers = {
        "Authorization": "Basic " + base64.b64encode(auth.encode()).decode(),
        "kbn-xsrf": "true",
    }
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{base}{path}", data=data, method=method, headers=headers)
    try:
        resp = urllib.request.urlopen(req)
        raw_body = resp.read()
    except urllib.error.HTTPError as err:
        print(f"ERROR {method} {path}: {err.code} {err.reason}", file=sys.stderr)
        print(err.read().decode(errors="replace"), file=sys.stderr)
        raise
    if raw:
        return raw_body
    if not raw_body:
        return None
    return json.loads(raw_body)


# ---------------------------------------------------------------------------
# Saved-object factories
# ---------------------------------------------------------------------------


def ensure_data_view(base: str, auth: str) -> None:
    """Idempotently create the unified .soc-* data view used by the Console's
    'Audit in Discover' deep-link. The dashboard itself does not use it."""
    body = {
        "data_view": {
            "id": DATA_VIEW_ID,
            "name": DATA_VIEW_NAME,
            "title": DATA_VIEW_TITLE,
            "timeFieldName": "@timestamp",
            "allowNoIndex": True,
        },
        "override": True,
    }
    kbn_request(base, auth, "POST", "/api/data_views/data_view", body)


def _gen_id() -> str:
    return str(uuid.uuid4())


def viz_markdown(so_id: str, markdown: str, title: str = "") -> dict[str, Any]:
    """Classic markdown vis — pure content, no data binding needed."""
    return {
        "type": "visualization",
        "id": so_id,
        "attributes": {
            "title": title,
            "description": "",
            "version": 1,
            "visState": json.dumps(
                {
                    "title": title,
                    "type": "markdown",
                    "params": {"markdown": markdown, "openLinksInNewTab": False, "fontSize": 12},
                    "aggs": [],
                }
            ),
            "uiStateJSON": "{}",
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps({"query": {"query": "", "language": "kuery"}, "filter": []})
            },
        },
        "references": [],
    }


def _tsvb_series(
    label: str,
    metrics: list[dict],
    chart_type: str = "line",
    color: str = "#68BC00",
    stacked: str = "none",
    fill: str = "0",
    split_mode: str = "everything",
    terms_field: str | None = None,
    terms_size: int = 10,
    filter_kuery: str | None = None,
) -> dict:
    series: dict[str, Any] = {
        "id": _gen_id(),
        "color": color,
        "split_mode": split_mode,
        "palette": {"type": "palette", "name": "default"},
        "metrics": metrics,
        "chart_type": chart_type,
        "fill": fill,
        "stacked": stacked,
        "label": label,
        "line_width": 1,
        "point_size": 3,
        "separate_axis": 0,
        "axis_position": "right",
        "formatter": "number",
        "hide_in_legend": 0,
    }
    if terms_field:
        series["terms_field"] = terms_field
        series["terms_size"] = terms_size
        series["terms_order_by"] = metrics[0]["id"] if metrics else "_count"
    if filter_kuery:
        series["filter"] = {"query": filter_kuery, "language": "kuery"}
    return series


def viz_tsvb(
    so_id: str,
    title: str,
    tsvb_type: str,
    series: list[dict],
    extra_params: dict | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "id": _gen_id(),
        "type": tsvb_type,
        "series": series,
        "time_field": "@timestamp",
        "interval": "auto",
        "axis_position": "left",
        "axis_formatter": "number",
        "axis_scale": "normal",
        "show_legend": 1,
        "show_grid": 1,
        "index_pattern": INDEX_PATTERN,
        # `use_kibana_indexes: false` lets TSVB hit the ES index pattern
        # directly without first resolving a Kibana data view saved object.
        # This keeps the dashboard portable: no DV setup required to import.
        "use_kibana_indexes": False,
        "background_color_rules": [{"id": _gen_id()}],
        "bar_color_rules": [{"id": _gen_id()}],
        "default_index_pattern": INDEX_PATTERN,
        "default_timefield": "@timestamp",
    }
    if extra_params:
        params.update(extra_params)

    return {
        "type": "visualization",
        "id": so_id,
        "attributes": {
            "title": title,
            "description": "",
            "version": 1,
            "visState": json.dumps(
                {"title": title, "type": "metrics", "aggs": [], "params": params}
            ),
            "uiStateJSON": "{}",
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps({"query": {"query": "", "language": "kuery"}, "filter": []})
            },
        },
        "references": [],
    }


# ---------------------------------------------------------------------------
# Panel layout
# ---------------------------------------------------------------------------


HEADER_MARKDOWN = """# Argus — Operations Overview

**Every Argus action, across every layer, in one place.**

- 🔎 **Interactive drill-down** → [Open the Argus Console](/app/security/argus) for Pulse / Activity Feed / Mutation Lineage / Reasoning chains
- 📜 **Raw audit trail** → [Open Discover over `.soc-*`](/app/discover#/?_g=(time:(from:now-24h,to:now))&_a=(dataSource:(type:dataView,dataViewId:'argus-all-soc-dv')))
- 🧾 **Compliance log** → [Open `.soc-audit-trail`](/app/discover#/?_g=(time:(from:now-24h,to:now))&_a=(dataSource:(type:dataView,dataViewId:'soc-audit-trail')))

Layer = which `.soc-*` index a document lives in. Time range applies to every panel."""


def grid(x: int, y: int, w: int, h: int, panel_index: int) -> dict:
    return {
        "gridData": {"x": x, "y": y, "w": w, "h": h, "i": str(panel_index)},
        "panelIndex": str(panel_index),
        "version": "9.0.0",
    }


def build_plan() -> tuple[list[dict], list[dict]]:
    """Return (viz_saved_object_list, dashboard_panels_list)."""
    objects: list[dict] = []
    panels: list[dict] = []
    panel_idx = 0

    def register(
        obj: dict, x: int, y: int, w: int, h: int, panel_title: str | None = None
    ) -> None:
        nonlocal panel_idx
        panel_idx += 1
        objects.append(obj)
        panel_ref_name = f"panel_{panel_idx}"
        panel_entry = {
            **grid(x, y, w, h, panel_idx),
            "embeddableConfig": {"enhancements": {}},
            "panelRefName": panel_ref_name,
        }
        if panel_title:
            panel_entry["title"] = panel_title
        panels.append(panel_entry)

    # ---- Row 1 — header markdown ------------------------------------------
    register(viz_markdown("argus-ops-header", HEADER_MARKDOWN), 0, 0, 48, 4)

    # ---- Row 2 — three headline metrics -----------------------------------
    # TSVB metric panels show the *last bucket* of their time series by default.
    # For "total over the range" we chain `count` → `cumulative_sum`, so the
    # final bucket contains the running total across the dashboard time window.
    count_id = _gen_id()
    cumsum_id = _gen_id()
    register(
        viz_tsvb(
            "argus-ops-metric-actions",
            title="Total Argus actions",
            tsvb_type="metric",
            series=[
                _tsvb_series(
                    label="Actions",
                    metrics=[
                        {"id": count_id, "type": "count"},
                        {"id": cumsum_id, "type": "cumulative_sum", "field": count_id},
                    ],
                    chart_type="line",
                )
            ],
        ),
        0, 4, 16, 8,
        panel_title="Total Argus actions",
    )

    # Rollback MTTR — averaged across the window (field is rollback_mttr_ms,
    # populated only on rolled-back outcomes). Uses "overall_avg" sibling
    # pipeline so the panel shows the mean across the full time range, not
    # just the last bucket.
    mttr_avg_id = _gen_id()
    mttr_overall_id = _gen_id()
    register(
        viz_tsvb(
            "argus-ops-metric-mttr",
            title="Rollback MTTR (avg ms)",
            tsvb_type="metric",
            series=[
                _tsvb_series(
                    label="MTTR (ms)",
                    metrics=[
                        {
                            "id": mttr_avg_id,
                            "type": "avg",
                            "field": "rollback_mttr_ms",
                        },
                        {
                            "id": mttr_overall_id,
                            "type": "avg_bucket",
                            "field": mttr_avg_id,
                        },
                    ],
                    chart_type="line",
                )
            ],
        ),
        16, 4, 16, 8,
        panel_title="Rollback MTTR (avg ms)",
    )

    # Mutations applied — filter on real labels: "Canary applied" and
    # "Canary promoted" are the success states of the canary pipeline.
    applied_count_id = _gen_id()
    applied_cumsum_id = _gen_id()
    register(
        viz_tsvb(
            "argus-ops-metric-applied",
            title="Mutations applied (window)",
            tsvb_type="metric",
            series=[
                _tsvb_series(
                    label="Applied",
                    metrics=[
                        {"id": applied_count_id, "type": "count"},
                        {
                            "id": applied_cumsum_id,
                            "type": "cumulative_sum",
                            "field": applied_count_id,
                        },
                    ],
                    chart_type="line",
                    filter_kuery='label : "Canary applied" or label : "Canary promoted"',
                )
            ],
        ),
        32, 4, 16, 8,
        panel_title="Mutations applied (window)",
    )

    # ---- Row 3 — actions-over-time by layer (full width) -------------------
    register(
        viz_tsvb(
            "argus-ops-actions-by-layer",
            title="Actions over time, by layer",
            tsvb_type="timeseries",
            series=[
                _tsvb_series(
                    label="Actions by index",
                    metrics=[{"id": _gen_id(), "type": "count"}],
                    chart_type="bar",
                    stacked="stacked",
                    fill="0.8",
                    split_mode="terms",
                    terms_field="_index",
                    terms_size=10,
                )
            ],
        ),
        0, 12, 48, 15,
        panel_title="Actions over time — stacked by index (layer)",
    )

    # ---- Row 4 — top actors + trust tier mix + layer mix ------------------
    register(
        viz_tsvb(
            "argus-ops-top-actors",
            title="Top actors by actions",
            tsvb_type="top_n",
            series=[
                _tsvb_series(
                    label="Actions",
                    metrics=[{"id": _gen_id(), "type": "count"}],
                    chart_type="line",
                    split_mode="terms",
                    terms_field="actor_id",
                    terms_size=15,
                )
            ],
        ),
        0, 27, 20, 15,
        panel_title="Top actors (drill via Argus Console for reasoning)",
    )

    register(
        viz_tsvb(
            "argus-ops-trust-tier-mix",
            title="Trust tier mix",
            tsvb_type="top_n",
            series=[
                _tsvb_series(
                    label="Tier activity",
                    metrics=[{"id": _gen_id(), "type": "count"}],
                    chart_type="line",
                    split_mode="terms",
                    terms_field="actor_trust_tier",
                    terms_size=10,
                )
            ],
        ),
        20, 27, 14, 15,
        panel_title="Trust tier mix",
    )

    register(
        viz_tsvb(
            "argus-ops-layer-mix",
            title="Volume by layer (index)",
            tsvb_type="top_n",
            series=[
                _tsvb_series(
                    label="Volume",
                    metrics=[{"id": _gen_id(), "type": "count"}],
                    chart_type="line",
                    split_mode="terms",
                    terms_field="_index",
                    terms_size=15,
                )
            ],
        ),
        34, 27, 14, 15,
        panel_title="Volume by index",
    )

    # ---- Row 5 — rule churn + detection-eval PR ---------------------------
    register(
        viz_tsvb(
            "argus-ops-rule-churn",
            title="Rule churn",
            tsvb_type="top_n",
            series=[
                _tsvb_series(
                    label="Actions per rule",
                    metrics=[{"id": _gen_id(), "type": "count"}],
                    chart_type="line",
                    split_mode="terms",
                    terms_field="rule_id",
                    terms_size=15,
                )
            ],
        ),
        0, 42, 24, 15,
        panel_title="Rule churn (actions per rule)",
    )

    register(
        viz_tsvb(
            "argus-ops-eval-pr-trend",
            title="Detection-eval runs over time",
            tsvb_type="timeseries",
            series=[
                _tsvb_series(
                    label="Eval runs",
                    metrics=[{"id": _gen_id(), "type": "count"}],
                    chart_type="line",
                    fill="0.3",
                    filter_kuery='_index : ".soc-detection-eval-runs"',
                )
            ],
        ),
        24, 42, 24, 15,
        panel_title="Detection-eval activity",
    )

    # ---- Row 6 — rollback trend + drift snapshot --------------------------
    register(
        viz_tsvb(
            "argus-ops-rollback-trend",
            title="Response & drift timeline",
            tsvb_type="timeseries",
            series=[
                _tsvb_series(
                    label="Auto-rollback",
                    metrics=[{"id": _gen_id(), "type": "count"}],
                    chart_type="bar",
                    stacked="stacked",
                    fill="0.8",
                    color="#E7664C",
                    filter_kuery='label : "Auto-rollback"',
                ),
                _tsvb_series(
                    label="Slow rollback",
                    metrics=[{"id": _gen_id(), "type": "count"}],
                    chart_type="bar",
                    stacked="stacked",
                    fill="0.8",
                    color="#F5A700",
                    filter_kuery='label : "Slow rollback"',
                ),
                _tsvb_series(
                    label="Canary promoted",
                    metrics=[{"id": _gen_id(), "type": "count"}],
                    chart_type="bar",
                    stacked="stacked",
                    fill="0.8",
                    color="#54B399",
                    filter_kuery='label : "Canary promoted" or label : "Canary applied"',
                ),
                _tsvb_series(
                    label="Drift detected",
                    metrics=[{"id": _gen_id(), "type": "count"}],
                    chart_type="bar",
                    stacked="stacked",
                    fill="0.8",
                    color="#6092C0",
                    filter_kuery='label : "Drift detected"',
                ),
            ],
        ),
        0, 57, 32, 15,
        panel_title="Response & drift timeline",
    )

    register(
        viz_tsvb(
            "argus-ops-drift",
            title="Open drift signals",
            tsvb_type="top_n",
            series=[
                _tsvb_series(
                    label="Drift by rule",
                    metrics=[{"id": _gen_id(), "type": "count"}],
                    chart_type="line",
                    split_mode="terms",
                    terms_field="rule_id",
                    terms_size=10,
                    filter_kuery='label : "Drift detected"',
                )
            ],
        ),
        32, 57, 16, 15,
        panel_title="Open drift (by rule)",
    )

    return objects, panels


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def bulk_create(base: str, auth: str, objects: list[dict]) -> None:
    resp = kbn_request(
        base,
        auth,
        "POST",
        "/api/saved_objects/_bulk_create?overwrite=true",
        objects,
    )
    failures = [s for s in resp.get("saved_objects", []) if s.get("error")]
    if failures:
        print("!! bulk_create reported errors for some objects:", file=sys.stderr)
        for f in failures:
            print(f"   - {f.get('id')} [{f.get('type')}]: {f.get('error')}", file=sys.stderr)
        raise SystemExit(2)
    print(f"created/updated {len(resp.get('saved_objects', []))} saved objects")


def create_dashboard(base: str, auth: str, panels: list[dict], objects: list[dict]) -> None:
    references = []
    for i, panel in enumerate(panels):
        ref_name = panel["panelRefName"]
        viz_obj = objects[i]
        references.append(
            {"id": viz_obj["id"], "name": ref_name, "type": viz_obj["type"]}
        )

    dashboard_obj = {
        "type": "dashboard",
        "id": DASHBOARD_ID,
        "attributes": {
            "title": DASHBOARD_TITLE,
            "description": DASHBOARD_DESCRIPTION,
            "panelsJSON": json.dumps(panels),
            "optionsJSON": json.dumps(
                {
                    "hidePanelTitles": False,
                    "useMargins": True,
                    "syncColors": True,
                    "syncTooltips": False,
                }
            ),
            "version": 1,
            "timeRestore": True,
            "timeFrom": DASHBOARD_DEFAULT_FROM,
            "timeTo": DASHBOARD_DEFAULT_TO,
            "refreshInterval": {"pause": False, "value": 10000},
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps(
                    {"query": {"query": "", "language": "kuery"}, "filter": []}
                )
            },
        },
        "references": references,
    }

    kbn_request(
        base,
        auth,
        "POST",
        "/api/saved_objects/_bulk_create?overwrite=true",
        [dashboard_obj],
    )
    print(f"created/updated dashboard [{DASHBOARD_ID}]")


def export_ndjson(base: str, auth: str, dashboard_id: str, out_path: pathlib.Path) -> None:
    body = {
        "objects": [{"type": "dashboard", "id": dashboard_id}],
        "includeReferencesDeep": True,
        "excludeExportDetails": True,
    }
    raw = kbn_request(base, auth, "POST", "/api/saved_objects/_export", body, raw=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(raw)
    lines = raw.decode().strip().split("\n")
    print(f"exported {len(lines)} objects to {out_path.relative_to(REPO_ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--auth", default=DEFAULT_AUTH)
    parser.add_argument("--no-export", action="store_true", help="skip NDJSON export")
    args = parser.parse_args()

    print(f"target Kibana: {args.base}")
    ensure_data_view(args.base, args.auth)
    print(f"ensured data view [{DATA_VIEW_ID}]")

    objects, panels = build_plan()
    bulk_create(args.base, args.auth, objects)
    create_dashboard(args.base, args.auth, panels, objects)

    if not args.no_export:
        export_ndjson(args.base, args.auth, DASHBOARD_ID, NDJSON_OUT)


if __name__ == "__main__":
    main()

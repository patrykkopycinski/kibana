---
title: ARGUS Console — 5-minute demo runbook
audience: field demo · exec flyover · customer brief
stack: Elastic Stack + Kibana + ARGUS (security_solution plugin)
app_route: /app/security/argus
---

# ARGUS Console — 5-minute demo runbook

A single-URL, single-operator script for the `/app/security/argus`
application route. Every surface it hits is shipped in this PR.

> **Longer demo?** Use [`demo-runbook.md`](./demo-runbook.md) for the full
> 20-minute Mythos story. This file is for the **elevator-pitch** slot.

---

## 0. Prerequisites (one-time, ≈60s)

```bash
# From the repo root.
cd soc-simulation

# Bring up ES + Kibana (skip if you already have a local stack).
./setup.sh

# Seed every ARGUS surface in one shot:
#   .soc-* governance, lineage, reasoning, outcomes
#   + .soc-detection-corpus, .soc-threat-actors, .soc-threat-profiles
#   + .soc-coverage-gaps (15 open rows across 5 data sources)
./scripts/seed_argus_demo.sh
```

Confirm the feature flag is on in `kibana.dev.yml`:

```yaml
xpack.securitySolution.enableExperimental:
  - argusConsoleEnabled
  - argusCoverageEnabled          # Tier 1 / Tier 2 surfaces
  - argusDecisionGraphEnabled     # Tier 5 (currently scoped: flyout only)
```

Open Kibana and navigate to:

> **`/app/security/argus`**

ARGUS Console loads with a sidebar of panels + a deep-linkable URL.

---

## 1. Demo beats — 5 minutes, 5 surfaces

Each beat is ≤60s. The URL updates as you click so a reviewer can replay
the demo from the link alone.

### Beat 1 · The pitch (0:00 – 0:45) · `?panel=pulse`

> "ARGUS is an **autonomous SOC** built on the Elastic Stack. It ingests
> CVEs, synthesizes detection rules, evaluates them, governs them, and
> applies them — all observable in one Kibana app. Here's the last
> 24 hours."

Point at the **Governance Pulse** header:

- **Throughput** — mutation intents filed · applied · blocked.
- **Tier mix** — how much volume each trust tier is producing.
- **MTTR** — median time-to-rollback for bad rules.
- **Drift** — open drift cases.

> "No bespoke database. Every number here is a `.soc-*` index query."

### Beat 2 · End-to-end story (0:45 – 1:45) · `?panel=e2d_flow`

> "Click any CVE on the left. This is the **full CVE → detection rule**
> pipeline in one canvas: ingest → exploit-probability → synthesis →
> eval → backtest → governance → apply → observe."

Pick a row where `overallStatus` is `applied` — the canvas shows all
six Pareto candidates, the dominated alternatives, the final verdict,
and the backtest numbers.

> "Every stage is a real document. ARGUS didn't just pick a rule — it
> considered five others, and we can see why they lost."

### Beat 3 · Coverage + gap analysis (1:45 – 2:45) · `?panel=coverage`

> "ARGUS doesn't operate in a vacuum. The **Coverage** panel asks:
> what does the community already cover, and where are *we* the only
> line of defence?"

Point to the tactic × technique heatmap. Cells are coloured by
`argus_authored − community_authored`.

- Toggle the profile picker to **Ransomware** — the heatmap reshapes
  to show only ransomware-relevant techniques.
- Click an actor (e.g. **APT29**) — the flyout lists every technique
  the actor is known to use, split by ARGUS-authored vs
  community-authored vs uncovered.
- Click **Export Navigator layer** — a v4.5 JSON downloads; drop it
  into ATT&CK Navigator for the exec readout.

> "That heatmap is built from `.soc-detection-corpus` and
> `.soc-coverage-gaps`. The uncovered cells feed the next beat."

### Beat 4 · Analyst playbooks (2:45 – 3:45) · `?panel=playbooks`

> "Playbooks in ARGUS are **native Kibana primitives** — no bespoke
> engine. Every playbook is both a tagged Workflow (deterministic,
> observable in the Workflows UI) and an Agent Builder skill
> (LLM-callable)."

The Playbooks tab groups entries by **user intent**:

- **Investigate new CVE** → `soc_argus_exploit_to_detection` (canonical workflow)
- **Triage coverage gap / scan data-source gap / tune high-FP rule /
  actor escalation** → `soc_argus_playbook_runner` with the matching
  `playbook_id` input (`coverage-gap-triage`, `datasource-gap`,
  `high-fp-tuning`, `actor-escalation`). The old one-YAML-per-playbook
  workflows (`soc-argus-playbook-coverage-gap-triage`,
  `soc-argus-playbook-datasource-gap`, `soc-argus-playbook-high-fp-tuning`,
  `soc-argus-playbook-actor-escalation`) were removed.

Run **ARGUS Playbook Runner** from the Workflows UI · set `playbook_id` to
`datasource-gap` (optional: `dry_run: false`) · execute. When it completes,
any filed `mutation_intent` rows show up in the **Mutations** panel under
**pending governance verdict** (exact intents depend on indexed evidence).

> "One click, a typed workflow ran, governance caught it. Nothing was
> auto-applied."

### Beat 5 · Reasoning + decision graph (3:45 – 4:45) · `?tab=overview` then `?tab=decision_graph`

Open the Reasoning Drill-down on the Overview tab and pick a recent trace.

> "For every autonomous action ARGUS takes, we capture the **reasoning
> trace**: thought → tool_call → tool_result → decision →
> recommendation. If something looks wrong…"

Click **Show decision graph** on any reasoning-step row.

> "…this flyout walks the `.soc-decision-graph` edge index from that
> reasoning run outwards. Advisories, intents, outcomes, rules, actors
> and techniques are all typed edges — 'why did ARGUS do X' becomes a
> graph query."

Click **Open full-screen explorer** in the flyout footer.

> "Same data, interactive canvas: re-root from any node, filter by node
> kind or minimum edge strength, export the visible neighborhood as
> JSON, and deep-link the whole view via `?tab=decision_graph&root_kind=&root_id=`.
> Agent-builder skills hit the same contract through `argus.get_decision_graph`."

### Beat 6 · Audit + kill switch (4:45 – 5:00) · `?panel=kill_switch`

> "And the escape hatch: one operator, one toggle, ARGUS goes to
> read-only mode and every decision from that moment forward is a
> human's. Audited in `.soc-audit-trail`."

Flip the switch *(in the demo env)* and flip it back.

---

## 2. The URL is the artifact

Every panel click updates the hash. Copy-paste this URL into a PR
comment or a docs page and the reviewer lands on the exact same view:

```
/app/security/argus?tab=coverage&profile=ransomware
/app/security/argus?tab=mutations&mutations_filter=rolled_back&mutations_window=24h
/app/security/argus?tab=overview&run_id=run-demo-identity
/app/security/argus?tab=decision_graph&root_kind=advisory&root_id=CVE-2024-27198
```

That's the platform thesis: **no bespoke UI, no bespoke router — the
URL is the API.**

---

## 3. If something looks empty

| Surface | Fix |
| --- | --- |
| Coverage heatmap all grey | `node scripts/argus_seed_coverage.js` (or re-run `seed_argus_demo.sh`). |
| Playbooks tab empty | Check the workflow registry (`soc-simulation/workflows/_registry.json`) — every playbook needs `argus:playbook` in `tags`. |
| Decision-graph flyout/explorer empty | `.soc-decision-graph` isn't populated. Re-run `seed_argus_demo.sh` — it calls `scripts/argus_seed_decision_graph.js` for you. The scheduled builder workflow is a follow-up; edges are seeded at demo-setup time. |
| Decision-graph tab not visible / route 404s | `argusDecisionGraphEnabled` flag is off. Enable it via `xpack.securitySolution.enableExperimental: ['argusDecisionGraphEnabled']` in `kibana.dev.yml`. |
| Mutations panel empty | `./soc-simulation/scripts/seed_argus_demo.sh` (rich seed: 24 intents · 55 outcomes · 15 eval runs · 15 backtests). |
| Reasoning chain for `run-demo-*` missing | Re-run `seed_argus_demo.sh`; the three demo runs are idempotently recreated. |

---

## 4. What's *not* in this PR (intentional follow-ups)

State these up front if an astute reviewer asks — you want the scope
cut on the record:

- **`@kbn/argus-read-api` adapter package** — the read-contract
  consolidation is a follow-up PR; Tier-5 types live in
  `@kbn/argus-console-common` for now.
- **Scheduled decision-graph builder workflow** — edges are currently
  materialised by `scripts/argus_seed_decision_graph.js` at demo-setup
  time. The hourly builder that maintains `.soc-decision-graph` from
  `.soc-*` evidence indices is a follow-up.
- **Pathfinding + SVG export + URL round-trip for filters** in the
  explorer — the current panel ships root picker, depth control,
  node-kind chips, strength threshold and JSON export; shortest-path
  highlighting, SVG export and filter/path round-trip are on the
  follow-up list.
- **MCP transport for the new read routes** — gated on the adapter
  follow-up.
- **Executive briefing Lens dashboard** — the data exists; the
  dashboard is a low-risk follow-up Lens PR.

---

## 5. One-line summary (for the deck)

> **ARGUS is a Kibana-native autonomous SOC: CVE → governed detection
> rule, with every decision observable, replayable, and graph-queryable
> from a single `/app/security/argus` URL.**

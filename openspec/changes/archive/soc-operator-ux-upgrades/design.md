## Context

AutoSOC is currently an Elastic-native self-governing system (workflows + agents + indices; no runtime Python). The PM vision prototype demonstrates a set of operator-facing affordances — shift-handover narrative, side-by-side deterministic/agentic response, expected-impact-with-evidence recommendations, workflow connector/automation chips, skill ROI, reasoning trace, and forensic post-investigation panel — that package AutoSOC's existing signals into a "here's what your SOC did for you" story.

All required raw data already flows into AutoSOC indices (`.soc-evolution-log`, `.soc-recommendations`, `.soc-cases`, agent telemetry). The missing pieces are:

1. **Structured metadata** on recommendations (track, expected_impact, evidence) and workflows (automation_level, connectors).
2. **Derived indices** that aggregate raw events into operator-centric views (skill metrics, shift handover, reasoning trace, forensic summary, workflow registry).
3. **Command-center panels** wired to those derived indices.

The change is large in surface area but low-risk: it's additive on the schema side (existing docs without new fields are treated leniently), and the only mutation to existing workflows is the applier's stricter validation gate, which emits `validation_failed` (already a supported result).

## Goals / Non-Goals

### Goals
- Give the operator a glanceable "shift handover" narrative on login.
- Make every recommendation self-explanatory: track, expected impact, evidence.
- Surface automation coverage (fully_auto / semi_auto / human_in_the_loop) and integration fan-out per workflow.
- Quantify what AutoSOC's skills are saving, with clear "estimate" labeling.
- Make agent runs inspectable after the fact (reasoning trace).
- Consolidate durable forensic artifacts per case in one document.
- Keep everything Elastic-native: Workflows, ES|QL, Kibana panels. No runtime Python.

### Non-Goals
- **Not** building a real-time streaming UI for reasoning traces (we persist steps; sampler panel is good enough).
- **Not** computing "money saved" as a fact — ROI figures are clearly estimates.
- **Not** implementing the "Demo Mode: Auto-approve" toggle from the PM prototype (explicit PM red-flag; AutoSOC already has budgets + kill-switch that are safer).
- **Not** adding "Top human users" leaderboard (AutoSOC has no human-user notion).
- **Not** changing the applier's existing governance gates — only adding a new validation_failed reason.

## Decisions

### Decision 1: Validation-gate (not rewrite) for recommendation contract

**Option A (chosen):** Extend the applier's existing validation block with `track`/`expected_impact`/`evidence` checks and emit `validation_failed` with a specific `reason`. No changes to agent internals.

**Option B:** Bake the contract into every agent's structured-output JSON schema.

**Why A:** Applier is the single governance choke point and already emits `validation_failed` — this is the same surface operators already watch. B requires 5+ schema files to stay in sync; A gives one point of enforcement. Agents will naturally adapt because applier rejection is visible in `.soc-evolution-log`. A follow-up change can push the contract into per-agent schemas as a refinement once we've observed real rejection patterns.

### Decision 2: Roller workflow (not transform) for skill metrics

**Option A (chosen):** Elastic Workflow on a 15-minute cron that aggregates `.soc-evolution-log` and upserts `.soc-skill-metrics`.

**Option B:** Elasticsearch continuous transform.

**Why A:** The rest of AutoSOC is workflow-driven and operators already know how to audit workflow runs via `.soc-evolution-log`. Transforms are a second runtime surface to monitor. A 15-minute cron is acceptable freshness for an ROI panel. If latency becomes a complaint, we can switch to a transform in a follow-up without changing the index shape.

### Decision 3: Narrative generator is a workflow, not an agent

The shift-handover narrative is template-driven: pull buckets, format them into prose. This is pure LiquidJS — no LLM reasoning needed. Using a workflow keeps it deterministic, cheap, and auditable. If we later want a more fluent narrative, we can add an optional agent step that rewrites the workflow's draft; the workflow output stays the ground truth.

### Decision 4: Forensic summary written on case close, not on demand

**Option A (chosen):** `soc-case-creation.yaml` extends to emit `.soc-forensic-summary` when a case transitions to `closed`, keyed on `case_id` with `op_type: create` for at-most-once.

**Option B:** Derive the summary on read (dashboard panel queries multiple indices).

**Why A:** The source data (cases, IOCs, YARA, exceptions) may age out or mutate. A frozen snapshot at close time is the durable record. B couples the dashboard to the schemas of four other indices and is slower.

### Decision 5: Reasoning trace is indexed, not streamed

We persist every reasoning step as a separate document and write a `run_summary` rollup on completion. No streaming UI is built. This matches the Elastic-native, "everything is a document" pattern and lets ES|QL drive the sampler panel.

### Decision 6: `build.mjs` stays the dashboard authoring path

The command-center dashboard is already authored via `build.mjs`. We extend the existing factories with 6 new panel groups (one per new capability) and keep the row-based layout. No change to the runtime — `build.mjs` is a build-time Node.js helper; the runtime system remains Elastic-only.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Stricter applier validation breaks existing agents that don't emit the new fields | Housekeeping exemption (`housekeeping: true` skips evidence requirement); existing already-written recs in `.soc-recommendations` are untouched; agents update naturally after first rejection |
| ROI estimates mislead operators | Every ROI field is annotated `estimate: true`; panel header/description includes the word "estimate"; default baseline (15 min saved per skill run) is conservative |
| Reasoning trace index grows fast | Add ILM rollover policy (1d primary / 7d retention) in the index template; run_summary docs stay longer if we later want historical analysis |
| Shift-handover narrative becomes stale if the workflow fails silently | Handover workflow runs emit rows in `.soc-evolution-log` with `result: "failure"` — already visible on the existing health panel row; no new monitoring surface needed |
| 6 new dashboard rows push the command-center beyond one screen | Collapse rows: top-of-fold stays "system state"; new rows sit below in a defined order (handover at top, forensic summaries at bottom) — reflected in the spec |
| `build.mjs` becomes hard to maintain as panels grow | Each capability's panels live in their own factory function in the builder; README documents the panel groups |

## Migration Plan

1. **Phase 1 (forward-compatible):** Ship new index templates, workflows, and the registry seeder. Existing `.soc-recommendations` docs without the new fields keep working because the applier defaults missing fields leniently for pre-existing IDs.
2. **Phase 2 (enforcement):** Flip applier to reject new recommendations missing track/evidence. Operators see `validation_failed` reasons; agents adjust on the next run.
3. **Phase 3 (dashboard rewrite):** Regenerate `soc-command-center.ndjson` via `build.mjs`. Replace the legacy pending-recommendations panel with the evidence-annotated table.
4. **Phase 4 (docs):** Update `design-evolution.html` with the new capability list; update `autonomous-soc-overview.html` index catalog.

Rollback per phase is straightforward: index templates are additive (drop to revert); workflow changes are version-controlled; the applier change is a single validation block that can be reverted.

## Open Questions

- **Connector vocabulary**: Should `connectors` be a free-form list or a hard-validated enum at setup time? Decision: enum for now (12 values), extend via PR as new integrations are added. Prevents drift.
- **Shift window**: 8h default is right for a human schedule. Should AutoSOC also emit a handover on the hour for "always-on" operators? Decision: cron is configurable; default 8h with the ability to override to 1h.
- **Reasoning trace retention**: 7d or 30d? Decision: start at 7d — the forensic-summary and evolution-log cover longer-horizon forensic needs; the reasoning trace is a short-lived debugging surface.

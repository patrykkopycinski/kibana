## Why

AutoSOC currently runs fully autonomously but the operator surface shows *that* it ran, not *what it did for the business*. The PM vision prototype at `agent-vision.secpms.co` packages the same signals AutoSOC already produces into an operator-centric narrative: a shift-handover feed, side-by-side deterministic vs agentic response options with expected-impact evidence, workflows tagged by automation level and connectors, and a skills-as-ROI summary. Every input for those views already exists in AutoSOC indices (`.soc-evolution-log`, `.soc-recommendations`, `.soc-trace-kg`, `.soc-case-artifacts`); what's missing is structured metadata on recommendations/workflows/skills and a command-center that tells a human "here is what your autonomous SOC did for you since you logged off".

## What Changes

- Extend recommendation structured output: add `track` (`deterministic` | `agentic`), `expected_impact` (typed metrics — e.g., `fp_reduction_pct`, `mttr_reduction_minutes`), and `evidence` (array of `{summary, source_ref, confidence}`). Recommendations without evidence are refused.
- Add workflow metadata block: every canonical workflow declares `automation_level` (`fully_auto` | `semi_auto` | `human_in_the_loop`) and `connectors` (list of integrations touched, e.g., `elastic_defend`, `caldera`, `.soc-kill-switch`). Loaded at setup time into `.soc-workflow-registry`.
- Introduce `.soc-skill-metrics`: rollup index keyed on `skill_id` with `invocations_24h`, `success_rate`, `hours_saved_est`, `cost_saved_usd_est`, `last_run_ts`. Populated by a new `soc-skill-metrics-roller` workflow off `.soc-evolution-log`.
- Introduce `.soc-shift-handover`: narrative documents written by a new `soc-shift-handover` workflow that summarizes the last shift window (skill runs, rule changes, investigations, kill-switch/budget events) into one human-readable doc per shift.
- Introduce `.soc-reasoning-trace`: per-agent-run reasoning steps (`thought`, `tool_call`, `tool_result`, `decision`) surfaced from the agent telemetry stream, so operators can "see the work" after the fact.
- Introduce `.soc-forensic-summary`: one doc per case consolidating durable artifacts (IOCs, YARA, attribution, exceptions) emitted during an investigation. Written by extending `soc-case-creation` to emit a summary on case close.
- Rewrite `soc-command-center.ndjson` via `build.mjs` to add 6 new panel groups: shift-handover feed, recommendation track/impact breakdown, workflow automation-level + connectors matrix, skill ROI top-N, reasoning-trace sampler, forensic-summary latest-N. Replace the current "pending recommendations" table with an evidence-annotated version driven by the new schema.

## Capabilities

### New Capabilities
- `soc-recommendation-evidence`: adds `track`, `expected_impact`, `evidence[]` to the recommendation contract and enforces their presence in `soc-autonomous-applier` validation.
- `soc-workflow-metadata`: canonical workflow inventory carries `automation_level` + `connectors` and is indexed into `.soc-workflow-registry`.
- `soc-skill-metrics`: rollup index + scheduled workflow that computes invocations, success rate, and ROI estimates per skill.
- `soc-shift-handover`: narrative shift report index + workflow that generates one document per shift window.
- `soc-reasoning-trace`: per-run agent reasoning index populated from agent telemetry.
- `soc-forensic-summary`: per-case consolidated forensic artifact document written on case close.
- `soc-command-center-ux`: command-center dashboard panels surfacing all of the above.

### Modified Capabilities
(none — there are no pre-existing specs in `openspec/specs/` yet; this change creates the first batch for AutoSOC.)

## Impact

- **Schemas** (`soc-simulation/schemas/`): recommendation schema gains required fields; new JSON schemas for handover, reasoning-trace, skill-metrics, forensic-summary, workflow-metadata.
- **Workflows** (`soc-simulation/workflows/`): new `soc-skill-metrics-roller.yaml`, `soc-shift-handover.yaml`; extend `soc-case-creation.yaml` to emit forensic summary; extend `soc-autonomous-applier.yaml` validation to reject recs without evidence; extend `setup.sh` to seed `.soc-workflow-registry` from a manifest.
- **Indices** (`soc-simulation/setup/indices/`): new index templates `.soc-skill-metrics`, `.soc-shift-handover`, `.soc-reasoning-trace`, `.soc-forensic-summary`, `.soc-workflow-registry`.
- **Dashboard** (`soc-simulation/setup/dashboards/`): `build.mjs` and `soc-command-center.ndjson` regenerated with new panel groups.
- **Docs** (`soc-simulation/docs/`): `design-evolution.html` gains a section on the operator UX surface; `autonomous-soc-overview.html` index catalog gets 5 new indices.
- **No runtime Python**: everything runs as Elastic workflows, ES|QL, and Kibana panels. `build.mjs` remains a build-time Node.js helper.
- **Backwards compatibility**: existing recommendations without `track`/`expected_impact`/`evidence` are migrated lazily — the applier treats missing fields as `track: deterministic`, `expected_impact: {}`, `evidence: []` and rejects *new* recs that omit them. Existing `.soc-evolution-log` documents are untouched.

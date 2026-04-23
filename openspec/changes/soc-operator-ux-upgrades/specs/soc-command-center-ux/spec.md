## ADDED Requirements

### Requirement: Shift handover panel row

The command-center dashboard SHALL dedicate one row at the top-of-fold to rendering the most recent `.soc-shift-handover` document's `narrative_markdown` and counters as markdown + metric panels.

#### Scenario: Latest handover is the one displayed
- **WHEN** multiple handover documents exist in the index
- **THEN** the row MUST render the document with the most recent `shift_end_ts`

### Requirement: Recommendation track and impact panels

The dashboard SHALL include panels breaking down pending and applied recommendations by `track` and by `expected_impact` metric. A dedicated table SHALL list the top 10 pending recommendations with columns `track`, `expected_impact.fp_reduction_pct`, `evidence[0].summary`, `created_at`.

#### Scenario: Pending recommendations table shows evidence
- **WHEN** a pending recommendation has at least one evidence entry
- **THEN** the table MUST render `evidence[0].summary` in the evidence column

### Requirement: Automation level and connectors matrix

The dashboard SHALL include a panel sourced from `.soc-workflow-registry` displaying each canonical workflow's `automation_level` and `connectors`.

#### Scenario: Connectors rendered as chips
- **WHEN** a workflow declares 3 connectors
- **THEN** the matrix row for that workflow MUST display 3 distinct chip labels

### Requirement: Skill ROI top-N panel

The dashboard SHALL include a top-N table sourced from `.soc-skill-metrics` sorted by `hours_saved_est_7d` descending, rendering `skill_id`, `invocations_7d`, `success_rate_7d`, `hours_saved_est_7d`, `cost_saved_usd_est_7d`.

#### Scenario: Estimate label is visible
- **WHEN** the ROI table renders
- **THEN** the panel description or column header MUST include the word "estimate" so values are not misread as billed amounts

### Requirement: Reasoning trace sampler panel

The dashboard SHALL include a panel listing the most recent 10 `run_summary` documents from `.soc-reasoning-trace` with columns `agent_id`, `total_steps`, `tool_call_count`, `final_status`, `@timestamp`.

#### Scenario: Failed run is visually distinct
- **WHEN** a run has `final_status: "failure"`
- **THEN** the panel MUST show its status with a visually distinct color (red) relative to `success`

### Requirement: Forensic summaries panel

The dashboard SHALL include a panel listing the 10 most recent `.soc-forensic-summary` documents with `case_id`, `verdict`, `iocs[].value`, `attribution.actor`, `closed_at`.

#### Scenario: Attribution is shown when present
- **WHEN** a forensic summary has `attribution.actor` populated
- **THEN** the attribution column MUST display that actor string

### Requirement: Replace pending-recommendations panel

The previous "pending recommendations" panel in `soc-command-center.ndjson` that lacked evidence/track columns SHALL be removed and replaced with the evidence-annotated table defined in "Recommendation track and impact panels".

#### Scenario: Old panel is absent after rebuild
- **WHEN** `build.mjs` is run and the NDJSON is reimported
- **THEN** no panel with id `soc-pending-recs-legacy` SHALL remain in the dashboard export

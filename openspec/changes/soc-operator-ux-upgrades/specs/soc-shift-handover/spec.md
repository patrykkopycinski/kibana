## ADDED Requirements

### Requirement: Shift handover document structure

`.soc-shift-handover` SHALL store one document per shift window with fields: `shift_id`, `shift_start_ts`, `shift_end_ts`, `narrative_markdown`, `highlights` (array of `{category, summary, doc_ref}`), `counters` (object: `skill_runs`, `rules_changed`, `cases_opened`, `cases_closed`, `kill_switch_events`, `budget_breaches`), `generated_at`.

#### Scenario: Handover covers full shift window
- **WHEN** a handover workflow runs for an 8-hour shift ending at 08:00 UTC
- **THEN** the resulting document MUST have `shift_start_ts == shift_end_ts - 8h` and counters aggregated only from events in that window

#### Scenario: Highlights reference source docs
- **WHEN** a notable rule change happened during the shift
- **THEN** one `highlights` entry MUST carry `category: "rule_change"` and `doc_ref` pointing to the `.soc-evolution-log` document id

### Requirement: Narrative generation workflow

`soc-shift-handover` workflow SHALL run on a configurable cron (default every 8 hours), pull events from `.soc-evolution-log`, `.soc-recommendations`, `.soc-cases`, `.soc-kill-switch`, and produce a human-readable markdown narrative addressed to the on-call analyst. The narrative MUST begin with a greeting line ("Good morning/afternoon/evening") derived from the shift end time.

#### Scenario: Narrative starts with correct greeting
- **WHEN** a shift ends at 16:00 local time
- **THEN** `narrative_markdown` MUST start with "Good afternoon"

#### Scenario: Empty shift produces explicit "quiet shift" doc
- **WHEN** a shift window has zero entries in `.soc-evolution-log`
- **THEN** the handover document MUST still be written with `counters.skill_runs == 0` and `narrative_markdown` containing the phrase "quiet shift"

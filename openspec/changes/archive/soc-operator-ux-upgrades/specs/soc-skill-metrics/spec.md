## ADDED Requirements

### Requirement: Per-skill rollup index

`.soc-skill-metrics` SHALL contain one document per `skill_id` with fields: `invocations_24h`, `invocations_7d`, `success_count_24h`, `failure_count_24h`, `success_rate_7d`, `hours_saved_est_7d`, `cost_saved_usd_est_7d`, `last_run_ts`, `last_failure_reason`.

#### Scenario: Successful skill run increments invocations and success
- **WHEN** a skill run completes with `status: "success"` logged to `.soc-evolution-log`
- **THEN** the next roller tick MUST increment `invocations_24h` and `success_count_24h` for that `skill_id`

#### Scenario: Failed skill run updates last_failure_reason
- **WHEN** a skill run completes with `status: "failure"` and `error: "<msg>"`
- **THEN** the next roller tick MUST set `last_failure_reason: "<msg>"` and increment `failure_count_24h`

### Requirement: ROI estimation

`hours_saved_est_7d` SHALL be computed as `success_count_7d * skill.baseline_minutes_saved / 60` where `baseline_minutes_saved` is a declared per-skill constant defaulting to 15 minutes. `cost_saved_usd_est_7d` SHALL be `hours_saved_est_7d * $FULLY_LOADED_ANALYST_HOURLY_RATE` (default $75/hr). Both figures MUST be annotated with `estimate: true` in the document to prevent misreading as billed values.

#### Scenario: Skill with no baseline uses default
- **WHEN** a skill document omits `baseline_minutes_saved`
- **THEN** the roller MUST apply the 15-minute default and log a `warn` event naming the skill

#### Scenario: Zero invocations yields zero ROI
- **WHEN** a skill has `success_count_7d == 0`
- **THEN** `hours_saved_est_7d` and `cost_saved_usd_est_7d` MUST be `0`

### Requirement: Scheduled roller workflow

`soc-skill-metrics-roller` workflow SHALL run every 15 minutes, aggregate `.soc-evolution-log` for skill runs in the last rolling window, and upsert one document per `skill_id` into `.soc-skill-metrics` using `elasticsearch.update` with `doc_as_upsert: true`.

#### Scenario: Roller is idempotent across runs
- **WHEN** the roller runs twice within the 15-minute window without new skill events
- **THEN** the second run MUST NOT change any `.soc-skill-metrics` document values

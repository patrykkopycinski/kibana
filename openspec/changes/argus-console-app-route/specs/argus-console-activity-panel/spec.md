## ADDED Requirements

### Requirement: Cross-layer event stream

The Activity Feed panel SHALL render a chronological stream of Argus events sourced from: `.soc-recommendations`, `.soc-detection-eval-runs`, `.soc-mutation-intents`, `.soc-outcomes`, and `.soc-actor-trust-tiers` (trust-tier change events only). Each row MUST display a source-layer badge, a short title, a context string, and a deep-link icon row.

#### Scenario: Mixed-source stream ordered by timestamp

- **WHEN** the last hour contains 3 recommendation events, 2 eval-run events, and 1 trust-tier change
- **THEN** the feed MUST list all 6 rows sorted by `@timestamp` descending
- **AND** each row MUST show its correct source-layer badge

### Requirement: Filter chips

The panel SHALL expose filter controls for: layer (multi-select chip), pressure (multi-select chip, P1-P4), actor (combobox), trust tier (select; `frontier` | `trusted` | `probationary` | `quarantined` | `any`), and time range (shared with the console shell).

#### Scenario: Layer filter narrows the stream

- **WHEN** the user selects only the `eval` layer chip
- **THEN** rows from sources other than `.soc-detection-eval-runs` MUST be excluded from the list

#### Scenario: Multiple filters AND together

- **WHEN** the user selects layer=`eval` AND pressure=`P1`
- **THEN** rows MUST satisfy both conditions; rows matching layer but not pressure MUST be excluded

### Requirement: Row deep-links

Every row SHALL expose up to three deep-link icons: (a) open source document in Discover, (b) open reasoning drill-down for the row's `run_id` if present, (c) open the originating Security Solution alert if the row has an `alert_id`.

#### Scenario: Recommendation with alert_id shows all three icons

- **WHEN** a `.soc-recommendations` document has both `run_id` and `alert_id`
- **THEN** its row MUST render Discover, Reasoning, and Alert icons

#### Scenario: Trust-tier change shows only Discover

- **WHEN** a trust-tier change row has neither `run_id` nor `alert_id`
- **THEN** only the Discover deep-link icon MUST render

### Requirement: Reasoning deep-link opens drill-down inline

Clicking the reasoning icon SHALL open Panel 4 (Reasoning Drill-down) as a side-panel over the feed, pre-loaded with the row's subject; it MUST NOT navigate away from the Activity tab.

#### Scenario: Clicking reasoning icon keeps the user on the activity tab

- **WHEN** the user clicks the reasoning icon on any row
- **THEN** the Activity tab MUST remain the active tab
- **AND** a side-panel MUST render Panel 4 with the selected subject

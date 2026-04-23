## ADDED Requirements

### Requirement: Pulse top-of-fold summary

The Pulse panel SHALL render a top-of-fold row of four summary tiles, each a Lens embeddable referenced by saved-object ID from the existing `soc-command-center.ndjson` dashboard so numbers match the Lens-panel console 1:1.

#### Scenario: All four tiles render

- **WHEN** the Pulse tab is opened with the default time range
- **THEN** exactly four tiles MUST render: pressures sparkline (P1-P4), tier mix, mutation throughput, drift-signals open

#### Scenario: Matches Lens dashboard numbers

- **WHEN** the same time range is active in both the Pulse panel and the `soc-command-center` dashboard
- **THEN** the numerical values in each tile MUST equal the corresponding Lens panel value (they share the saved-object source)

### Requirement: Layout responsiveness

The tile grid SHALL use `EuiFlexGrid` with breakpoints: 4 columns at `l` and above, 2 at `m`, 1 at `s` and below.

#### Scenario: Mobile viewport stacks tiles

- **WHEN** the viewport width is below the `s` breakpoint
- **THEN** the four tiles MUST render in a single column

### Requirement: Shared time range with the console shell

The Pulse panel SHALL read the time range from a shared `EuiSuperDatePicker` at the console shell level; changing the time range MUST refresh all four tiles.

#### Scenario: Time-range change propagates

- **WHEN** the user changes the shared time range from "Last 24 hours" to "Last 7 days"
- **THEN** all four Lens tiles MUST re-render with the new time range within one render cycle

### Requirement: Lens unavailable fallback

If the `embeddable` plugin reports a Lens load error for any tile, that tile SHALL render an `EuiEmptyPrompt` with the error message and MUST NOT unmount the other three tiles.

#### Scenario: One tile fails, others keep working

- **WHEN** the pressures-sparkline Lens save fails to load (deleted saved object)
- **THEN** only that tile MUST render the empty-state prompt
- **AND** the other three tiles MUST render normally

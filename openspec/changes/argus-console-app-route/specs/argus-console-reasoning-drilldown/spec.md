## ADDED Requirements

### Requirement: Reasoning chain as vertical timeline

The Reasoning Drill-down panel SHALL render the M2.5 reasoning-trace chain for the subject as a vertical timeline built on `EuiCommentList`, one entry per `ReasoningStep`, ordered by `step_index` ascending.

#### Scenario: Ordered by step_index

- **WHEN** the subject's chain has steps with `step_index` 0, 1, 2, 3, 4
- **THEN** the rendered timeline MUST list them top-to-bottom in that exact order

#### Scenario: Supports all canonical step types

- **WHEN** the chain contains steps of type `thought`, `tool_call`, `tool_result`, `decision`, `recommendation`
- **THEN** each step type MUST render with a distinct EUI icon and colour

### Requirement: Confidence and confidence-delta

Each step SHALL render a confidence bar (0.0–1.0) and a confidence-delta badge showing the change from the previous step. The first step MUST render `Δ —` (no delta).

#### Scenario: Delta badge shows change from prior step

- **WHEN** step N has confidence 0.70 and step N+1 has confidence 0.92
- **THEN** step N+1's delta badge MUST render `Δ +0.22`

#### Scenario: First step has no delta

- **WHEN** a chain's first step is rendered
- **THEN** the delta badge for that step MUST render `Δ —` (em dash)

### Requirement: Injection-surface flags

If a step carries one or more injection-surface flags (from the M2.5 reasoning-watchdog), the panel SHALL render each flag as a distinctly-coloured `EuiBadge` (red-tone) on that step.

#### Scenario: Flagged step renders visible badge

- **WHEN** a step has `injection_surface_flags: ['promptable_tool_output']`
- **THEN** a red-tone badge with label `promptable_tool_output` MUST render on that step

### Requirement: Trust-tier-at-decision

For every `decision` or `recommendation` step, the panel SHALL display the trust tier of the acting actor at the moment of that step, sourced from the builder's join with `.soc-actor-trust-tiers`.

#### Scenario: Decision shows actor tier

- **WHEN** a decision step was produced by an actor whose trust tier at that timestamp was `probationary`
- **THEN** the step MUST render a tier chip with label `probationary`

### Requirement: Empty states

If the reasoning-chain builder returns `reason_code: "no_trace"`, the panel SHALL render `EuiEmptyPrompt` explaining that M2.5 must be active for the selected subject. If `reason_code: "not_authorized"`, the panel SHALL render an `EuiEmptyPrompt` pointing the user at the `argus:read` privilege.

#### Scenario: Pre-M2.5 alert renders no_trace prompt

- **WHEN** the selected `alert_id` has no `run_id` link into `.soc-reasoning-trace`
- **THEN** the panel MUST render the `no_trace` prompt and MUST NOT render an empty timeline

### Requirement: Alert-flyout integration

Security Solution's Alert flyout SHALL expose a "Show Argus reasoning" action visible only when BOTH `argusConsoleEnabled` is on AND `capabilities.siem.argus_read` is true. Clicking the action MUST mount `ReasoningDrilldownPanel` with the alert subject inside the existing flyout right-panel slot — it MUST NOT open a separate modal or navigate away.

#### Scenario: Action visibility gated on both flag and capability

- **WHEN** `argusConsoleEnabled` is on AND `capabilities.siem.argus_read` is false
- **THEN** the "Show Argus reasoning" action MUST NOT render in the alert flyout

#### Scenario: Action opens drill-down in the same flyout

- **WHEN** the user clicks the "Show Argus reasoning" action on an alert
- **THEN** the flyout MUST remain open AND the right panel MUST mount `ReasoningDrilldownPanel` with `{ subject_kind: 'alert', subject_id: <alert._id> }`

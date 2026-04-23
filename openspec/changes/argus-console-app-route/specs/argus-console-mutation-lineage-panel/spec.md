## ADDED Requirements

### Requirement: Fixed-topology lineage graph

The Mutation Lineage panel SHALL render a directed graph over nine canonical node types in a fixed column-per-stage layout:

1. `source`
2. `exploit_probability`
3. `synthesis`
4. `eval`
5. `backtest`
6. `apply`
7. `observe`
8. `outcome`
9. `drift_detected` (branch from `observe` back into `eval`)

A branch `rollback` SHALL run from `apply` back into `source`. The renderer MUST be a hand-written SVG component — it MUST NOT introduce a third-party graph-visualisation library.

#### Scenario: Happy path renders 8 nodes on the main path

- **WHEN** a mutation completed the main path with no drift and no rollback
- **THEN** the SVG MUST render nodes 1 through 8 on a single row with edges left-to-right
- **AND** no `drift_detected` or `rollback` branch MUST be drawn

#### Scenario: Drift re-score renders the branch

- **WHEN** the lineage builder returns a `drift_detected` node with a successor `eval` re-score
- **THEN** the SVG MUST render the `drift_detected` node below the `observe` node with an edge `observe → drift_detected → eval(re-score)`

#### Scenario: Rollback renders the return edge

- **WHEN** the lineage builder returns a `rollback` outcome on an applied mutation
- **THEN** the SVG MUST render an edge from `apply` back to `source` labelled `rollback`

### Requirement: Node status encoding

Each node SHALL carry one of four statuses: `done`, `skipped`, `pending`, `error`. The SVG MUST encode status via stroke colour: `done` green, `skipped` dimmed grey with a "skipped" badge, `pending` amber, `error` red.

#### Scenario: Skipped stage is dimmed not removed

- **WHEN** a drift-triggered mutation skipped the `synthesis` stage
- **THEN** the `synthesis` node MUST render in the graph with `skipped` styling — it MUST NOT be omitted

### Requirement: Subject input

The panel SHALL accept the subject via two inputs: a rule-id combobox (autocompleting against `.soc-mutation-intents.payload.rule_id`) and a free-text alert-id field. When a subject is chosen, the panel MUST fire `useMutationLineage` and render the graph on success.

#### Scenario: Rule-id input triggers lineage fetch

- **WHEN** the user selects a `rule_id` from the combobox
- **THEN** the panel MUST call `useMutationLineage({ subject_kind: 'rule', subject_id: <selected> })`

#### Scenario: Alert-id input triggers lineage fetch

- **WHEN** the user submits an `alert_id` in the text field
- **THEN** the panel MUST call `useMutationLineage({ subject_kind: 'alert', subject_id: <entered> })`

### Requirement: Node interactivity

Each node SHALL be focusable (`tabIndex={0}`) and MUST render `role="button"` and an `aria-label` containing the node's type and status. `Enter`, `Space`, and mouse click MUST open a right-side flyout showing the node's source document (the `.soc-*` doc that produced it) in a JSON pretty-printer.

#### Scenario: Keyboard activation opens the flyout

- **WHEN** the user focuses the `eval` node and presses `Enter`
- **THEN** a flyout MUST open displaying the `.soc-detection-eval-runs` document that produced that node

#### Scenario: Aria label includes status

- **WHEN** a node has status `skipped`
- **THEN** its `aria-label` MUST contain both the stage name and the word "skipped"

### Requirement: Empty state

When the subject resolves to no mutation (unknown `rule_id` or an `alert_id` with no `mutation_intent` link), the panel SHALL render `EuiEmptyPrompt` with copy explaining the subject was not matched; it MUST NOT render a partial graph.

#### Scenario: Unknown rule renders empty state

- **WHEN** the lineage builder returns `reason_code: "not_found"`
- **THEN** the panel MUST render the empty-state prompt and suppress the SVG

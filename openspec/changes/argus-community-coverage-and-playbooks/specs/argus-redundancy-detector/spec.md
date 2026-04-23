## ADDED Requirements

### Requirement: Redundancy scanner workflow

The system SHALL provide a scheduled workflow `soc-argus-redundancy-scanner.yaml` under `soc-simulation/workflows/`. The workflow MUST:

1. Read `.soc-detection-corpus` and `.soc-recommendations` for each technique present in either index.
2. Compute cross-source similarity between Argus-authored rules and community rules per technique.
3. Group rules whose pairwise similarity exceeds a configurable `redundancy_threshold` (default `0.85`).
4. Write group metadata into the `redundancy_groups` field of `.soc-detection-patterns` documents.
5. For each group where an Argus-authored rule is dominated by one or more community rules, file a `.soc-mutation-intents` document with `argus.origin: 'consolidation'` proposing retirement (status `queued`).

The workflow MUST declare `metadata.tags: [argus, argus:playbook]`.

#### Scenario: Groups are materialised into patterns

- **WHEN** the scanner runs against a corpus where technique `T1059.001` has five community rules and one Argus rule with pairwise similarity ≥ 0.85
- **THEN** the matching `.soc-detection-patterns` document MUST carry a `redundancy_groups[]` entry listing those six rule ids

#### Scenario: Dominated Argus rule produces a consolidation intent

- **WHEN** an Argus-authored rule is dominated (less precise, fewer data sources covered) by the community cluster in the same group
- **THEN** a mutation intent MUST be written with `argus.origin: 'consolidation'`, `status: 'queued'`, and a `proposed_rule_delta` describing retirement
- **AND** the intent MUST pass through the existing trust gate; the scanner MUST NOT write `status: 'applied'` directly

#### Scenario: Nightly schedule

- **WHEN** the workflow is deployed
- **THEN** it MUST be declared with a daily trigger (cron equivalent of "once per day")
- **AND** it MUST be runnable ad-hoc from the Workflows UI

### Requirement: Consolidation intents carry Pareto alternatives

Consolidation intents MUST carry `argus.synthesis` populated with at minimum a `chosen` proposal (retirement) and a `frontier` of at least one alternative (e.g. "consolidate by replacement with community rule `<id>`"). This preserves the existing Pareto-alternatives UX in the Mutation Detail flyout.

#### Scenario: Flyout shows alternatives for a consolidation intent

- **WHEN** the user opens the Mutation Detail flyout on a consolidation intent
- **THEN** the Pareto alternatives section MUST render at least two options: retirement and one replacement alternative
- **AND** the reviewer MUST be able to approve or reject from the existing flyout controls

### Requirement: Redundancy row in Coverage panel

The Coverage panel SHALL render a `Redundancy` row per tactic with a count chip equal to the number of active `consolidation` mutation intents whose `technique_id` maps into that tactic. Clicking the chip MUST open a table listing those intents with deep-links to the Mutation Detail flyout.

#### Scenario: Row hides when there are no consolidation intents

- **WHEN** a tactic has zero queued `consolidation` intents
- **THEN** the chip for that tactic MUST render with count `0` OR the Redundancy row MUST omit that tactic, consistently with the rest of the heatmap

#### Scenario: Clicking a chip lists the intents

- **WHEN** the user clicks a non-zero Redundancy chip
- **THEN** a table MUST open listing every matching `consolidation` intent
- **AND** each row MUST link to the Mutation Detail flyout for that intent

### Requirement: Configurable similarity threshold

The redundancy scanner's `redundancy_threshold` MUST be configurable per run via a workflow input with a default of `0.85`. Operators MUST be able to override the default for ad-hoc runs from the Workflows UI without editing the YAML.

#### Scenario: Threshold override narrows groups

- **WHEN** the workflow runs with `redundancy_threshold: 0.95`
- **THEN** fewer or equal groups MUST be produced compared to a run with `0.85` on the same corpus
- **AND** the resulting `.soc-detection-patterns.redundancy_groups[]` sizes MUST be non-increasing relative to the `0.85` run

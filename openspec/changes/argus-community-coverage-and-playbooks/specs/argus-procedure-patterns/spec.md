## ADDED Requirements

### Requirement: Detection patterns index

The system SHALL maintain an Elasticsearch index `.soc-detection-patterns`. Each document represents a canonical detection shape per-technique mined from `.soc-detection-corpus`:

- `pattern_id: keyword` (used as `_id`; deterministic hash of `technique_id + canonical_shape`).
- `technique_id: keyword`.
- `canonical_shape: text` — a normalized / tokenized representation of the query family.
- `source_counts: object` — `{ sigma: number, splunk_escu: number, elastic: number, sublime: number, kql_md: number, crowdstrike_cql: number }`.
- `precision_hint: double` — optional, derived from community review / scoring signals when available.
- `redundancy_groups: keyword` (array) — ids of groups this pattern participates in.
- `exemplars: keyword` (array of up to five `rule_id`s from `.soc-detection-corpus` that anchor the pattern).
- `computed_at: date`.

#### Scenario: Mining produces stable pattern ids

- **WHEN** `scripts/argus_mine_patterns.js` is run twice against unchanged corpus
- **THEN** the second run MUST NOT produce new `pattern_id` values
- **AND** `source_counts` MUST match between runs

#### Scenario: Patterns span sources

- **WHEN** the mining script is run against a corpus containing rules from at least three sources for the same technique
- **THEN** at least one resulting pattern for that technique MUST have `source_counts` nonzero on three or more sources

### Requirement: Pattern-seeded Pareto synthesis

`@kbn/argus-exploit-to-detection` SHALL, during its synthesis pass, look up `.soc-detection-patterns` documents matching the target technique and seed Pareto candidate generation with those patterns' `canonical_shape`. The resulting chosen intent and its frontier alternatives MUST record:

- `argus.pattern_id: keyword` — the seeding pattern id (nullable when no pattern matched).
- `argus.procedure_clusters: keyword` (array) — procedure-cluster labels extracted during synthesis.

Absence of a matching pattern MUST NOT block synthesis; in that case `argus.pattern_id` MUST be `null` and behaviour MUST match the pre-change path.

#### Scenario: Matching pattern is recorded on the intent

- **WHEN** synthesis runs for a technique with at least one matching pattern
- **THEN** the resulting mutation intent MUST carry `argus.pattern_id` equal to the seeding pattern's id
- **AND** the intent's `argus.procedure_clusters[]` MUST be non-empty

#### Scenario: No pattern yields a nulled field

- **WHEN** synthesis runs for a technique with no matching pattern
- **THEN** the resulting mutation intent MUST carry `argus.pattern_id: null`
- **AND** synthesis MUST still produce a valid intent that passes its existing contract

### Requirement: Procedure-clusters chip row in Mutation Detail flyout

The Argus Console's Mutation Detail flyout SHALL render a `ProcedureClustersSection` containing a chip row over `argus.procedure_clusters[]`. Clicking a chip MUST deep-link to a Discover query on `.soc-detection-patterns` filtered by `technique_id` of the mutation and an approximate match on the cluster label.

The section MUST render nothing when `argus.procedure_clusters[]` is empty or when `argusCoverageEnabled` is off.

#### Scenario: Empty clusters hide the section

- **WHEN** the selected mutation has no `argus.procedure_clusters[]`
- **THEN** the Procedure Clusters section MUST NOT render

#### Scenario: Chip opens Discover with pattern filter

- **WHEN** the user clicks a cluster chip labelled `lsass_read`
- **THEN** a new tab MUST open to Discover on the `.soc-detection-patterns` data view
- **AND** the URL MUST include filters on the mutation's `technique_id` and an approximate `canonical_shape` match

### Requirement: Coverage delta on mutation intents

Every mutation intent produced by `@kbn/argus-exploit-to-detection` SHALL carry `argus.coverage_delta` computed at synthesis time:

```
{
  newly_covered_techniques: string[],
  newly_covered_procedures: string[],
  now_redundant_rule_ids: string[],
  snapshot_ts: string,
}
```

The Mutation Detail flyout MUST render `CoverageDeltaSection` using this field, feature-flagged on `argusCoverageEnabled`.

#### Scenario: Coverage delta is populated at synthesis time

- **WHEN** a mutation intent is created via the existing synthesis pipeline (post-change)
- **THEN** the indexed document MUST include a populated `argus.coverage_delta` object
- **AND** `argus.coverage_delta.snapshot_ts` MUST be within 5 seconds of the document's `@timestamp`

#### Scenario: Flyout renders delta sections

- **WHEN** the flyout opens on an intent with non-empty `newly_covered_techniques`
- **THEN** the Coverage Delta section MUST list those techniques
- **AND** each technique MUST link to the Coverage panel with that technique selected

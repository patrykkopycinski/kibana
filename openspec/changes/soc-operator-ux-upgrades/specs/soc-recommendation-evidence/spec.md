## ADDED Requirements

### Requirement: Recommendation track classification

The recommendation structured output SHALL carry a required `track` field with values `deterministic` (workflow-driven change) or `agentic` (agent-reasoned change). The `soc-autonomous-applier` workflow MUST reject recommendations where `track` is absent or outside the enumerated values.

#### Scenario: Agent emits a deterministic recommendation
- **WHEN** `soc-deteng-agent` produces a recommendation to flip a Kibana detection rule
- **THEN** the recommendation document MUST include `track: "deterministic"` and be indexed into `.soc-recommendations`

#### Scenario: Applier rejects recommendation with missing track
- **WHEN** a recommendation lacking `track` reaches `soc-autonomous-applier`
- **THEN** the applier MUST mark the recommendation `result: "validation_failed"` with `reason: "missing_track"` and MUST NOT mutate any artifact

### Requirement: Expected impact payload

Every recommendation SHALL carry an `expected_impact` object whose keys are from a typed registry (`fp_reduction_pct`, `tp_gain_pct`, `mttr_reduction_minutes`, `hours_saved_per_week`, `coverage_delta_pct`). Values MUST be numeric and the object MAY be empty only when the recommendation is a pure housekeeping mutation.

#### Scenario: FP reduction forecast attached to rule patch
- **WHEN** a rule patch recommendation is emitted that tightens a detection
- **THEN** `expected_impact.fp_reduction_pct` MUST be a number between 0 and 100

#### Scenario: Housekeeping mutation with empty impact
- **WHEN** a recommendation only adjusts metadata (e.g., tag change) and has `housekeeping: true`
- **THEN** `expected_impact` MAY be `{}` and the applier MUST still apply the change

### Requirement: Evidence bullets

Every recommendation SHALL include an `evidence` array with at least one entry (unless `housekeeping: true`). Each entry MUST be `{ summary: string, source_ref: string, confidence: number }` where `source_ref` is a document id or ES|QL query, and `confidence` is in `[0,1]`.

#### Scenario: Non-housekeeping recommendation without evidence is rejected
- **WHEN** a recommendation reaches `soc-autonomous-applier` with `housekeeping: false` and `evidence: []`
- **THEN** the applier MUST mark it `result: "validation_failed"` with `reason: "no_evidence"`

#### Scenario: Evidence entry with out-of-range confidence
- **WHEN** a recommendation carries `evidence[0].confidence = 1.3`
- **THEN** the applier MUST reject the recommendation with `reason: "evidence_confidence_out_of_range"`

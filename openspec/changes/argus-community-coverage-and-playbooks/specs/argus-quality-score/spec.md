## ADDED Requirements

### Requirement: Per-recommendation detection-quality score

The `.soc-recommendations` index SHALL carry an additive, optional `argus.quality_score: number` field with a breakdown sibling `argus.quality_score_breakdown`. The score MUST be in the range `[0.0, 1.0]` inclusive and MUST be computed as a deterministic weighted sum over five signals.

The breakdown MUST be an object of the shape:

```
{
  backtest_precision: number,       // 0..1
  fp_rate: number,                  // 0..1 (lower is better; inverted into the final score)
  drift_stability: number,          // 0..1
  corpus_pattern_alignment: number, // 0..1, defaults to 0 when no pattern matched
  governance_streak: number         // 0..1, based on recent governance verdicts for the rule
}
```

Both fields MUST be optional on the mapping (demo installs without post-apply observations still ingest cleanly) and MUST be populated at two observation points:

- At synthesis time, immediately after the backtest gate, before writing the recommendation doc
- On every write to `.soc-post-apply-observations` for the rule's `rule_id`, via a script-update / partial index call

#### Scenario: Synthesis-time write populates the score

- **WHEN** `@kbn/argus-exploit-to-detection` writes a new recommendation
- **THEN** the indexed doc MUST include `argus.quality_score` and `argus.quality_score_breakdown`
- **AND** `corpus_pattern_alignment` MUST be `0` if no pattern seeded synthesis

#### Scenario: Post-apply observation updates the score

- **GIVEN** a recommendation with quality score `0.62`
- **WHEN** a new `.soc-post-apply-observations` doc arrives with `{ rule_id, fp_count: 0, tp_count: 3 }`
- **THEN** the recommendation's `argus.quality_score` MUST be recomputed and updated
- **AND** a history record MUST be appended to `.soc-quality-score-history` for the same rule_id

### Requirement: `.soc-quality-score-history` time-series index

A new index `.soc-quality-score-history` SHALL hold time-series records of quality-score recomputes. The index template MUST include fields:

- `rule_id: keyword`
- `mutation_intent_id: keyword`
- `score: float`
- `breakdown`: object matching `quality_score_breakdown`
- `observed_at: date`
- `trigger: keyword` (one of `synthesis | post_apply_observation | manual_recompute`)

The index MUST follow the same ILM policy and naming conventions as sibling `.soc-*` indices.

#### Scenario: Trend is queryable for a rule

- **WHEN** the Mutation Detail flyout loads for a rule with ≥ 2 history records
- **THEN** a query against `.soc-quality-score-history` by `rule_id` MUST return the records in chronological order
- **AND** the flyout MUST render them as a sparkline

### Requirement: Deterministic scoring function

The scoring function MUST live in `@kbn/argus-exploit-to-detection/src/quality/compute_quality_score.ts` as a pure function over the five inputs. Weights MUST be exported as a named constant `QUALITY_SCORE_WEIGHTS` so tests and UI tooltips reference the same source.

The function MUST:

- Normalise each input signal to `[0, 1]` before weighting
- Return `{ score, breakdown }` where `score` equals `sum(weight_i * signal_i)` clamped to `[0, 1]`
- Be snapshot-tested with at least six fixture cases (degenerate all-zeros, degenerate all-ones, missing signals, balanced, FP-heavy, pattern-aligned)

#### Scenario: Missing signals do not crash

- **WHEN** the function receives `post_apply_obs: undefined` and `corpus_alignment: undefined`
- **THEN** the missing signals MUST default to 0
- **AND** the returned breakdown MUST reflect those defaults

### Requirement: Mutations panel `Quality` column

The Mutations panel table (`@kbn/argus-console/src/panels/mutations_panel/mutations_panel.tsx`) SHALL include a new sortable `Quality` column. The cell MUST render a badge whose colour reflects the score:

- `< 0.4`: danger (red)
- `0.4 ≤ score < 0.7`: warning (amber)
- `score ≥ 0.7`: success (green)
- Score absent: neutral chip with text "—"

The column MUST be sortable server-side via the Mutations panel route (`server/lib/argus/routes/mutations.ts`) accepting `?sort=quality_score&order=asc|desc`.

#### Scenario: Sort descending places highest-quality rules first

- **WHEN** the user clicks the Quality column header twice (asc → desc)
- **THEN** the resulting HTTP request MUST carry `sort=quality_score&order=desc`
- **AND** the server MUST return rows ordered by `argus.quality_score` descending

### Requirement: Quality-score breakdown in the Mutation Detail flyout

The Mutation Detail flyout MUST render a `QualityScoreSection` that shows:

- A horizontal bar chart of the five breakdown components, each bar labelled with its weight and current value
- A sparkline of `.soc-quality-score-history` for the rule, spanning the last 30 days (or all-available when shorter)
- A text summary naming the weakest component ("FP rate is dragging this score down")

#### Scenario: Section hidden when score is absent

- **WHEN** the flyout loads a mutation whose recommendation doc lacks `argus.quality_score`
- **THEN** `QualityScoreSection` MUST NOT render
- **AND** no empty placeholder card MUST appear

### Requirement: Backfill + demo seeder

The package MUST ship two CLI scripts:

- `scripts/argus_recompute_quality_scores.js` — recomputes scores for all recent `.soc-recommendations` and appends history records; idempotent per `rule_id + observed_at`
- `scripts/argus_seed_quality_scores.js` — writes representative scores + history for the demo recommendation set so the column and flyout light up without real observation data

Both scripts MUST use the same `computeQualityScore` function as production to guarantee consistency.

#### Scenario: Demo seeder is idempotent

- **WHEN** `argus_seed_quality_scores` runs twice in succession
- **THEN** the second run MUST NOT duplicate history records
- **AND** the recommendation docs MUST end in the same state as after the first run

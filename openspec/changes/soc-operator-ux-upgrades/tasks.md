## 1. Schemas and indices

- [x] 1.1 Extend `soc-simulation/schemas/recommendation.schema.json` with required `track`, `expected_impact`, `evidence` fields
- [x] 1.2 Create `soc-simulation/schemas/shift_handover.schema.json`
- [x] 1.3 Create `soc-simulation/schemas/reasoning_trace.schema.json`
- [x] 1.4 Create `soc-simulation/schemas/skill_metrics.schema.json`
- [x] 1.5 Create `soc-simulation/schemas/forensic_summary.schema.json`
- [x] 1.6 Create `soc-simulation/schemas/workflow_registry.schema.json` (final name — workflow metadata lives in a dedicated registry index, not embedded in YAMLs)
- [x] 1.7 Create index template `soc-simulation/setup/index_templates/soc-shift-handover.json`
- [x] 1.8 Create index template `soc-simulation/setup/index_templates/soc-reasoning-trace.json` (data stream, lifecycle `soc-audit-permanent`)
- [x] 1.9 Create index template `soc-simulation/setup/index_templates/soc-skill-metrics.json`
- [x] 1.10 Create index template `soc-simulation/setup/index_templates/soc-forensic-summary.json`
- [x] 1.11 Create index template `soc-simulation/setup/index_templates/soc-workflow-registry.json`

## 2. Workflows (additive)

- [x] 2.1 Create `soc-simulation/workflows/soc-skill-metrics-roller.yaml` (1h cron; ES|QL aggregation against `.soc-evolution-log`; upsert to `.soc-skill-metrics`)
- [x] 2.2 Create `soc-simulation/workflows/soc-shift-handover.yaml` (8h cron default; narrative composed by `soc-meta-agent`; writes to `.soc-shift-handover`)
- [x] 2.3 Create `soc-simulation/workflows/soc-forensic-summarizer.yaml` — decided against extending `soc-case-creation.yaml` because case closure is driven by the Cases API (not a workflow trigger); a dedicated poller is the cleaner surface

## 3. Workflows (modifications)

- [x] 3.1 Workflow metadata is authored in `soc-simulation/workflows/_registry.json` (one entry per canonical `soc-*.yaml`) — this replaces the originally-planned top-level `metadata` block in each YAML. Rationale recorded in design.md.
- [x] 3.2 Extended `soc-autonomous-applier.yaml` validation step to reject recs with missing `track` / `expected_impact` / `evidence` (unless `housekeeping: true`) — emits `result: "validation_failed"` and routes to `.soc-dead-letter`
- [x] 3.3 Emitted `.soc-forensic-summary` via `soc-forensic-summarizer` (see 2.3 rationale)

## 4. Setup and bootstrap

- [x] 4.1 Extended `soc-simulation/setup.sh` to seed `.soc-workflow-registry` from `soc-simulation/workflows/_registry.json`; stale entries are pruned on every run
- [x] 4.2 `setup.sh` fails loudly if any canonical `soc-*.yaml` workflow is missing from `_registry.json` or if a manifest entry points at a non-existent workflow
- [x] 4.3 All new index templates are registered via the existing `_apply_index_template` pattern

## 5. Dashboard (`build.mjs` + NDJSON)

- [x] 5.1 Added shift-handover row (banner + latest-narrative table + history table). Markdown rendering of `narrative_markdown` is handled inline in the table cell.
- [x] 5.2 Replaced the legacy pending-recs panel with side-by-side deterministic/agentic tables (`soc-recs-deterministic`, `soc-recs-agentic`).
- [x] 5.3 Added workflow catalogue row sourced from `.soc-workflow-registry` (automation-level donut + registry table).
- [x] 5.4 Added skill ROI top-N table sourced from `.soc-skill-metrics` with explicit "estimate" banner text.
- [x] 5.5 Added reasoning-trace sampler sourced from `.soc-reasoning-trace` `run_summary` docs.
- [x] 5.6 Added forensic-summaries row sourced from `.soc-forensic-summary` (verdicts donut + recent table).
- [x] 5.7 Removed the legacy pending-recommendations panel from the builder.
- [x] 5.8 Ran `build.mjs`; regenerated `soc-command-center.ndjson` (48 panels, final y=214).
- [ ] 5.9 Update `soc-simulation/setup/dashboards/README.md` to document the new panel rows (deferred — README changes tracked separately)

## 6. Docs

- [ ] 6.1 Update `soc-simulation/docs/design-evolution.html` with a new section covering the operator UX surface
- [ ] 6.2 Update `soc-simulation/docs/autonomous-soc-overview.html` index catalog table with 5 new indices
- [ ] 6.3 Update any stale references in existing docs to "pending recommendations" that now need to mention `track` + `evidence`

## 7. Validation

- [x] 7.1 Ran `openspec validate soc-operator-ux-upgrades --strict` — clean
- [x] 7.2 Linted all new YAML workflow files with `js-yaml` — all parse cleanly; registry drift check passes (23/23 workflows declared)
- [x] 7.3 Smoke-read the regenerated NDJSON to confirm it is importable (valid JSON, 48 panels enumerated)
- [x] 7.4 Confirmed no new Python files were introduced (`find soc-simulation -name "*.py"` returns empty)

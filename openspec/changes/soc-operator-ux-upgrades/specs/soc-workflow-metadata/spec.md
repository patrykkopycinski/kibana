## ADDED Requirements

### Requirement: Workflow registry manifest

A single authored manifest `soc-simulation/workflows/_registry.json` SHALL declare, for every canonical workflow file in `soc-simulation/workflows/`, the fields `workflow_id`, `automation_level` (enum: `fully_auto`, `semi_auto`, `human_in_the_loop`), `connectors` (array, controlled vocabulary: `elastic_defend`, `elastic_detection_rules`, `elastic_cases`, `elastic_fleet`, `caldera`, `osquery`, `kill_switch`, `artifact_registry`, `evolution_log`, `recommendations`, `regression_gate`, `trust_scores`), and `summary` (one-sentence operator-facing description).

#### Scenario: Every canonical workflow has a manifest entry
- **WHEN** `setup.sh` is invoked and a YAML file `soc-simulation/workflows/<id>.yaml` exists
- **THEN** the manifest MUST contain exactly one entry with `workflow_id: <id>`, or setup MUST fail with a non-zero exit code naming the missing workflow

#### Scenario: Manifest entry declares fully-auto with integrations
- **WHEN** the manifest entry for `soc-autonomous-applier` is read
- **THEN** its `automation_level` MUST be `fully_auto` and `connectors` MUST include both `artifact_registry` and `kill_switch`

### Requirement: Workflow registry index

`.soc-workflow-registry` SHALL hold one document per canonical workflow with fields `workflow_id`, `automation_level`, `connectors`, `summary`, `owner`, `last_seeded_at`. The registry SHALL be populated by `setup.sh` on every deploy (by reading the manifest) and MUST be the single source of truth for dashboard panels that display workflow metadata.

#### Scenario: Registry is refreshed on setup
- **WHEN** `setup.sh` runs and the manifest contains N entries
- **THEN** `.soc-workflow-registry` MUST contain N documents whose `last_seeded_at` equals the current deploy timestamp (older docs with `workflow_id` not present in the manifest are removed to prevent drift)

#### Scenario: Dashboard queries the registry, not workflow files
- **WHEN** the command-center automation-level panel renders
- **THEN** its ES|QL source MUST be `.soc-workflow-registry` (not a file-based source)

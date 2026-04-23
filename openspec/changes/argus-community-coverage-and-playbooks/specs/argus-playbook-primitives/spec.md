## ADDED Requirements

### Requirement: Argus atomic tools registered with Agent Builder

The Security Solution Agent Builder tools registry SHALL include six new Argus-scoped tools under `x-pack/solutions/security/plugins/security_solution/server/agent_builder/tools/`:

- `argus_list_uncovered_techniques_tool`
- `argus_export_navigator_layer_tool`
- `argus_get_coverage_summary_tool`
- `argus_file_mutation_intent_tool`
- `argus_get_mutation_detail_tool`
- `argus_list_actor_coverage_tool`

Each tool MUST expose a zod input schema, a deterministic output schema, and MUST be registered in `server/agent_builder/tools/register_tools.ts`. Every tool MUST gate on `capabilities.siem.argus_read` and — where it writes — additionally on `capabilities.siem.argus_all`.

#### Scenario: Tools are discoverable via the agent-builder catalogue

- **WHEN** an agent-builder client lists available tools for a user with `siem.argus_read`
- **THEN** the response MUST include all six Argus tools
- **AND** each listing MUST include a human-readable description and a machine-readable input schema

#### Scenario: Write tool enforces write privilege

- **WHEN** a user without `capabilities.siem.argus_all` invokes `argus_file_mutation_intent_tool`
- **THEN** the tool MUST reject with a privilege error
- **AND** no document MUST be written to `.soc-mutation-intents`

### Requirement: `argus_file_mutation_intent_tool` routes through the canonical builder

The `argus_file_mutation_intent_tool` MUST delegate to `@kbn/argus-exploit-to-detection`'s mutation-intent builder for document construction. It MUST NOT bypass the builder with a direct index write. The `argus.origin` value MUST be one of `gap_analysis | consolidation | cti_ingest | pattern_seed | manual`.

#### Scenario: Disallowed origin is rejected

- **WHEN** the tool is invoked with `origin: 'arbitrary_string'`
- **THEN** input validation MUST fail with a 400-equivalent error before any Elasticsearch write
- **AND** the error MUST list the allowed origin values

#### Scenario: Successful invocation returns the new intent id

- **WHEN** the tool is invoked with a valid payload for a new gap-analysis intent
- **THEN** the response MUST include the new `mutation_intent_id`
- **AND** the indexed document MUST carry `argus.origin: 'gap_analysis'`

### Requirement: Argus playbook workflows

The system SHALL ship four new Kibana Workflow YAML files under `soc-simulation/workflows/`, each declaring `metadata.tags: [argus, argus:playbook]`:

- `soc-argus-playbook-ransomware.yaml`
- `soc-argus-playbook-apt-emulation.yaml`
- `soc-argus-playbook-datasource-gap.yaml`
- `soc-argus-playbook-cti-ingest.yaml`

Each workflow MUST compose only from the new Argus tools, existing Argus workflows, and standard Kibana workflow step kinds. Workflows MUST NOT contain bespoke executors or shell-outs.

#### Scenario: Ransomware playbook files intents via the canonical tool

- **WHEN** `soc-argus-playbook-ransomware.yaml` is executed for the `ransomware` profile
- **THEN** it MUST invoke `argus_get_coverage_summary_tool` then `argus_list_uncovered_techniques_tool` then fan out `argus_file_mutation_intent_tool` per uncovered technique
- **AND** every produced mutation intent MUST have `argus.origin: 'gap_analysis'` and `argus.profile_id: 'ransomware'`

#### Scenario: CTI-ingest playbook chains existing workflows

- **WHEN** `soc-argus-playbook-cti-ingest.yaml` is executed
- **THEN** it MUST call `soc-kev-ingest` followed by `soc-argus-exploit-to-detection`
- **AND** the resulting mutation intents MUST carry `argus.origin: 'cti_ingest'`

### Requirement: Retro-tag existing workflows

Existing workflows `soc-argus-exploit-to-detection.yaml`, `soc-kev-ingest.yaml`, and `soc-argus-drift-monitor.yaml` SHALL have `argus:playbook` added to their `metadata.tags`. Pre-existing tags MUST be preserved.

#### Scenario: Tag append preserves existing tags

- **WHEN** the retro-tag change is applied to `soc-argus-exploit-to-detection.yaml`
- **THEN** the YAML's `metadata.tags` MUST include every pre-existing tag
- **AND** MUST additionally include `argus:playbook`

### Requirement: Argus playbook skills

The Security Solution Agent Builder skills registry SHALL include six new skills, each with `metadata.tags` including `argus:playbook`:

- `argus_assess_readiness`
- `argus_emulate_actor`
- `argus_run_purple_team`
- `argus_assess_cve`
- `argus_find_datasource_gaps`
- `argus_review_rule_quality`

Each skill MUST be a parameter-extraction + workflow-invocation + result-summarization wrapper. Skills MUST NOT re-implement orchestration present in a workflow; they MUST invoke workflows via `run_workflow` (or the equivalent internal API) or compose existing tools.

#### Scenario: Skills are registered with the tag

- **WHEN** the agent-builder skills registry is enumerated
- **THEN** exactly those six Argus skills MUST appear with `argus:playbook` in their tags
- **AND** each skill MUST declare the workflow(s) or tool(s) it orchestrates in its manifest metadata

#### Scenario: Skill invokes its workflow rather than duplicating logic

- **WHEN** `argus_assess_readiness` is invoked with `{ profile_id: 'ransomware' }`
- **THEN** the skill handler MUST trigger `soc-argus-playbook-ransomware.yaml` via the workflow-run API
- **AND** the skill MUST NOT issue direct `.soc-mutation-intents` writes from inside its handler

### Requirement: `argus_review_rule_quality` is pure-read

`argus_review_rule_quality` MUST NOT invoke any workflow and MUST NOT write to any index. It MUST read `.soc-recommendations` and `.soc-backtest-results` for the requested `rule_id` and return a quality narrative.

#### Scenario: No writes occur

- **WHEN** `argus_review_rule_quality` runs against a valid `rule_id`
- **THEN** the skill handler MUST emit zero Elasticsearch write operations
- **AND** the response MUST include the rule's latest backtest metrics and recent governance decisions

## ADDED Requirements

### Requirement: Reasoning step document

`.soc-reasoning-trace` SHALL store one document per agent reasoning step with fields: `run_id`, `agent_id`, `step_index`, `step_type` (enum: `thought`, `tool_call`, `tool_result`, `decision`, `recommendation`), `content`, `tool_name` (nullable), `tool_args` (nullable), `tool_result_ref` (nullable), `@timestamp`.

#### Scenario: Tool call captures name and args
- **WHEN** an agent calls `elasticsearch_search` with a query
- **THEN** a document MUST be indexed with `step_type: "tool_call"`, `tool_name: "elasticsearch_search"`, and `tool_args` containing the serialized query

#### Scenario: Decision step references upstream thoughts
- **WHEN** an agent emits a decision after a chain of thoughts and tool calls
- **THEN** the decision document's `step_index` MUST be greater than all prior step indices in the same `run_id`

### Requirement: Run-level rollup

For each agent run, a single rollup document SHALL be written to `.soc-reasoning-trace` with `step_type: "run_summary"`, including `run_id`, `agent_id`, `total_steps`, `tool_call_count`, `total_duration_ms`, `final_status` (`success` | `failure` | `aborted`), `final_output_ref`.

#### Scenario: Rollup written on run completion
- **WHEN** an agent run finishes
- **THEN** exactly one `run_summary` document MUST exist for that `run_id` within 5 seconds

### Requirement: Dashboard sampler

The command-center dashboard SHALL expose a sampler panel listing the most recent 10 agent runs with a drill-down (via data view) into the full step list for any `run_id`.

#### Scenario: Sampler shows runs from all agents
- **WHEN** runs from `soc-triage-agent` and `soc-deteng-agent` both completed in the last hour
- **THEN** the sampler panel MUST list at least one entry from each agent

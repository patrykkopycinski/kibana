## ADDED Requirements

### Requirement: Agent-native parity skill

The project SHALL register an Agent Builder skill `security.argus.explain_decision` that exposes the same reasoning-chain payload the Reasoning Drill-down panel renders. The skill MUST accept either of two input shapes: `{ alert_id: string }` or `{ run_id: string }`.

#### Scenario: Alert input returns the same chain as the panel

- **WHEN** the skill is invoked with `{ alert_id: "abc123" }`
- **THEN** the skill's return payload MUST equal the JSON returned by `POST /internal/security_solution/argus/reasoning_chain` with body `{ subject_kind: "alert", subject_id: "abc123" }`

#### Scenario: Run input returns the same chain as the panel

- **WHEN** the skill is invoked with `{ run_id: "run-42" }`
- **THEN** the skill's return payload MUST equal the JSON returned by `POST /internal/security_solution/argus/reasoning_chain` with body `{ subject_kind: "run", subject_id: "run-42" }`

### Requirement: Shared builder — single source of truth

Both the internal route handler and the skill handler SHALL consume the reasoning chain via the same `ArgusReasoningChainBuilder` exported from `@kbn/argus-console`. No alternative builder or ad-hoc query MAY be introduced in the skill handler.

#### Scenario: Skill handler imports from the canonical package

- **WHEN** a developer reads the skill handler source file
- **THEN** the handler MUST import `ArgusReasoningChainBuilder` from `@kbn/argus-console`
- **AND** the handler MUST NOT execute raw Elasticsearch queries against `.soc-reasoning-trace` directly

### Requirement: Registry entry

The skill SHALL appear in `soc-simulation/skills/_registry.json` with a canonical entry naming its YAML, tags, and agent-native-parity partner (`ReasoningDrilldownPanel`).

#### Scenario: Registry contains the skill

- **WHEN** the project setup inspects `soc-simulation/skills/_registry.json`
- **THEN** the entry for `security.argus.explain_decision` MUST list `parity_partner: "ReasoningDrilldownPanel"`

### Requirement: Eval coverage

`@kbn/evals-suite-argus-reasoning` SHALL include at least two eval cases for the new skill:

1. A happy-path case asserting the skill's output matches the route's output for a seeded alert.
2. A `no_trace` case asserting that for an alert without a reasoning run the skill returns `{ chain: [], reason_code: "no_trace" }`.

#### Scenario: Parity case passes

- **WHEN** the eval suite seeds one alert with a complete reasoning run and invokes both the skill and the route for that alert
- **THEN** the eval case MUST pass only when the two JSON payloads are byte-equal after deterministic key-ordering

#### Scenario: No-trace case returns the documented envelope

- **WHEN** the eval suite seeds an alert with no linked reasoning run and invokes the skill
- **THEN** the skill MUST return `{ chain: [], reason_code: "no_trace" }`

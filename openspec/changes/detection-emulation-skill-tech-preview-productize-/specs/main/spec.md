# Specification

## Requirements

### Skill Registration & Discovery

- MUST: Register in Agent Builder skill catalog with a card titled "Detection Emulation" and description matching the proposal's "What Changes" first bullet
- MUST: Expose a `validateRule(rule, hosts, options) -> ValidationReport` API callable by Detection Engineering Skill and migration pipelines
- MUST: Accept a candidate detection rule (JSON object conforming to Detection Engine rule schema) + target host(s) (array of Elastic Defend agent IDs) as inputs
- MUST: Accept an optional `mode` parameter in the API (enum: `"log_injection"` | `"real_execution"`) defaulting to `"log_injection"`
- MUST: Accept an optional `fresh` boolean flag to force regeneration of cached attack graphs

### RBAC Privileges

- MUST: Define a dedicated Kibana feature privilege `emulation:execute` separate from `read` and `defend:execute`
- MUST: Reject Real Execution mode calls with a typed error (HTTP 403, error code `EMULATION_PRIVILEGE_MISSING`) if the operator lacks `emulation:execute`
- MUST: Allow Log Injection mode for any user with the base `emulation:read` privilege (required for viewing emulation history)

### Per-Space Host Allowlist

- MUST: Maintain a per-space host allowlist saved object (`emulation:targets:<spaceId>`) listing allowed Elastic Defend agent IDs and enrollment expiry timestamps
- MUST: Reject Real Execution mode calls with a typed error (HTTP 403, error code `EMULATION_HOST_NOT_ALLOWED`) if the target host is not on the current space's allowlist or enrollment has expired
- MUST: Provide a SOC ops console UI for enrolling hosts, setting expiry (default 365 days), and re-enrolling before expiry
- MUST: Default the allowlist to empty for every space out of the box
- SHOULD: Display a UI warning 30 days before allowlist entries expire

### Log Injection Mode

- MUST: Write synthetic ECS documents exclusively to the index pattern `.kibana-security-emulation-logs-<spaceId>-*`
- MUST: Reject Log Injection emulation with a typed error (HTTP 400, error code `EMULATION_INDEX_OPT_IN_MISSING`) if the target rule's `index` array does NOT include `.kibana-security-emulation-logs-<spaceId>-*`
- MUST: Tag every synthetic document with `event.dataset: "kibana.security.emulation"` and `kibana.emulation.id: <emulationId>`
- MUST: Create the synthetic-log index template on plugin start with a default 7-day ILM delete policy, user-configurable per space
- MUST: Generate synthetic ECS documents conforming to the schema expected by the rule's data source (e.g., `logs-endpoint.events.*` fields for Elastic Defend rules)

### Real Execution Mode

- MUST: Call the Elastic Defend endpoint action API (`/api/endpoint/action`) with the `execute` command type for each emulation phase requiring host activity
- MUST: Enforce a per-phase rate limit (default 10 commands per host per minute, user-configurable per space with a hard ceiling of 100 commands/host/minute)
- MUST: Acquire a host-level lock keyed by `(ruleId, hostId, mode)` before starting Real Execution; return HTTP 409 (error code `EMULATION_CONFLICT`) if a lock already exists
- MUST: Release the host-level lock when the emulation completes, errors, or times out
- MUST: Honor a wall-clock budget (default 30 minutes, user-configurable per space with a hard ceiling of 2 hours); cancel in-flight commands and return partial results on timeout
- MUST: Emit a `kibana.security.emulation.action` audit-log event for every command executed, including operator ID, target host ID, SHA-256 hash of the command, rule ID, mode, and emulation ID
- MUST: Present each LLM-suggested command to the operator for confirmation in interactive mode before execution
- MUST: Default Real Execution to disabled on Elastic Cloud Serverless until Legal sign-off is documented
- SHOULD: Surface a per-emulation "Suppress detection? Y/N" toggle in the SOC ops console (default Y for `low` and `medium` severity rules, default N for `high` and `critical`)

### Attack Graph Generation

- MUST: Generate an emulation scenario (attack graph: nodes, edges, lateral movement phases) from the rule's MITRE ATT&CK technique array (`threat.technique.id`)
- MUST: Produce a deterministic attack-graph fingerprint for a given `(ruleId, hostIds, mode)` tuple and cache the scenario keyed by that fingerprint
- MUST: Reuse the cached scenario for subsequent emulations with the same fingerprint unless the `fresh` flag is true
- MUST: Enforce a hard plan-size ceiling: max 20 phases, max 50 hosts; reject with HTTP 400 (error code `EMULATION_PLAN_TOO_LARGE`) beyond those limits

### TP/FP Scoring & Validation Report

- MUST: Monitor the Detection Engine alerts index for alerts matching the candidate rule during the emulation window
- MUST: Classify each alert as true-positive (TP) if its `kibana.alert.emulation.id` matches the current emulation ID, or false-positive (FP) if it fires during the window but lacks that tag
- MUST: Compute a confidence score (0–100) using the formula: `(TP / (TP + FP)) * 100` if `(TP + FP) > 0`, else `null`
- MUST: Return a `ValidationReport` JSON object with fields: `emulationId`, `ruleId`, `mode`, `targetHosts`, `confidenceScore`, `truePositives`, `falsePositives`, `phases` (array of per-phase results), `startTime`, `endTime`, `status` (enum: `"completed"` | `"partial"` | `"timeout"` | `"error"`)
- SHOULD: Include per-phase breakdown: phase ID, technique ID, commands executed, alerts generated, elapsed time

### Emulation History Persistence

- MUST: Create a `.kibana-security-emulation-history-<spaceId>-*` index on plugin start with a versioned mapping owned by the skill team
- MUST: Write a history document for every emulation with schema version, emulation ID, rule ID, operator ID, target hosts, mode, confidence score, TP/FP counts, start/end timestamps, attack-graph fingerprint, and status
- MUST: Apply a default 90-day ILM delete policy to the history index, user-configurable per space
- MUST: Space-scope every saved object and index document the skill creates (history docs, host allowlists, cached attack graphs)
- SHOULD: Support semantic search over emulation history using ELSER-2 when available; degrade gracefully to BM25 with a "fewer semantic results" notice if ELSER is unavailable

### Alert Tagging & UI Integration

- MUST: Tag every alert generated by an emulation with `kibana.alert.emulation.id: <emulationId>` and `kibana.alert.emulation.mode: <mode>` fields
- MUST: Display a colored "EMULATION" badge in Detection Engine UI on alerts where `kibana.alert.emulation.id` is set
- MUST: Exclude emulation alerts from default analyst triage queues unless the operator applies the "Emulation alerts" filter
- MUST: Provide an "Emulation alerts" filter in Detection Engine UI enabled by default

### Security Hardening

- MUST: Reject any workflow YAML or tool configuration containing hardcoded `Authorization: Basic` or `Authorization: Bearer` headers; fail CI lint if such patterns are detected
- MUST: Use Kibana saved-object connectors and inference endpoints exclusively for LLM and external API calls; no secrets in workflow YAML
- MUST: Wrap every internal API call in a versioned public API; fail CI build if an `internal/...` import lands in skill code
- MUST: Accept structured tool inputs only; no free-text command field in tool arguments
- MUST: Reject any workflow YAML or tool configuration with hardcoded ISO dates as defaults; fail CI lint on `default: "20\d\d-` regex patterns

### Operational Safety

- MUST: Display a persistent UI banner showing the current emulation mode (`"Log Injection"` or `"Real Execution"`) throughout the emulation session
- MUST: Surface inline caveats in the UI for each mode: Log Injection states "this validates rule LOGIC but NOT Defend ingestion or pipeline transforms"; Real Execution states "this validates the full pipeline"
- MUST: Enforce per-space `max_size` caps on the emulation history index (user-configurable) to prevent unbounded storage growth

### Feature Flags & Phasing

- MUST: Gate Phase 0 (foundation: saved objects, RBAC, audit-log integration, index templates, ILM policies) behind `detectionEmulation.foundation` flag
- MUST: Gate Phase 1 (Log Injection mode) behind `detectionEmulation.logInjection` flag
- MUST: Gate Phase 2 (Real Execution mode) behind `detectionEmulation.realExecution` flag, defaulting to disabled on Elastic Cloud until Legal sign-off
- MUST: Gate Phase 3 (Detection Engineering Skill API composition) behind `detectionEmulation.skillComposition` flag
- MUST: Gate Phase 4 (migration validator integration) behind `detectionEmulation.migrationIntegration` flag

### Real-Time Progress Streaming

- MUST: Stream progress updates and partial results to the caller as each emulation phase completes, using HTTP chunked transfer encoding or WebSocket (caller's choice)
- MUST: Include in each progress update: current phase index, total phases, phase technique ID, commands executed so far, alerts generated so far, elapsed time

### Documentation & Testing

- MUST: Document the minimum Workflow Engine version required and the workflow YAML fields consumed in the skill's author guidelines
- MUST: Provide unit tests asserting that every security and operational guardrail is enforced (privilege checks, allowlist checks, rate limits, lock acquisition, audit emission, index isolation)
- MUST: Provide integration tests that: (1) run a Log Injection emulation end-to-end and verify TP/FP scoring, (2) verify Real Execution rejects calls lacking `emulation:execute`, (3) verify opt-in index-pattern enforcement
- MUST: Include a user-facing README documenting setup, privileges, allowlist management, mode selection, and interpreting confidence scores

### Suggested Enhancements (not in original description)

- SHOULD: **(suggested)** Emit OpenTelemetry trace spans for each emulation phase to enable correlation with Detection Engine rule-execution spans
- SHOULD: **(suggested)** Collect telemetry on emulation completion rate, TP/FP score distribution, and wall-clock budget utilization for post-Tech-Preview capacity planning
- SHOULD: **(suggested)** Enforce a per-space emulation quota (e.g., max 100 concurrent emulations) to prevent runaway usage in multi-tenant Cloud deployments

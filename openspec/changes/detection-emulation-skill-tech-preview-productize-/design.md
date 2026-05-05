# Design

## Approach

The Detection Emulation Skill extends Agent Builder with a phased, risk-mitigated validation pipeline that transforms a detection rule into an executable attack simulation, measures alert fidelity, and returns a confidence score. The design prioritizes **guardrail-first construction**: every phase lands behind a feature flag, every offensive capability gates on RBAC + allowlist, and every emulation leaves an audit trail.

The core flow is:

1. **Rule ingestion**: accept a Detection Engine rule + target host set via Agent Builder tool call or programmatic API
2. **Scenario generation**: map the rule's MITRE ATT&CK technique tags to a directed attack graph (nodes = phases, edges = dependencies) using cached templates, ELSER-2 semantic search of historical scenarios, and LLM-driven graph assembly when no match exists
3. **Mode selection**: honor the operator's hard-preference (Log Injection vs. Real Execution), enforcing privilege + allowlist + opt-in checks before returning a 403/409 error
4. **Execution**: walk the attack graph, emitting ECS documents (Log Injection) or dispatching Defend commands (Real Execution), streaming phase progress to the caller
5. **Telemetry collection**: poll the Detection Engine for alerts matching the rule + emulation time window, capturing alert counts, matched phases, and false-positive signals
6. **Scoring**: compute TP/FP rates + confidence score using a weighted formula (TP coverage × precision × determinism), tagging results with `kibana.alert.emulation.id`
7. **Persistence**: write the emulation report (scenario, scores, phase outcomes, mode) to a space-scoped history index with versioned mapping

This design separates **generation** (stateless, cacheable, safe to run in parallel) from **execution** (stateful, locked, audit-logged) so that the Detection Engineering Skill can dry-run scenarios without needing `emulation:execute`.

## Components

- **`EmulationSkillPlugin`**: Kibana plugin entry point; registers the skill with Agent Builder, mounts versioned HTTP routes (`/api/security_emulation/v1/validate_rule`), declares saved-object types (emulation-plan, emulation-report), and creates index templates (`.kibana-security-emulation-logs-<space>-*`, `.kibana-security-emulation-history-<space>-*`)
- **`ScenarioGenerator`**: accepts a Detection Engine rule, extracts MITRE technique IDs, queries ELSER-2-indexed scenario templates by technique similarity, assembles a directed graph (phases with command templates, expected ECS fields, dependencies), returns a deterministic fingerprint for caching; degrades to BM25 when ELSER unavailable (E1)
- **`LogInjectionExecutor`**: walks the attack graph, hydrates ECS document templates with phase-specific values (timestamp, host, user, process tree), writes batches to `.kibana-security-emulation-logs-<space>-*`, verifies the target rule's `index` array includes the emulation index pattern (S6 enforcement), streams phase completion events to the caller
- **`RealExecutionExecutor`**: checks `emulation:execute` privilege (S1), validates target hosts against the per-space allowlist (S7), acquires a host-level lock (O4), calls `/api/endpoint/action/execute` with structured command args (never free-text), emits `kibana.security.emulation.action` audit events (S4), enforces per-phase rate limit (O6), honors suppression toggle from saved preferences (O5), streams command results + telemetry to the caller, releases lock on completion/timeout/error
- **`TelemetryCollector`**: polls `/api/detection_engine/rules/<rule-id>/alerts` with `?filter=(kibana.alert.emulation.id:<emulation-id>)`, aggregates TP (alerts matching expected phases) and FP (alerts outside expected phases), computes per-technique coverage, returns structured metrics
- **`ConfidenceScorer`**: applies weighted formula `score = (TP_coverage × 0.5) + (precision × 0.3) + (determinism × 0.2)`, where precision = TP / (TP + FP), determinism = 1 - (stddev of alert latencies / mean latency), clamps to [0, 1], annotates with per-mode caveats (P3)
- **`EmulationHistoryStore`**: writes emulation reports to `.kibana-security-emulation-history-<space>-*` with versioned mapping (fields: emulation_id, rule_id, scenario_fingerprint, mode, target_hosts, score, tp_count, fp_count, phase_outcomes, created_at, operator_id, space_id), supports semantic search via ELSER-2 for regression comparison, enforces 90-day ILM policy (O3)
- **`RBACGuard`**: middleware that checks `request.auth.isAuthenticated` and `request.auth.hasPrivileges(['emulation:read', 'emulation:execute'])`, returns 403 with typed error when insufficient
- **`HostAllowlistManager`**: saved-object CRUD for per-space allowlist entries (fields: host_id, enrolled_at, enrolled_by, expires_at), enforces annual re-enrollment, surfaces UI nag for entries expiring within 30 days (S7)
- **`AuditLogger`**: wraps `core.auditTrail.withAuditScope`, emits `kibana.security.emulation.action` events with fields (operator_id, target_host_id, command_hash_sha256, rule_id, mode, emulation_id, outcome, error_message), honors existing customer audit retention policy (L3)
- **`PublicAPIAdapter`**: wraps every Kibana internal API call (`/internal/alerting/rules/backfill/_schedule`, `/internal/detection_engine/...`) with a versioned public route (created if missing), CI lint blocks `import.*internal/` patterns (E2, S3)
- **`FeatureFlagRegistry`**: centralized map of `detectionEmulation.{foundation, logInjection, realExecution, skillComposition, migrationValidator}` flags, checked before enabling components, allows phased rollout (Phase 0–4)
- **`WorkflowYAMLRegistry`**: loads attack-graph templates from `x-pack/platform/plugins/security_emulation/server/workflows/`, CI lint scans for `Authorization: Basic`, `Bearer`, `default: "20\d\d-` patterns (S2, O8)

## Data Model

### Emulation Report (saved object + index document)

```typescript
interface EmulationReport {
  emulation_id: string;              // UUID
  rule_id: string;                   // Detection Engine rule SO ID
  scenario_fingerprint: string;      // SHA-256 of (technique IDs + template versions)
  mode: 'log_injection' | 'real_execution';
  target_hosts: Array<{ id: string; name: string; }>;
  score: {
    confidence: number;              // [0, 1]
    tp_coverage: number;             // fraction of phases that triggered alerts
    precision: number;               // TP / (TP + FP)
    determinism: number;             // 1 - (stddev latency / mean latency)
    caveats: string[];               // mode-specific warnings (P3)
  };
  tp_count: number;
  fp_count: number;
  phase_outcomes: Array<{
    phase_id: string;
    technique_id: string;            // e.g., "T1059.001"
    status: 'completed' | 'failed' | 'skipped' | 'timeout';
    alert_ids: string[];             // Detection Engine alert UUIDs
    error_message?: string;
    duration_ms: number;
  }>;
  created_at: string;                // ISO 8601
  updated_at: string;
  operator_id: string;               // Kibana username
  space_id: string;
  wall_clock_ms: number;
  budget_exceeded: boolean;
}
```

### Attack Graph Template (YAML)

```yaml
version: 1
fingerprint_inputs:
  - techniques
  - template_version
template_version: "2025-05-05"
techniques:
  - T1059.001  # Command and Scripting Interpreter: PowerShell
phases:
  - id: initial_access
    technique: T1059.001
    depends_on: []
    log_injection:
      ecs_template:
        event.category: [process]
        event.type: [start]
        process.name: powershell.exe
        process.command_line: "powershell.exe -ExecutionPolicy Bypass -File C:\\Temp\\test.ps1"
        host.id: "{{ host.id }}"
        user.name: "{{ user.name }}"
      expected_alert_fields:
        - rule.name
        - kibana.alert.emulation.id
    real_execution:
      action_type: execute
      parameters:
        command: powershell.exe
        args: ["-ExecutionPolicy", "Bypass", "-Command", "Write-Host 'Emulation test'"]
        timeout: 10s
      expected_telemetry:
        - event.category: process
          process.name: powershell.exe
```

### Host Allowlist Entry (saved object)

```typescript
interface HostAllowlistEntry {
  id: string;                        // UUID
  space_id: string;
  host_id: string;                   // Defend agent host UUID
  host_name: string;
  enrolled_at: string;               // ISO 8601
  enrolled_by: string;               // Kibana username
  expires_at: string;                // ISO 8601 (enrolled_at + 365 days)
  status: 'active' | 'expiring_soon' | 'expired';
}
```

### Audit Event (Kibana audit log)

```typescript
interface EmulationAuditEvent {
  event: {
    action: 'kibana.security.emulation.action';
    category: ['authentication', 'process'];
    type: ['start' | 'end' | 'denied'];
    outcome: 'success' | 'failure' | 'unknown';
  };
  kibana: {
    space_id: string;
  };
  emulation: {
    id: string;
    mode: 'log_injection' | 'real_execution';
    rule_id: string;
    phase_id: string;
  };
  user: {
    name: string;
    id: string;
  };
  host: {
    id: string;
  };
  process?: {
    command_line_hash: string;       // SHA-256 of the executed command
  };
  error?: {
    message: string;
  };
  '@timestamp': string;
}
```

### Emulation Alert Tag (Detection Engine alert document extension)

```typescript
interface EmulationAlertFields {
  kibana: {
    alert: {
      emulation?: {
        id: string;                  // matches EmulationReport.emulation_id
        mode: 'log_injection' | 'real_execution';
        phase_id: string;
        scenario_fingerprint: string;
      };
    };
  };
}
```

## Failure Modes

- **Insufficient privilege (S1)**: `RBACGuard` returns 403 with `{ error: 'forbidden', required_privilege: 'emulation:execute' }` before any executor instantiation; Detection Engineering Skill surfaces this as a validation warning
- **Host not on allowlist (S7)**: `RealExecutionExecutor` queries `HostAllowlistEntry` saved objects, returns 403 with `{ error: 'host_not_allowed', host_id, allowlist_url }` linking to the management UI
- **Concurrent emulation on same (rule, host) (O4)**: `RealExecutionExecutor.acquireLock()` attempts optimistic write of `emulation-lock-<rule-id>-<host-id>` doc with TTL; on conflict returns 409 with `{ error: 'emulation_in_progress', conflicting_emulation_id, retry_after_seconds }`
- **Rule does not opt-in to emulation index (S6)**: `LogInjectionExecutor` checks `rule.index.includes('.kibana-security-emulation-logs-*')`, returns 400 with `{ error: 'rule_not_opted_in', required_index_pattern, how_to_opt_in_url }` pointing to docs
- **Phase timeout (E6)**: each phase has a 5-min default timeout; on expiry, executor marks phase as `timeout`, continues to next phase if non-blocking, final report includes `phase_outcomes[i].status = 'timeout'`
- **Wall-clock budget exceeded (E6)**: after 30 min (configurable, 2 h hard ceiling), executor cancels remaining phases, writes partial report with `budget_exceeded: true`, returns 200 with incomplete results + warning
- **Rate limit exceeded (O6)**: `RealExecutionExecutor` tracks command count per (host, 60s window); on breach, pauses phase execution for remainder of window, resumes next window, logs rate-limit event
- **ELSER unavailable (E1)**: `ScenarioGenerator` catches ELSER query error, falls back to BM25 on `scenario_templates` index, appends `caveats: ['Semantic search unavailable; using keyword fallback']` to report
- **Detection Engine backfill API unavailable (S3)**: if public `/api/detection_engine/rules/backfill` does not exist, executor returns 501 with `{ error: 'backfill_api_not_available', fallback: 'manual_rule_run' }`, streams alert to operator
- **Defend agent offline (Real Execution)**: `/api/endpoint/action/execute` returns 503; executor marks phase as `failed`, includes `error_message: 'Host offline'`, continues if phase is non-blocking
- **Synthetic log ingestion pipeline failure (Log Injection)**: bulk write to emulation index returns partial errors; executor retries failed docs once, final report includes `phase_outcomes[i].error_message: 'Partial ingestion failure (N/M docs)'`
- **Prompt injection via rule description (S8)**: all LLM calls use structured tool schemas; rule description is passed as a `description: string` field (not `instruction`), never interpolated into system prompt; scenario generator ignores free-text `command` suggestions from LLM, only hydrates pre-approved YAML templates
- **Cross-space saved-object leak (S5)**: all SO writes include `namespaces: [request.getSpace()]`, Elasticsearch RLS enforces space isolation at index level, CI integration test asserts user in space A cannot read emulation reports from space B
- **Audit log write failure (S4)**: `AuditLogger` uses fire-and-forget; transient failures logged to Kibana server log but do NOT block emulation progress (availability over perfect auditability); operators can correlate via emulation_id in both audit log and history index

## Alternatives Considered

- **Single "hybrid" mode instead of Log Injection vs. Real Execution**: rejected because mixing synthetic and real telemetry in the same emulation run creates forensic ambiguity (analysts cannot tell which alerts stem from actual Defend ingestion vs. injected docs); hard mode separation makes the provenance explicit
- **Third-party emulation frameworks (Atomic Red Team, Caldera) as execution engine**: rejected due to S2 (secret management surface) and E3 (connector dependency); integrating external tooling adds attack surface and complicates air-gapped deployments; SMEAGOL's direct Defend integration is simpler and reuses existing Kibana RBAC
- **LLM-generated arbitrary commands instead of YAML templates**: rejected per S8; free-text command generation is a prompt-injection vector and eliminates deterministic scenario replay (P6); template-driven generation with placeholder hydration gives reproducibility and security
- **Inline emulation alerts in default analyst queues**: rejected per O1; mixing emulation and real alerts causes fatigue; default exclusion with explicit opt-in filter preserves analyst focus while allowing investigation when needed
- **Global host allowlist instead of per-space**: rejected per S5; space isolation is a Kibana invariant; global allowlist would let operators in space A run commands on hosts enrolled by space B, violating tenant boundaries
- **Synchronous API (block until emulation completes)**: rejected due to E6 wall-clock budget (30 min default); HTTP clients would timeout; streaming progress via Server-Sent Events or long-poll keeps the caller informed and allows early cancellation
- **Store emulation reports in Detection Engine rule saved object**: rejected because Detection Engine owns the rule schema and emulation is a cross-cutting concern; separate history index allows independent retention policies (O3) and avoids schema migration coupling

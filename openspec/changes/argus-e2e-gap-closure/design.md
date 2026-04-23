# Argus E2E Gap Closure — Design

## Architecture

All changes are workflow YAML files in `soc-simulation/workflows/` plus minor updates
to the E2E demo script. No Kibana TypeScript changes required — the existing Agent
Builder tools, server routes, and UI panels already support the data shapes.

## Data Flow

```
Caldera Attack
    |
    v
Elastic Defend Telemetry (logs-endpoint.events.process-*)
    |
    v
Detection Alert (.alerts-security.alerts-*)
    |
    v
[W1] soc-argus-alert-to-hypothesis.yaml
    | creates .soc-cve-advisories (status=ingested)
    v
[W2] soc-argus-exploit-to-detection.yaml (extended)
    | ai.agent synthesizes rule via soc-deteng-agent
    | creates .soc-mutation-intents + .soc-recommendations
    v
[W3] Inline eval in E2D reconciler
    | runs draft query vs .soc-eval-corpus-*
    | creates .soc-detection-eval-runs (real scores)
    v
soc-argus-shadow-executor.yaml (existing)
    | runs query vs logs-* 7d window
    | annotates recommendation (shadow_gate: pass/fail)
    v
[W4] Status handoff (fixed)
    | ensures mutation intent status = auto_apply_ready
    v
soc-autonomous-applier.yaml (existing)
    | calls Kibana rules API via ai.agent
    | creates rule (disabled initially, then enables)
    v
Live Kibana Rule fires alerts
    |
    v
[W5] soc-argus-rule-health-monitor.yaml
    | monitors FP rate, proposes exceptions or rollback
    v
[W7] soc-argus-coverage-initializer.yaml
    | discovers installed integrations
    | proposes prebuilt rule enablement
```

## Key Decisions

1. **Scheduled polling over event triggers**: Workflow engine only supports
   `scheduled` + `manual` + `workflows.failed` triggers in this worktree. True
   event-driven triggers (`security_rules.created`) are not registered yet.
   Scheduled 3m polling is equivalent for demo purposes.

2. **Agent-based synthesis over direct TS import**: Workflows cannot call TS
   packages directly. The `ai.agent` step invokes `soc-deteng-agent` which has
   access to `security.argus.file_mutation_intent` tool. This is the canonical
   pattern used by `soc-autonomous-applier.yaml`.

3. **Exception-first over rollback-first**: Following sprint's FP Tuning
   philosophy, W5 attempts to generate an exception before disabling the rule.

4. **Deterministic document IDs**: All workflow-emitted documents use
   deterministic IDs derived from advisory/rule/technique identifiers so
   re-runs overwrite rather than duplicate.

## Index Impact

No new indices created. All writes target existing `.soc-*` indices with
established mappings.

# Detection Emulation Skill — Tech Preview

## Why
Elastic Security detection rules currently reach production without automated pre-deployment validation of their true-positive and false-positive rates. James Spiteri's SMEAGOL hackathon agent demonstrated that simulating attack techniques and measuring alert fidelity can gate rule promotion with confidence scores. This proposal productizes SMEAGOL into a composable Detection Emulation Skill for Agent Builder, enabling both direct operator use and programmatic validation by the Detection Engineering Skill before rules deploy.

## What Changes
- A new skill plug-in for Agent Builder that accepts a candidate detection rule + target host(s), generates an emulation scenario from the rule's MITRE ATT&CK technique mapping, executes the scenario in one of two hard-separated modes (Log Injection or Real Execution), monitors telemetry for matching alerts, computes TP/FP rates, returns a confidence score + per-phase report, and persists emulation history for regression comparison
- Log Injection mode (default, safer): writes synthetic ECS documents into a dedicated emulation index that the rule must opt-in to via its `index` array
- Real Execution mode (gated): runs commands on Elastic Defend endpoints, only available when the operator holds the dedicated `emulation:execute` privilege AND the target host is on a per-space allowlist
- Real-time streaming of progress and partial results back to the caller
- Security guardrails: dedicated RBAC privilege (`emulation:execute`), per-space host allowlist with annual re-enrollment, audit-log emission (`kibana.security.emulation.action`), space-scoped saved objects, synthetic-log index isolation, emulation alert tagging (`kibana.alert.emulation.id`, `kibana.alert.emulation.mode`), no hardcoded secrets (Kibana saved-object connectors only), versioned public API wrappers (no `internal/...` imports), structured tool inputs only (no free-text command field)
- Operational guardrails: per-phase rate limit (default 10 commands/host/minute), host-level locking for Real Execution (one emulation per rule per host), hard plan-size ceiling (max 20 phases, 50 hosts), 90-day ILM policy on emulation history, 7-day policy on synthetic logs, default alert-queue exclusion with analyst opt-in filter, suppression toggle for Real Execution (default Y for low-severity, N for critical/high), wall-clock budget (30 min default, 2 h hard ceiling)
- Phased rollout behind `detectionEmulation.<phase>` feature flags: Phase 0 (foundation, no offensive code), Phase 1 (Log Injection, Tech Preview), Phase 2 (Real Execution, self-managed only initially), Phase 3 (API contract for Detection Engineering Skill composition), Phase 4 (migration validator integration for Splunk/QRadar/SIGMA)
- EULA addendum drafted by Legal before Tech Preview opens to external customers
- Real Execution defaults to disabled on Elastic Cloud Serverless until Legal sign-off; Tech Preview ships with Log Injection only on Cloud

## Impact
- Agent Builder skill catalog gains a new composable skill with dedicated RBAC privileges and per-space configuration
- Detection Engineering Skill gains a programmatic `validateRule(rule, hosts) -> ValidationReport` API for pre-deployment validation gates
- Migration pipelines (Splunk, QRadar, SIGMA) can invoke Detection Emulation as part of the promotion workflow
- Detection Engine UI surfaces emulation alerts with a colored "EMULATION" badge and default exclusion from analyst triage queues unless explicitly filtered
- Kibana audit log schema extends with `kibana.security.emulation.action` events for SOX/regulated customers
- `.kibana-security-emulation-logs-<space>-*` and emulation-history indices created per space with dedicated ILM policies
- ECS field reuse wherever possible; emulation-specific fields (`kibana.alert.emulation.id`, `kibana.alert.emulation.mode`) added
- SOC ops console extends with Real-Execution suppression toggle and host-allowlist management UI
- Per-task definition of done enforces risk-ID citation, feature-flag protection, unit+integration tests asserting guardrails, no new `internal/...` imports, no hardcoded secrets/dates/hostnames, and user-facing README documentation

## Suggested Enhancements (not in original description)
- **(suggested)** Telemetry for emulation completion rate, TP/FP score distribution, and wall-clock budget utilization to inform capacity planning and timeout tuning post-Tech-Preview
- **(suggested)** OpenTelemetry trace emission for each emulation phase to enable correlation with Detection Engine rule-execution spans in distributed-tracing UIs
- **(suggested)** Per-space emulation quota (e.g., max 100 concurrent emulations) to prevent runaway usage in multi-tenant Cloud deployments

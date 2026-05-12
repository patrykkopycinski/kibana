# Risk Register — Detection Emulation Skill

**Status:** Living document. **Posture: release-positive.** The intent is to ship Tech Preview, not to litigate the design. Every row below is a *thing to track on the way to release*, not a veto.

**Anchors:**
- Epic: [`elastic/security-team#15974`](https://github.com/elastic/security-team/issues/15974) (Detection Emulation Skill)
- Parent epic: [`elastic/security-team#15972`](https://github.com/elastic/security-team/issues/15972) (Agent Skills Ecosystem)
- Implementation draft PR: [`elastic/kibana#268854`](https://github.com/elastic/kibana/pull/268854)
- Original risk-analysis chat: [Detection emulation production-risk register](5b0fde97-55be-4aeb-8d06-51b664b77f8f)
- Original P1/P2 plan compare: [Two competing plans — diff and reconciliation](184c36e1-c45c-4199-a61d-0afc41fd9860)

## 1. What's actually in the PR today vs. what was originally scoped

The original epic ambition is broad: AI-driven scenario generation, TP/FP scoring, programmatic `validateRule(rule, hosts)` for skill composition, migration validator for Splunk/QRadar/SIGMA, Log Injection mode, etc. Most of that lives in the **planning** track (this OpenSpec change). The **implementation** PR is intentionally much narrower:

| Capability | In PR #268854? | Notes |
|---|---|---|
| Single tool `runEmulationCommand` dispatching one Response Action to N endpoints | **Yes** | One-shot, no orchestration. Skill `content` explicitly disclaims `validateRule` / scoring / phases. |
| Feature flag gate (`experimentalFeatures.detectionEmulationRealExecution`) | **Yes** | Default off. Route returns 403 when disabled. |
| Declarative RBAC privilege check (`security.authz.requiredPrivileges`) | **Yes** | Per-command privilege mapping via `RESPONSE_CONSOLE_ACTION_COMMANDS_TO_REQUIRED_AUTHZ`. |
| Authenticated caller enforced | **Yes** | Rejects fallback `username='unknown'` with HTTP 401. |
| Per-host atomic rate limiter | **Yes** | Acquire/release with release-on-dispatch-failure. |
| Host allowlist | **Yes** | Default `allowAll: true`; restrictive variant for tests. Config: `xpack.securitySolution.detectionEmulation.allowlist.*`. |
| Idempotency cache (in-memory) | **Yes** | Keyed on `(space, emulation, command, agentType, sorted endpointIds)`. |
| Discriminated command schema (kill/suspend/memory-dump/isolate/unisolate) | **Yes** | `pid` xor `entity_id`, `kernel` vs `process` memory-dump shapes; closes the `z.record` typo hole. |
| Audit-comment marker on every dispatched action | **Yes** | `Detection Emulation [<id>]: <command>` injected into Response Action comment. |
| Alert tagging fields (`kibana.alert.emulation.id`, `…mode`) | **Yes** (fields defined) | `mode: 'test' \| 'validation' \| 'production'`. Writer helper present. |
| Saved-object `emulation-rule-binding` (hidden, hidden from HTTP) | **Yes** | With `modelVersions` baseline. |
| UI badge, filter, modal with approve/reject + shell tokenizer | **Yes** | EUI deep-import removed; tooltip wraps badge for a11y. |
| Log Injection mode | **No** (deferred) | Planning artifact only; no executor. |
| Scenario generation from MITRE technique IDs | **No** (deferred) | No `ScenarioGenerator`. |
| TP/FP scoring + confidence score | **No** (deferred) | No `ConfidenceScorer`. |
| Programmatic `validateRule` API for skill composition | **No** (deferred) | Skill content explicitly disclaims it. |
| Migration validator (Splunk/QRadar/SIGMA) | **No** (deferred) | Planning artifact only. |
| Tamper-evident append-only audit log (separate index) | **No** (deferred) | Today the marker rides on the standard Response Actions audit trail. |
| Per-deployment EULA addendum at activation | **No** (deferred) | Tracked by Legal; not blocking real-execution code because real-execution flag defaults off. |

**This narrower surface materially changes the risk picture.** Roughly half of the original LLM/scenario/composition risks (R-07 prompt injection on agent loop, R-14 hallucinated scenarios, R-15 uncalibrated confidence, R-16 non-determinism, R-17 Goodhart's law, R-18 synthetic-baseline FP, R-19 untranslatable rules) **don't have an attack surface yet** because the orchestrator they target doesn't exist. They're not "closed" — they're **deferred to the phase that introduces them** (Phase 1 Log Injection, Phase 2 Real Execution composition, Phase 3 skill composition API, Phase 4 migration validator).

## 2. Severity / status / gate rubric

- **Severity (unchanged from original):** Critical · High · Medium · Low.
- **Status today:**
  - **Mitigated** — the risk's mitigation is present in PR #268854 with code evidence.
  - **Partial** — partial mitigation present; named gap below.
  - **Deferred** — the risk applies to a capability not yet shipped in this PR. Re-open when the related phase begins.
  - **Open** — the risk applies today and has no mitigation in the current code.
- **Gate (unchanged from original):**
  - **TP** — must be resolved before Tech Preview activation (i.e., before `realExecution` flag is flipped on against customer endpoints).
  - **GA** — must be resolved before General Availability.
  - **Post-GA** — track as ongoing operational work.

## 3. Risk register — original 32 risks, re-scored against the current PR

### Safety (executing on customer hosts)

| ID | Risk | Severity | Status | Evidence in PR #268854 | Tracking action / owner | Gate |
|---|---|---|---|---|---|---|
| R-01 | Wrong-target execution: agent picks the wrong host | Critical | **Partial** | Host allowlist (`execution/allowlist.ts`) gates targeting; default is `allowAll: true`. Idempotency cache prevents *duplicate* targeting but not *wrong* targeting. | Add an "asset criticality" or `emulationEligible` tag on endpoints; require explicit opt-in per host before first-time dispatch. Owner: Eng + Sec. | **TP** |
| R-02 | Destructive Impact-tactic techniques get emulated | Critical | **Mitigated** | Schema is a *closed* discriminated union: `isolate`, `unisolate`, `kill-process`, `suspend-process`, `memory-dump`. No T1485/T1486/T1490/T1561 surface exists. Adding any new command requires a schema change reviewed by code owners. | Add CODEOWNERS rule (already present per PR) + a CI lint that fails on adding new commands without security sign-off. Owner: Eng + Sec. | **TP** |
| R-03 | "Simulated" emulation leaves artifacts; no rollback | Critical | **Partial** | `isolate`/`unisolate` are reversible by design. `kill-process`/`suspend-process`/`memory-dump` leave state changes on the host. No per-command rollback contract. | Document per-command artifact footprint + customer-facing cleanup guidance. For `memory-dump`, document the file location and retention. Owner: Eng. | **TP** |
| R-04 | Lateral-movement crosses trust boundaries | Critical | **Deferred** | Current commands are host-local Response Actions; no lateral-movement command shipped. | Re-open when scenario generation (Phase 1+) lands. Owner: Eng + Sec. | Deferred → **TP** at Phase 1 |
| R-05 | EDR/NDR/SOAR triggers real isolation/lockouts on emulated activity | High | **Partial** | Alert-tagging fields `kibana.alert.emulation.id` + `…mode` are defined (`alert_tagging.ts`); the audit-comment marker (`Detection Emulation [<id>]:`) is injected into every Response Action. **Gap:** no signed marker; customer SOC tooling cannot verify provenance, and the alert-tagging *writer* is present but its *triggering integration* is not yet wired into the rule-engine pipeline that produces alerts. | Two follow-ups: (a) cryptographically sign the emulation marker (HMAC with deployment key) so third-party SIEMs can trust-but-verify; (b) wire `tagAlertsWithEmulation` into the alert post-write pipeline (referenced by `EmulationRuleBinding`). Owner: Eng. | **TP** |

### Authorization & abuse

| ID | Risk | Severity | Status | Evidence | Tracking action / owner | Gate |
|---|---|---|---|---|---|---|
| R-06 | Detection-engineer privilege == sanctioned RCE | Critical | **Partial** | Route uses declarative `security.authz.requiredPrivileges` (per-command via `RESPONSE_CONSOLE_ACTION_COMMANDS_TO_REQUIRED_AUTHZ`). Authenticated user enforced (HTTP 401 for `username='unknown'`). **Gap:** privilege reuses the existing Response Actions privilege rather than a dedicated `emulation:execute`. No 2-person approval. | Add a dedicated `emulation:execute` privilege distinct from rule authoring + a 2-person approval workflow gate for production-tagged targets (this can sit on top of existing Response Actions UX). Owner: Sec. | **TP** |
| R-07 | Prompt injection in agent loop redirects targeting | Critical | **Deferred** | No agent orchestrator wired today. The tool is called with structured arguments (Zod-validated discriminated union); there is no free-text command field. | Re-open when scenario generation or agent-driven composition lands (Phase 1+). Owner: Sec + Eng. | Deferred → **TP** at Phase 1 |
| R-08 | Cross-tenant blast radius in Serverless | High | **Partial** | Route enforces authenticated caller; allowlist is per-route-registration (one instance per plugin instance, so per-tenant). Saved-object scope is space-scoped by default. **Gap:** no explicit integration test asserting cross-space isolation under Serverless concurrency. | Add a `confused-deputy` integration test that proves a space-A operator cannot dispatch against space-B endpoints. Owner: Sec + Eng. | **TP** |
| R-09 | Skill-to-skill auto-invocation skips human gate | Critical | **Deferred** | No composition layer present yet. Tool is callable from Agent Builder, but no other skill currently invokes it. | Re-open when skill composition (Phase 3) lands; default policy: agent-initiated runs must be dry-run only. Owner: PM + Eng. | Deferred → **TP** at Phase 3 |
| R-10 | Insufficient audit trail to reconstruct who/what/why | High | **Partial** | Audit *comment* (`buildEmulationComment`) rides on standard Response Actions audit trail (which captures actor, target, action, timestamp). **Gap:** the original spec mandated a *separate, tamper-evident, append-only* audit index. Today there is no `kibana.security.emulation.action` audit channel; the file `audit_logger.ts` is misleadingly named — it only builds the comment string. | Either rename `audit_logger.ts` → `audit_comment.ts` *and* add a real audit-channel emitter, or fold a `core.auditTrail` emission into the route. Add an integration test that asserts every successful dispatch produces an audit event with `(emulation_id, operator_id, target_host_id, command, outcome)`. Owner: Eng + Sec. | **TP** |

### Compliance / legal

| ID | Risk | Severity | Status | Evidence | Tracking action / owner | Gate |
|---|---|---|---|---|---|---|
| R-11 | Customer authorization to run attack code on endpoints not contractually established | Critical | **Open** | No EULA gate at activation. Mitigation today is that `realExecution` flag defaults to off. | Legal drafts a per-deployment addendum required at activation when real-execution flag flips. Owner: Legal + PM. | **TP** |
| R-12 | Regulated workload exposure (HIPAA / PCI / DORA / FedRAMP) | High | **Open** | No compliance matrix published. | Document the supported-deployment-models matrix; explicitly exclude FedRAMP / classified / air-gapped for TP. Owner: Legal + PM. | **TP** |
| R-13 | Hosted LLM ingests customer rule contents and host telemetry | High | **Deferred** | No LLM ingestion of telemetry today; the tool inputs are structured arguments (rule binding lookup is server-internal, not LLM-mediated). | Re-open when scenario generation (LLM-driven) lands. Owner: Eng + Legal. | Deferred → **TP** at Phase 1 |

### AI / detection quality

| ID | Risk | Severity | Status | Tracking action / owner | Gate |
|---|---|---|---|---|---|
| R-14 | Hallucinated emulation scenario fails to exercise the rule | High | **Deferred** — no scenario generator today | Re-open at Phase 1. Owner: Eng. | Deferred → **TP** at Phase 1 |
| R-15 | Confidence score is uncalibrated | High | **Deferred** — no scoring today | Re-open at Phase 2. Owner: PM + Eng. | Deferred → **TP** at Phase 2 |
| R-16 | Non-determinism: same rule → different results | Medium | **Deferred** — no scenario generator today | Re-open at Phase 1. Owner: Eng. | Deferred → **GA** at Phase 1 |
| R-17 | Goodhart's law: rules tuned to pass emulator, not catch real attackers | High | **Deferred** — no skill composition today | Re-open at Phase 3. Owner: PM + Eng. | Deferred → **GA** at Phase 3 |
| R-18 | Synthetic baseline under-reports FPs | High | **Deferred** — no FP scoring today | Re-open at Phase 2. Owner: Eng. | Deferred → **GA** at Phase 2 |
| R-19 | Coverage gap on Splunk/QRadar/SIGMA translated rules | Medium | **Deferred** — no migration validator today | Re-open at Phase 4. Owner: Eng. | Deferred → **TP** at Phase 4 |

### Endpoint / agent-side

| ID | Risk | Severity | Status | Evidence | Tracking action / owner | Gate |
|---|---|---|---|---|---|---|
| R-20 | Endpoint execution path becomes new attack surface | High | **Mitigated** | Implementation reuses the existing Response Actions code path on Defend. No new endpoint runner, no new agent capability. Tamper protection unchanged. | Document that emulation does not introduce a new execution surface on Defend. Owner: Eng (Defend). | **TP** |
| R-21 | Emulation traffic disrupts production hosts (CPU/IO, log volume, scan-like traffic) | High | **Partial** | Per-host rate limiter (`rate_limiter.ts`) is present and atomic (acquire/release). **Gap:** no off-hours scheduling, no pre-execution cost preview. | Add an optional "scheduled window" param and a per-emulation impact preview in the UI. Owner: Eng + SRE. | **TP** |

### Data / privacy

| ID | Risk | Severity | Status | Evidence | Tracking action / owner | Gate |
|---|---|---|---|---|---|---|
| R-24 | Historical emulation results form a high-value attack-map | High | **Deferred** | No `emulation-history` index yet; planning only. Saved object `emulation-rule-binding` is hidden + hidden-from-HTTP-APIs. | Re-open when history index lands (Phase 1+). When it does, mandate: encryption at rest, RBAC-scoped read, 90-day ILM, right-to-delete on customer offboarding. Owner: Sec + Eng. | Deferred → **TP** at Phase 1 |

### Operational

| ID | Risk | Severity | Status | Evidence | Tracking action / owner | Gate |
|---|---|---|---|---|---|---|
| R-22 | LLM token cost unbounded | Medium | **Deferred** — no LLM cost today | Re-open at Phase 1. Owner: PM + SRE. | Deferred → **GA** at Phase 1 |
| R-23 | No global kill switch | High | **Mitigated** | `realExecution` feature flag is global and defaults off. Flipping it off short-circuits the route to 403 immediately. | Document the kill-switch verification procedure in the customer-facing runbook. Owner: SRE. | **TP** |
| R-26 | Support burden: emulation alerts confused with real incidents | Medium | **Partial** | Alert-tagging fields defined; badge + filter in UI. **Gap:** writer not yet integrated with alert post-write pipeline. | Wire the alert-tagging writer + ship a customer-facing runbook describing how to filter / suppress emulation alerts in third-party SOCs. Owner: PM + Support. | **TP** |

### Trust / brand

| ID | Risk | Severity | Status | Tracking action / owner | Gate |
|---|---|---|---|---|---|
| R-25 | Single high-profile incident damages trust irreversibly | High | **Mitigated by surface narrowing** | The PR's narrow surface (response actions only, no LLM-driven targeting, allowlist + rate limit + idempotency + audit comment) reduces the per-action blast radius to that of the *underlying* Response Action. Real-execution default-off is the dominant control. Maintain TP gates on R-01, R-05, R-06, R-10, R-11, R-21. Owner: PM + Sec. | **TP** |

### Process / governance

| ID | Risk | Severity | Status | Tracking action / owner | Gate |
|---|---|---|---|---|---|
| R-27 | MSSP / multi-tenant authorization model unclear | High | **Open** | No MSSP-specific docs. Owner: PM + Legal. | **GA** |
| R-28 | Air-gapped / classified deployments incompatible | Medium | **Mitigated by deferral** | Real-execution flag defaults off in all deployments; LLM-mediated scenario gen is the actual incompatibility, and it isn't in this PR. Owner: PM. | **GA** |
| R-29 | Versioning gap: passed-record loses meaning when rule/emulator/model changes | Medium | **Partial** | The saved-object `emulation-rule-binding` carries a `modelVersions` baseline. **Gap:** no end-to-end emulation report yet, so no place to record `(rule_version, emulator_version, scenario_version, model_id)` together. | Re-open at Phase 1 (history index lands). Owner: Eng. | **GA** |
| R-30 | Decommissioning story unclear | Medium | **Open** | No lifecycle hook documented for skill disable/uninstall. | Add a skill-disable lifecycle hook that drains in-flight dispatches and respects offboarding. Owner: Eng + Legal. | **GA** |
| R-31 | Stakeholders TBD on epic | High | **In progress** | Named owners are partially filled (this register's *Owner* column is the working list). | Confirm named PM, Eng lead, Sec lead, SRE lead, Legal liaison and pin in [`#15974`](https://github.com/elastic/security-team/issues/15974). Owner: PM. | **TP** |
| R-32 | Export-control / dual-use review of bundled offensive tooling | Medium | **Mitigated** | This PR ships no bundled offensive tooling. Commands invoke Elastic Defend Response Actions, which Elastic already ships under its existing license posture. Re-open at Phase 1 if scenario libraries land. Owner: Legal. | **GA** |

## 4. New risks specific to the current narrower surface

These didn't appear in the original analysis because they're properties of the *specific* implementation shape — exposing existing Response Actions through a new authenticated, gated tool.

| ID | Risk | Severity | Status | Tracking action / owner | Gate |
|---|---|---|---|---|---|
| **N-01** | **Privilege-escalation via emulation tool.** The route currently checks the underlying Response Action's privilege (via `RESPONSE_CONSOLE_ACTION_COMMANDS_TO_REQUIRED_AUTHZ`). Operators with `kill-process` privilege today can already kill processes; emulation gives them a slightly nicer (and audit-tagged) wrapper. **But** if a future change relaxes the per-command privilege check, the wrapper becomes the loose path. | High | **Partial** | Add a regression test asserting: for each command, the emulation route enforces the same `requiredPrivileges` as the underlying Response Actions route. Owner: Sec. | **TP** |
| **N-02** | **Idempotency cache is in-memory only.** The cache (`idempotency_cache.ts`) prevents same-process double-submits but does not survive Kibana restart, leader change, or multi-pod deployments. In a 3-pod Kibana, a double-submit can split across pods. | Medium | **Partial** | Move idempotency to a short-TTL saved object (or Redis when available) so it survives restart + multi-pod. Owner: Eng. | **TP** |
| **N-03** | **Rate limiter is per-process.** Same shape as N-02: 3 Kibana pods × 10 cmd/min/host = 30 cmd/min/host in practice. | Medium | **Partial** | Either ship a per-process budget that's `quota / pod_count`, or move to a centralized counter. Owner: Eng + SRE. | **TP** |
| **N-04** | **`mode: 'production'` is in the type union.** `alert_tagging.ts` defines `EmulationMode = 'test' \| 'validation' \| 'production'`. A future operator can legitimately tag emulation alerts as `production`, which defeats the analyst-side suppression filter built from this field. | Medium | **Open** | Remove `'production'` from the mode union for Tech Preview; reintroduce only when an explicit semantics for "production mode" is defined. Owner: Eng + PM. | **TP** |
| **N-05** | **Audit-comment vs. audit-channel naming.** `audit_logger.ts` only builds a comment string — there is no `core.auditTrail` emission. The name is misleading and the channel mandated by R-10 doesn't exist. | High | **Open** | Rename file, add real audit-channel emission. Owner: Eng. | **TP** |
| **N-06** | **Alert-tagging writer not yet wired.** `tagAlertsWithEmulation` is defined but not invoked on alert generation; the badge / filter UI ships before the data the UI depends on does. | High | **Open** | Wire the writer into the rule-engine post-write hook before TP UI ships. Owner: Eng. | **TP** |
| **N-07** | **`createDefaultAllowlistConfig` defaults to `allowAll: true`.** Safe in the default-off-feature-flag world, but the moment `realExecution` flips on without operator configuration, every endpoint is allowed. | High | **Partial** | Change the default to `allowAll: false` with an empty `allowedHosts` set, so flipping the feature flag without configuring an allowlist results in a clean "no allowed hosts" 403 rather than wide-open dispatch. Owner: Eng + Sec. | **TP** |
| **N-08** | **`memory-dump` artifact persistence.** Successful memory dump leaves a (potentially large, potentially sensitive) file on the endpoint. Today the route doesn't document or paper over this. | Medium | **Open** | Document the artifact location + retention; consider auto-cleanup or operator-visible toggles. Owner: Eng. | **TP** |
| **N-09** | **Skill `content` claims about scope are load-bearing but not enforced.** The skill description tells the agent "no `validateRule`, no scenarios — do not invent calls". Agent compliance with skill content is best-effort; an injection or model regression can bypass it. | Medium | **Mitigated by surface** | The actual tool surface is the only path; the skill content is hints to the agent, not enforcement. The discriminated union schema is the real enforcement boundary. Document this clearly. Owner: Eng. | **TP** |
| **N-10** | **`emulation-rule-binding` saved object is hidden from HTTP APIs.** Good. **But** there is no admin-only inspection path, so a misconfigured binding cannot be debugged without a Kibana restart + console SO query. | Low | **Open** | Add an admin-only inspection endpoint or surface in Stack Management. Owner: Eng. | **Post-GA** |
| **N-11** | **Branch is 3 commits behind upstream `main` at the time of PR open.** Pre-commit results (type check, lint, jest) were captured at the merge-base. A rebase may surface drift. | Low | **Open** | Rebase before flipping out of draft. Owner: Eng. | **TP** |
| **N-12** | **Skill registration is conditional on `realExecution`.** If the flag is off, the skill is *not registered* with Agent Builder — meaning the catalog UI silently lacks the skill for non-real-execution operators. | Low | **Partial** | Decide: register the skill always with the tool rejected at the route, or keep current behavior and document explicitly in customer-facing docs. Owner: PM + Eng. | **TP** |

## 5. Summary

| Category | Mitigated | Partial | Deferred | Open |
|---|---|---|---|---|
| Safety (R-01..R-05) | 1 | 3 | 1 | 0 |
| Auth & abuse (R-06..R-10) | 0 | 3 | 2 | 0 |
| Compliance (R-11..R-13) | 0 | 0 | 1 | 2 |
| AI / detection (R-14..R-19) | 0 | 0 | 6 | 0 |
| Endpoint (R-20..R-21) | 1 | 1 | 0 | 0 |
| Privacy (R-24) | 0 | 0 | 1 | 0 |
| Operational (R-22, R-23, R-26) | 1 | 1 | 1 | 0 |
| Trust (R-25) | 1 | 0 | 0 | 0 |
| Process (R-27..R-32) | 2 | 1 | 0 | 3 |
| **New (N-01..N-12)** | **1** | **5** | **0** | **6** |

**TP-gate hot list** (the things the PM/Eng/Sec triad should expect to close before flipping `realExecution` on against any customer endpoint, ordered by likely-to-slip):

1. **N-05 / R-10** — Real `core.auditTrail` channel emission (today only a comment marker exists).
2. **N-07** — Flip default allowlist to deny-all so a misconfigured activation is fail-closed.
3. **N-06** — Wire the alert-tagging writer into the rule-engine post-write path (UI ships ahead of data otherwise).
4. **R-06** — Dedicated `emulation:execute` privilege + 2-person approval for production-tagged targets.
5. **R-05 / N-04** — Drop `mode: 'production'` from the union for TP; sign the marker so third-party SIEMs can verify provenance.
6. **R-11** — Legal: per-deployment EULA addendum required at activation.
7. **N-02 / N-03** — Idempotency cache + rate limiter survive restart and multi-pod (or document the bound clearly).
8. **R-08** — Cross-tenant integration test under Serverless concurrency.

## 6. Tracking surface

This document is the working register. Recommended companion surfaces, in order of preference:

1. **Sub-issues against [`#15974`](https://github.com/elastic/security-team/issues/15974)** — one per **TP**-gated row, with the row ID in the title (e.g. "R-06 / N-07 — emulation privilege + allowlist defaults"). This is what makes "owners" real.
2. **PR comment on [`#268854`](https://github.com/elastic/kibana/pull/268854)** — link to this doc + the TP-gate hot list so reviewers see the current shape on the PR page.
3. **OpenSpec `tasks.md`** — already references risk IDs in many tasks; the planning-track Phase 0 task list (37/45 done) is the implementation arm of the mitigation list above. Keep this register in sync with the tasks as items close.

This register lives in the planning OpenSpec change (`detection-emulation-skill-tech-preview-productize-`). Update it as PRs land. When a row flips to **Mitigated**, link the closing PR; when a deferred row becomes active (a phase opens), move it out of Deferred and re-score.

---
name: pnd-review
description: Review AlertZero/PND Watch definitions, managed workflows, and worker code against the POC operating-model contracts.
---

# AlertZero / PND Reviewer

## Overview

Perform a static PR review of AlertZero (formerly Project NotDaybreak / PND) changes against the POC operating-model contracts. The goal is to catch contract violations that unit tests do not cover — a Watch that drifts from the `Watch === workflow` 1:1 rule, a proposal that skips its evidence package, or an autonomy gate that is silently bypassed.

Produce actionable, PR-review-ready feedback. Push for conformance to the existing managed-workflow definitions over one-off implementations.

Important: Do not post GitHub comments unless explicitly stated by the calling workflow.

### Inputs

Changed files under any of:

- `src/platform/packages/shared/kbn-workflows/managed/definitions/pnd/**` — managed Watch and rule-workflow definitions (`*.ts` + `*.yaml` pairs).
- `x-pack/solutions/security/plugins/pnd/**` — the PND plugin.
- `x-pack/solutions/security/packages/kbn-pnd-common/**` — shared PND contracts.
- Security Solution files that register PND workers, skills, or evaluation suites.

### Reference contracts

Read these before reviewing — they are the source of truth, not this document:

- `.../managed/definitions/pnd/constants.ts` — `PND_MANAGED_WORKFLOW_PLUGIN_ID`, `PND_WATCH_MANAGEMENT`, `PND_RULE_WORKFLOW_MANAGEMENT`.
- `.../managed/definitions/pnd/index.ts` — the registry every Watch must be exported through.
- `.../managed/definitions/pnd/watch_floor.ts` + `watch_floor.yaml` — the canonical Watch shape to compare against.
- `.../managed/types.ts` — `ManagedWorkflowDefinition`.

## Critical checks

Work through these first, in order. Report any hit before ordinary findings.

### 1. Watch === workflow (1:1)

Every Watch must be exactly one managed workflow definition. A Watch that fans out into multiple workflow ids, or two Watches sharing one id, breaks the operating model.

- Each `watch_*.ts` exports one `*_WORKFLOW_ID` and one `*_WORKFLOW` object.
- The `.ts` definition and its `.yaml` template are a matched pair.
- Flag any Watch that dispatches to a second managed workflow to do its real work without that being an explicit, named sub-workflow.

### 2. Managed id convention

Watch ids follow `system-security-watch-<name>` (see `PND_WATCH_FLOOR_WORKFLOW_ID = 'system-security-watch-floor'`).

- Flag ids that omit the `system-security-` prefix, invent a new namespace, or are not kebab-case.
- The id constant must be exported, not inlined into the definition object.

### 3. Management block must use the shared constants

Watches must spread `PND_WATCH_MANAGEMENT`; rule workflows must use `PND_RULE_WORKFLOW_MANAGEMENT`.

- Flag any definition that hand-rolls `{ enablement, lifecycle, versionStrategy }` inline instead of referencing the constant — that is how the fleet drifts.
- Note the semantic difference: Watches are `lifecycle: 'dynamic'`, rule workflows are `lifecycle: 'static'`. Using the wrong constant is a Critical finding.
- `pluginId` must be `PND_MANAGED_WORKFLOW_PLUGIN_ID`, never the string `'pnd'`.

### 4. Tier tag present

Each Watch YAML carries `tags:` including `watch` plus its tier tag (`watch-floor`, `watch-deep`, `watch-dark`, `watch-officer`, `watch-detection`).

- Flag a new Watch with no tier tag, or a tier tag that contradicts the file name.

### 5. Template placeholders fully substituted

Watch YAML templates use `__WATCH_SETTINGS_VERSION__` and `__WATCH_AUTONOMY_LEVEL__`, substituted by `yamlTemplate` via `replaceAll`.

- Every placeholder appearing in the YAML must be replaced in the `.ts` `yamlTemplate`, and vice versa. An unsubstituted placeholder ships a literal `__WATCH_AUTONOMY_LEVEL__` into a running workflow.
- Flag use of `replace` instead of `replaceAll` — it silently substitutes only the first occurrence.

### 6. Registry export

A new Watch must be exported through `definitions/pnd/index.ts`. A definition file that is never registered is dead code that reviewers routinely miss.

### 7. Autonomy gate and approval requirement

Changes that let a Watch act without approval are the highest-risk change in this codebase.

- Flag any change that removes or weakens an approval requirement, widens a safe-tuning class, or raises an autonomy level without a corresponding evaluation.
- `enabled: false` in a Watch YAML is deliberate for POC Watches. Flag a change flipping it to `true` unless the PR explains why.

## General checklist

- **Evidence package.** Proposal-producing code attaches provenance (what the worker saw) alongside the recommendation. Flag proposals with a verdict but no evidence.
- **Callables from the executable graph.** Watch callables should be derived from the graph, not hardcoded name lists that drift.
- **Schedule projection.** A Watch declaring a schedule must project it consistently with its tier.
- **Prompt changes need eval coverage.** A changed worker prompt or skill without a matching eval-suite change is a finding — that is the whole trust argument for this project.
- **Don't relax the measurement.** Flag any eval change that raises a score by loosening a judge, dropping a hard case, or widening a tolerance. An accurate low score is the correct outcome.
- **Test the contract, not the mock.** Flag tests that assert against a mocked workflow runtime in a way that would pass even if the Watch definition were wrong.

## Reuse rules

- New Watches copy the structure of `watch_floor.ts` — same export shape, same constants, same `satisfies ManagedWorkflowDefinition<PndWatchTemplateValues>` annotation.
- Shared logic belongs in `kbn-pnd-common`, not duplicated per Watch.
- Flag a new local helper that duplicates something already in `kbn-pnd-common` or the managed-workflow package.

## Out of scope

- The `kbn-workflows` framework internals (a separate lane owns those).
- Backport PRs.
- General TypeScript style already enforced by lint.

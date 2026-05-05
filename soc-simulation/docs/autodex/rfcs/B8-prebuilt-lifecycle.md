# B8 — Prebuilt Rule Lifecycle chat skill (epic 17093)

> Status: **partially resolved 2026-05-05** — pure-logic upgrade-decision
> engine ships with full unit-test coverage; chat-skill registration and
> autonomous lifecycle workflow are deferred behind the same 17090.1–17090.4
> prerequisites enumerated in the
> [epic-17090 audit](../epic-17090-audit.md) §4.

## 1. The gap

Vision-doc §1.1.5 and the conformance matrix's chat-skill epic 17093 row
both flag this as missing entirely: there is no Prebuilt Rule Lifecycle
chat skill, no `prebuilt_rule_upgrade_advisor` engine, and none of the
prerequisite tools (`get_prebuilt_rule_diff`,
`preview_prebuilt_upgrade`, `apply_prebuilt_upgrade`,
`merge_prebuilt_upgrade`).

When upstream ships a new version of a prebuilt rule the user has
customised locally, today the choices are binary at the UI level —
overwrite the customisation, or ignore the upgrade entirely. There is no
3-way merge, no "this upgrade is breaking, halt", no "this upgrade
touches your detection surface, escalate to manual review". This is the
single largest source of stale prebuilt rules in the wild and the gap
the chat skill (and a future autonomous lifecycle workflow) closes.

The full chat skill needs three layers:

1. **Upgrade-decision engine** — given a snapshot of an installed
   prebuilt rule (with the user's customisations) and the available
   upstream upgrade (with its changed fields), decide auto-upgrade,
   merge-needed, manual-review, or skip-breaking. Pure logic, no agent
   dependencies.
2. **Prerequisite tools** — `get_prebuilt_rule_diff`,
   `preview_prebuilt_upgrade`, `apply_prebuilt_upgrade`,
   `merge_prebuilt_upgrade`. These are 17090.4 in the audit's four-step
   ramp.
3. **Skill plumbing** — a `getPrebuiltRuleLifecycleSkill()` factory that
   composes the tools into a conversational flow ("there are 23 prebuilt
   rules with available upgrades; 18 are auto-safe, 4 need a 3-way merge,
   1 is breaking — want to walk through them?").

Layer 1 is independently shippable and is the highest-leverage bit
because it's the same logic the autonomous lifecycle workflow (a future
B-tier follow-up) will run server-side. Layers 2 and 3 are sequenced
after 17090.4 lands; building them now would create a chat skill with no
tools to call.

## 2. What ships today (Layer 1)

- **Pure-logic upgrade-decision engine** —
  [`x-pack/.../server/lib/argus/governance/prebuilt_lifecycle_advisor.ts`](../../../../x-pack/solutions/security/plugins/security_solution/server/lib/argus/governance/prebuilt_lifecycle_advisor.ts).
  `evaluatePrebuiltLifecycle(snapshot, thresholds?) → PrebuiltLifecycleRecommendation`.
  24 unit tests cover threshold resolution (clamping, flooring,
  non-finite handling, dedup + sort of `protected_fields`), all five
  verdict branches, proposal generation, defensive coercion of malformed
  field lists, deterministic output, and edge cases (empty
  `changed_fields`, `target_version === installed_version`).
- **Verdict matrix** — the order of evaluation matters and is
  deliberate:

  | # | Condition | Verdict | Action(s) |
  |---|---|---|---|
  | 1 | `available_upgrade` is null OR `target_version === installed_version` | `no_upgrade_available` | `log_only` |
  | 2 | `breaking_change === true` AND any local customisation exists | `skip_breaking` | `propose_skip_breaking` + `open_review_case` |
  | 3 | No conflicts (no overlap between customised and changed fields) | `auto_upgrade` | `propose_upgrade` |
  | 4 | Conflicts touch any `protected_fields` entry OR conflict count ≥ `manual_review_conflict_floor` | `manual_review` | `propose_merge` + `open_review_case` |
  | 5 | Otherwise (conflicts exist but small, no protected fields hit) | `merge_needed` | `propose_merge` |

  Step 2 is intentionally evaluated *before* the conflict math: a
  breaking upstream change with any local customisation should never be
  silently merged, even if the customised fields don't overlap with the
  changed fields, because the breaking flag itself signals
  schema/semantics drift the user couldn't have anticipated when they
  customised.

- **Default thresholds**:
  - `manual_review_conflict_floor: 3` — three or more concurrent
    conflicts is enough complexity that a human should look. Overridable
    per call.
  - `protected_fields: ['query', 'threshold', 'language', 'index', 'type']`
    — fields that change the rule's *detection surface*. Any conflict
    touching these escalates regardless of count, because applying the
    upstream change would meaningfully alter what the rule fires on.

- **Proposals are concrete and machine-actionable**:
  - `upgrade` — `{ target_version, preserves_customised_fields }`.
  - `merge` — `{ target_version, conflicts, safe_fields }`.
  - `skip_breaking` — `{ target_version, reason }`.

  Each carries enough information for a 17090.4 tool to execute the
  recommendation without re-running the analysis.

- **Audit replay**: `thresholds_applied` is stamped on every
  recommendation, so a downstream consumer (chat skill, autonomous
  workflow, governance log) can reconstruct the exact policy used.

## 3. Why this lives in `lib/argus/governance/`

`governance/` already houses `rule_tuning_advisor.ts` (B7), the gate
threshold resolver (B6), and the crown-jewel impact evaluator (B5).
Co-locating B8 keeps all three "what should AutoDEX *propose* about a
rule" engines together — they share the operator-tunable threshold
pattern and the `RuleTuning*` / `PrebuiltLifecycle*` /
`GateThresholds*` envelope shape.

## 4. What's deferred

- **Chat skill registration** — `getPrebuiltRuleLifecycleSkill()`
  factory + Agent Builder manifest entry. Blocked on 17090.4 (no tools
  to call yet).
- **Prerequisite tools** — `get_prebuilt_rule_diff`,
  `preview_prebuilt_upgrade`, `apply_prebuilt_upgrade`,
  `merge_prebuilt_upgrade`. These are 17090.4 deliverables.
- **Autonomous lifecycle workflow** — a `soc-prebuilt-lifecycle.yaml`
  workflow that scans `.kibana_security_solution` for prebuilt rules
  with available upgrades, runs `evaluatePrebuiltLifecycle` on each, and
  emits a recommendation per rule. Trivially layerable on top of Layer 1
  once a workflow step can call into the package.
- **Storage envelope** — `PrebuiltLifecycleRecommendation`s aren't
  persisted to a `.soc-*` index yet. When the autonomous workflow lands
  it will write to (or extend) `.soc-skill-recommendations` (the index
  template B9 just shipped). The pure-logic shape is forward-compatible
  with that envelope.

## 5. Migration path (when 17090.4 lands)

1. Land 17090.4 prerequisite tools (`get_prebuilt_rule_diff`,
   `preview_prebuilt_upgrade`, `apply_prebuilt_upgrade`,
   `merge_prebuilt_upgrade`).
2. Add `getPrebuiltRuleLifecycleSkill()` to
   `getSecuritySkillsManifest`. Skill body composes the tools using the
   `evaluatePrebuiltLifecycle` recommendation as the routing brain:
   - `auto_upgrade` → `apply_prebuilt_upgrade`.
   - `merge_needed` → `preview_prebuilt_upgrade` →
     `merge_prebuilt_upgrade`.
   - `manual_review` / `skip_breaking` → emit a review case, do not
     auto-apply.
3. Add `soc-prebuilt-lifecycle.yaml` workflow that runs the same logic
   on a schedule and writes recommendations to
   `.soc-skill-recommendations` (or a dedicated
   `.soc-prebuilt-lifecycle` index — TBD when persistence is wired).
4. Add a Pulse-panel tile: "prebuilt upgrades available — N auto, M
   merge, K manual" — shares the existing `governance_pulse` plumbing
   from B11/B12.

## 6. Test coverage

- 24 unit tests in `prebuilt_lifecycle_advisor.test.ts`.
- `resolvePrebuiltLifecycleThresholds`: defaults, partial overrides,
  fractional flooring, sub-1 clamping, non-finite fallback,
  dedup + sort + non-string scrub of `protected_fields`, explicit
  empty-list handling.
- `evaluatePrebuiltLifecycle`: every verdict branch, every proposal
  shape, defensive coercion of malformed `customised_fields`, the
  precedence of `skip_breaking` over conflict math, the precedence of
  `protected_fields` over the conflict-count floor, deterministic
  output, sort stability of conflicts/safe_fields, edge cases
  (`available_upgrade=null`, `target_version===installed_version`,
  `changed_fields=[]`).

## 7. Risks & mitigations

- **Risk**: the `protected_fields` default list goes stale as the rule
  schema evolves (e.g., `query_language` is added).
  **Mitigation**: list is per-call overridable; the autonomous workflow
  in §4 will read it from a config doc the security-team owns, not bake
  it into the engine.
- **Risk**: a single rule with 50+ customisations and 50+ changed
  fields produces a noisy `merge` proposal.
  **Mitigation**: `manual_review_conflict_floor` (default 3) catches
  these — anything ≥ 3 conflicts escalates regardless of which fields
  hit.
- **Risk**: a future upstream version flips `breaking_change` from
  `false` to `true` mid-deploy.
  **Mitigation**: each evaluation reads the *current* upstream
  metadata; there is no caching of upgrade decisions across runs.

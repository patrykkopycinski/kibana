# @kbn/argus-console

Shared-browser package that hosts the ARGUS Console — a demo-grade React
surface mounted inside Security Solution at `/app/security/argus`.

## Panels

### Read surfaces

- **`PulsePanel`** — top-of-fold "is ARGUS working" summary, composed of
  Lens embeddables that match the `soc-command-center` dashboard 1:1.
- **`ActivityFeedPanel`** — chronological cross-layer event stream with
  filter chips and per-row deep-links to Discover / Reasoning / Alert.
- **`MutationLineagePanel`** — fixed-topology 9-node DAG of a mutation's
  lifecycle, rendered as a hand-written SVG (no third-party graph lib).
- **`ReasoningDrilldownPanel`** — vertical timeline of the M2.5 reasoning
  trace for a given alert or run, with confidence / delta / injection
  flags / trust-tier-at-decision annotations.
- **`MutationsPanel`** — ledger of per-mutation verdicts (applied /
  rolled back / blocked) with row-level Approve / Reject for human
  review of blocked mutations.
- **`E2dFlowPanel`** — full exploit-to-detection flow (CVE → adapter →
  proposal → backtest → applied rule → live hits).
- **`ProposalsPanel`** — Pareto-optimized rule candidates including
  chosen, frontier, and dominated options with per-row "dominated by
  X on axis Y" explanations.
- **`AutonomyDecisionsPanel`** (Phase C) — lineage of recent autonomy
  decisions: auto-applied, deferred, required-human, rejected,
  rolled-back. Sourced from `.soc-autonomy-decisions`.
- **`CoverageGapsPanel`** (Phase C) — detection-coverage gaps sourced
  from `.soc-coverage-gaps`, severity-classified by occurrence count
  and average confidence.
- **`CalderaQueuePanel`** (Phase C) — live Caldera attack queue plus
  seeded adversary profiles and current difficulty level. Sourced
  from `.soc-attack-commands`, `.soc-attack-profiles`, and
  `.soc-difficulty-state`.

### Write surfaces (Phase C)

- **`KillSwitchChip`** — always-visible header chip that shows the
  global autonomy kill-switch state. Privileged users can toggle via
  a confirmation modal; the UI applies the change optimistically and
  rolls back on backend failure. Sourced from `.soc-kill-switch`.
- **Approve / Reject row-actions on `MutationsPanel`** — confirmation
  modal (rejections require a reason), optimistic UI with rollback,
  audit-trail entry per action. Backend transitions the recommendation
  to `approved_by_human` / `rejected_by_human` in `.soc-recommendations`.

## Read-model single source of truth

`ArgusReasoningChainBuilder`, `ArgusMutationLineageBuilder`, and the
Phase-C builders (`buildAutonomyDecisions`, `buildCoverageGaps`,
`buildCalderaQueue`, `buildKillSwitchState`) are the only read-model
transformations. They are imported by **both** the internal HTTP
routes (`/internal/security_solution/argus/...`) and the Agent Builder
skill handler, so the panel and the skill cannot drift.

## Feature flag + privileges

The console mounts only when:

- `xpack.securitySolution.enableExperimental` includes `argusConsoleEnabled`
- the current user has `capabilities[SECURITY_FEATURE_ID].argus_read`
  (surfaced by the base `siemV5` Kibana feature; `SECURITY_FEATURE_ID`
  evaluates to `'siemV5'` at runtime)

Write affordances (kill-switch toggle, Approve / Reject) are gated on
`capabilities[SECURITY_FEATURE_ID].argus_all` in the UI and
`securitySolution-argus_write` server-side. Read-only users never see
write affordances; the server also rejects writes without the API
capability.

See `openspec/changes/argus-console-app-route/` for the full design
and `soc-simulation/docs/argus/capability-and-gap-analysis.md` for the
Phase-C "complete ARGUS story" scope.

## Audit trail

Every write action (kill-switch toggle, mutation approve / reject)
appends a row to `.soc-audit-trail` with actor, from/to state, reason,
and a correlation id. Audit-write failures log a warning but do not
abort the primary transaction.

## Scope

This package ships the demo-grade surface. Phase D — Scout coverage,
i18n resolution, telemetry, Storybook, bundle budget, full a11y — is
a follow-up change.

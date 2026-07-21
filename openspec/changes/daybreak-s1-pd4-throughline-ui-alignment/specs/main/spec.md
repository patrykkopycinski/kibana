# Specification

## Requirements

> Scope source: the six "What Changes" bullets of the `daybreak-ui-panel-throughline-prototype` proposal. Every requirement below maps to one of those bullets. Existence/absence assertions and data-contract constraints are grounded in `research.md` (findings §1–§6); product-behaviour rows trace to the shape notes (`FR-4`, `FR-7`, `FR-9`, `FR-11`, `NFR-2`, `A-5`, `PD-4`).

### Prerequisites (Prototype & PD-2 Stores Present)

- **FR-001 MUST** — The Throughline prototype source (`Throughline.dc.html`, `throughline-app.js`, `support.js`) MUST be present in the repository before any surface is ported, because it is absent from the working tree and from all git history — every prototype symbol/line reference in the proposal is currently unverifiable. (research.md §1; what-changes bullets presuppose the prototype exists.)
- **FR-002 SHOULD** — Each ported surface SHOULD be recorded against the prototype revision it was diffed against, making the required re-vendor/diff-before-port contract auditable. (operator description: "Re-vendor / diff against the prototype before implementing each surface.")
- **FR-003 MUST** — PD-2 worker-core output (the Evidence and Proposal stores at `x-pack/solutions/security/plugins/daybreak/server/client/{evidence,proposals}/`) MUST be present on the feature worktree before UI is built against it; it is not present at the worktree HEAD today. (research.md §2; proposal Open Questions / operator Dependencies.)

### Design Token System & Theming

- **FR-004 MUST** — The `public/` layer MUST define a design-token system ported from the prototype — CSS custom properties for neutrals, semantic, thread-type, and shape tokens — mapping each onto the nearest EUI theme token where a 1:1 equivalent exists and defining the deltas explicitly. (What Changes: Design token system + theming.)
- **FR-005 MUST** — The token system MUST support both light and dark themes and MUST default to the prototype's dark build. (What Changes: Design token system + theming.)
- **FR-006 MUST** — Tokens and theme overrides (accent/theme/radius/shadow) MUST be consumed by the plugin's React tree through a `theme.ts` module, not inlined as hardcoded values. (What Changes: Design token system + theming.)
- **FR-007 SHOULD** — The ported-token → EUI-token mapping SHOULD be captured as a reference table alongside `theme.ts` so future surface ports stay consistent. (Suggested enhancement, not in original description.)

### Application Shell & Route Registration

- **FR-008 MUST** — The daybreak plugin MUST expose a `public/` directory that registers a top-level Kibana application route; today the plugin is `browser:false`/server-only and registers no application route. (What Changes: Application shell; research.md §3.) Forward: design/specs must confirm `browser:true` and an application-route registration are in PD-4 scope, since neither exists.
- **FR-009 MUST** — The application route MUST be gated default-off so it is safe to merge mid-spike; when the flag is disabled, no daybreak UI MUST render. (`NFR-2`.) Forward: the proposal's "experimental flag via `experimentalFeatures`" does not match the code — the only existing gate is the `xpack.daybreak.enabled` config boolean (default `false`), with no `experimentalFeatures` entry (research.md §4); the exact gating mechanism is a design decision.
- **FR-010 MUST** — The top-level React route component MUST render the application shell — the left rail, thread list/nav, main stage, and composer. (What Changes: Application shell.)
- **FR-011 SHOULD** — UI components SHOULD expose stable, assertable loading and data-populated states so E2E assertions use explicit wait-for-state rather than fixed timeouts. (`A-5`, reconciled to PD-4.)

### Thread / Conversation View

- **FR-012 MUST** — A thread/conversation view MUST render message bubbles (user/assistant/tool), tool-call cards, evidence/timeline/narrative/MITRE panels, status dots, severity pills, and an inspector. (What Changes: Thread / conversation view.)
- **FR-013 MUST** — Thread types MUST cover case / investigation / hunt / incident / chat. (What Changes: Thread / conversation view.)

### Brief / Radar Dashboard

- **FR-014 MUST** — A brief/radar dashboard MUST render the operator landing page summarizing open threads, awaiting-review items, and suggested next actions. (What Changes: Brief / radar dashboard.)
- **FR-015 SHOULD** — The dashboard SHOULD include the radar-page and chat-dock docking logic ported from the prototype. (What Changes: Brief / radar dashboard.)

### Permission / Gate Approval Flow

- **FR-016 MUST** — The gate-approval UI MUST present the three-tier model: read & gather auto-runs / assemble & draft proposed as a diff / world-changing actions need approval. (What Changes: Permission / gate approval flow; `FR-7` hook 6.)
- **FR-017 MUST** — Accepting a Proposal gate in the UI MUST apply the proposal by invoking the existing server readiness gate, and the transition to `approved` MUST fail closed unless `evidenceRefs` is non-empty AND `recommendation` is non-empty. (`FR-7` hook 7; grounded in research.md §5 — `evaluateReadinessGate(proposal, targetStatus)` returning `GateResult`, `requireReadinessGate` throwing `ReadinessGateError`, in `proposals/gate.ts`.)
- **FR-018 MUST** — When the gate fails, the UI MUST surface the specific missing requirement returned by the gate (`evidence` or `recommendation`), not a generic error. (grounded in research.md §5 — `MissingRequirement` union.)
- **FR-019 MUST** — The gate/status UI MUST reflect the 7-value `ProposalStatus` union: `new | needs-evidence | approved | modified | dismissed | escalated | deferred`. (grounded in research.md §5 — `proposals/types.ts`.)

### Data Wiring (Real, Not Mocked)

- **FR-020 MUST** — The UI MUST render real worker output — Evidence from the PD-2 Evidence store and Proposals from the PD-2 Proposal store — fetched via the plugin's HTTP API, fully replacing the prototype's in-memory `freshState()` seed data; no demo seed may reach the rendered UI. (What Changes: Data wiring; `FR-4` hook 3, `FR-7` hook 6, `FR-11`.)
- **FR-021 MUST** — Rendered Proposal records MUST conform to the PD-2 `ProposalProperties` shape, including `status` (the 7-value union), `severity` (`low|medium|high|critical`), `confidence`, `evidenceRefs`, `recommendation`, `approvalRequirement` (`manual|automatic`), and `decisionHistory`. (grounded in research.md §5 — `proposals/types.ts`.)
- **FR-022 MUST** — Rendered Evidence records MUST conform to the PD-2 `EvidenceProperties` shape, including `kind` (`alert|event|entity|timeline|query|assumption|external`), `summary`, `provenance` (`capability|skillVersion|tool`), `confidence`, `stance` (`for|against`), and `sensitivityLabel` (`public|internal|restricted`). (grounded in research.md §5 — `evidence/types.ts`.)
- **FR-023 MUST** — A plugin HTTP API MUST exist to expose the Evidence and Proposal stores to the `public/` layer; no such API exists today, so PD-4 MUST add it as part of data wiring if PD-2 did not. (What Changes: Data wiring references "the plugin's HTTP API"; research.md §6 — no HTTP API exposes the stores today.)

Written to `openspec/changes/daybreak-s1-pd1-workflow-engine-spike/design.md`. The lint rejection on the prior attempt was a single missing literal — it cited "research Finding N" / "the research brief" everywhere but never the exact string `research.md`. This version grounds claims in research.md by name (Summary, Findings 2/3/5/6/7, Open Questions) alongside verified `file:line` anchors, and cites the shape-note FR-/PD-/A- ids.

Key design decisions, each tied to evidence:

- **The correction the proposal forces.** The proposal gates the spike behind "the existing `daybreak` experimental feature flag," but research.md Finding 6 + an exhaustive `grep -rin daybreak` confirm no such plugin/flag exists — matches live only inside the OpenSpec files. PD-1 is greenfield on that axis, so the design has it scaffold a new plugin + flag (mirroring `security_solution/server/plugin.ts:221`) and flags it `Forward: tasks`.
- **Confirmatory, not exploratory.** All three primitives (`kibana.request` / `if` / `connector`) are first-class step types (Finding 2), and the `streams` workflow ships the HTTP→guard composition (`continuous_extraction_workflow.yaml:56,73-74`). The spike consumes `executeWorkflow` (`plugin.ts:794`) + `WorkflowRunFixture` and writes no new engine code.
- **Shipped syntax over README syntax** (Finding 7) — `type: if` + `condition:` + nested `steps:`, not the README's `action:`/`params:`.
- **Stub-vs-real connector decision** resolves the proposal's open question: real envelope (`type: .inference` / `connector-id`), `echo_inference` backing in test, `connector-id` swap deferred to PD-2 so A-1 stays in PD-2.
- **FR-6's fail-closed guard is not an engine built-in** (research Open Questions) — surfaced as a PD-2 boundary concern, not claimed as engine capability.
- **Honest failure modes:** the A-2 worst case (refute → documented custom-orchestration fallback, labeled not-core), the `executeWorkflow` completion-semantic race, connector type-split mismatch, condition-DSL form fork, and the greenfield build-break risk.

The four `Forward: tasks` notes carry the work the task-list wave still needs to pick up (plugin scaffolding, completion semantic, condition-DSL pinning) so this design doesn't silently solve them.

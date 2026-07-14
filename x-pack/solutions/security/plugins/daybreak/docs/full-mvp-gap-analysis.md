# Full October MVP — gap analysis (10x-frame)

**Milestone:** October 2026 MVP (9.6 feature freeze per planning timeline)  
**Bet:** Prove the **operating model end-to-end** — durable agentic workers, platform primitives, conditional Dark/Deep Watch — not only Black Hat single-worker demo.  
**Worktree:** `~/Projects/kibana.worktrees/daybreak-spike` (`daybreak-spike`)  
**Updated:** 2026-07-14 (validated — offline + live 10/10 smoke) (validated — offline + live 10/10 smoke)

---

## Scope boundary: spike vs full MVP

| Layer | Black Hat spike (closed) | Full October MVP (this doc) |
|---|---|---|
| Primary worker | Alert-analysis FPR | + investigation, response-action, forensic workers |
| Primitives | Proposal, Evidence, Investigation, SSE, Eval Record | + **Action Result** (was missing) |
| Dark Watch | Not in spike bet | SKI + hunt proposals + `hunt_finding` SSE (conditional P2) |
| Deep Watch | Forensic worker stub | Live forensic path + specialist draft (conditional P3) |
| Quality | Offline 7/7 + live smoke | + weekly matrix 9.5, BK required check, golden OTLP |
| Platform | Spike adapters | #17942 ratification, #17944 HITL, #17960 customer-zero |
| Endpoint | Stub default | Live Fleet dispatch option |

---

## Gap inventory

### A. Platform primitives

| Primitive | Status | Resolution |
|---|---|---|
| Proposal | **closed** (spike-canonical) | Export for #17942; not ratified |
| Evidence | **closed** | P5 sensitivity labels partial |
| Approval Gate | **partial** | Spike adapter; #17944 upgrade |
| **Action Result** | **closed** | New `action_results` client + Act route persistence |
| Investigation | **closed** | Nightshift alignment P11 open |
| SSE | **closed** (spike slice) | CRUD + `resolveFindingType` for dark-watch/coverage |
| Evaluation Record | **closed** | |
| Watch | **closed** | Config/status in watches API |

### B. Watch capabilities

| Capability | Status | Resolution |
|---|---|---|
| Watch Floor FPR | **closed** | 7/7 live + offline gate |
| AD integration | **closed** (spike slice) | 6-scenario offline gate + live smoke (`attack_discovery_adapter`, `full_mvp_capability_gate`) |
| **Dark Watch** | **closed** (spike slice) | SKI store + `/proposals/from-hunt` + hunt_finding SSE |
| Deep Watch / forensic | **closed** (stub slice) | Forensic routes + live `forensic-stub` smoke step on escalated investigation |
| Endpoint response | **partial** | Stub default; live needs Fleet (P7) |

### C. CI / eval / evidence

| Item | Status | Blocker |
|---|---|---|
| Offline eval gate | **closed** | |
| Live smoke 10-step | **closed** | action-result roundtrip, sse-hunt-finding, forensic-stub |
| Weekly matrix 9.5 | **blocked** | `fix/weekly-evals-matrix` + OTLP |
| Buildkite required check | **partial** | Pipeline file at `.buildkite/pipelines/daybreak-eval-gate.yml`; monorepo merge still blocked |
| Golden OTLP traces | **partial (local)** | `data/daybreak-golden-otlp-traces.json` on `:5631` stack; cloud golden cluster still separate |
| Full MVP verification JSON | **closed** | `data/daybreak-mvp-verification.json` — `codeFixableGatesPassed: true` |

### D. Platform / org (not code-closable in spike)

| ID | Gap | Owner |
|---|---|---|
| P4 | Shared HITL gate | security-team #17944 |
| P5 | Proposal ratification | security-team #17942 |
| P6 | Customer-zero sign-off | security-team #17960 |
| P7 | Live Defend dispatch | endpoint-lab + Fleet enrollment |
| — | Platform execution gaps (Task Manager, background agents, AD handoff APIs) | See `elastic/project-daybreak` `unblockers/GAPS.md` (2026-07-14) + `unblockers/execution-capacity.md` |
| P1 | Final MVP capability list | James/Product (planning P1) |
| P2 | Dark Watch inclusion gate | Product (conditional) |
| P3 | Deep Watch slice | Product (conditional) |

---

## Code-fixable closure plan (this cycle)

1. **Action Result** — storage, client, routes, Act route write-through, tests
2. **SKI + hunt proposals** — SKI CRUD, hunt adapter, `/proposals/from-hunt`, smoke step
3. **SSE findingType** — map `dark-watch` → `hunt_finding`, `coverage_gap` when applicable
4. **Harness** — extend `mvp_gate_verification.mjs` + `watch-floor-gap-status.md` full MVP section
5. **Docs** — this file + `full-mvp-frame-brief.md`
6. **Schema export** — `scripts/export_spike_schemas.mjs` → `data/daybreak-spike-schema-export.json` (#17942 diff artifact)
7. **Capability offline gate** — `server/evals/full_mvp_capability_gate.test.ts`

## Blocked items (track, do not mark closed)

- Matrix 9.5, BK required check → weekly evals infrastructure
- Golden OTLP (local spike): green capture script + artifact; cloud `kbn-evals-serverless-ed035a` still out of scope
- #17942 / #17944 / #17960 → platform epics
- Live Fleet → endpoint-lab profile with `DAYBREAK_STUB_ENDPOINT_ACTIONS=0`

---

## Validation status (2026-07-14)

| Gate | Result |
|---|---|
| ci_run_daybreak_gates.sh | PASS |
| mvp_gate_verification.mjs (offline) | PASS — codeFixableGatesPassed: true |
| Live smoke (RUN_LIVE=1, :5631) | PASS — 10/10 steps |
| data/daybreak-mvp-verification.json | Written on each run |

Fixes landed this session: AD 6th scenario; resolveFindingType for dark-watch SSE; plugin executeDaybreakWorker contract; managed workflow registry wiring; DAYBREAK_ACTION_RESULT_SCHEMA_VERSION; action-result persistence on act/response; route registration for action-results, AD, hunt, SKI.

Still platform-deferred (not closable in spike): section D + elastic/project-daybreak unblockers/GAPS.md.

## Verification (full MVP harness)

```bash
cd ~/Projects/kibana.worktrees/daybreak-spike

# Extended offline gates (includes action_result + hunt_adapter)
bash x-pack/solutions/security/plugins/daybreak/scripts/ci_run_daybreak_gates.sh

# Full MVP verification (offline + optional live)
node x-pack/solutions/security/plugins/daybreak/scripts/mvp_gate_verification.mjs
RUN_LIVE=1 KIBANA_URL=http://localhost:5631 node x-pack/solutions/security/plugins/daybreak/scripts/mvp_gate_verification.mjs
```

---

## References

- `docs/full-mvp-frame-brief.md` — 10x-frame reframe
- `docs/blackhat-mvp-gap-analysis.md` — spike scope
- `docs/watch-floor-gap-status.md` — 13-gap checklist
- `elastic/project-daybreak/unblockers/GAPS.md` — platform gap table (Jul 14)
- `elastic/project-daybreak/unblockers/execution-capacity.md` — Task Manager / Workflows load model

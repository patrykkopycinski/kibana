# Frame Brief: Full October Daybreak MVP

> Framing step before full-MVP gap closure. Separates Black Hat spike (one worker) from October MVP operating model.

## Reported Observation

Operator requests **full MVP scope** and closure of **all gaps** — moving beyond the Black Hat spike bet (one alert-analysis FPR worker + E&T pack).

## Initial Framing (preserved)

- **User stated cause/approach:** Spike closed 13 Watch Floor gaps; remaining P1–P7 items are "post-demo" — user now wants those + planning PRD capabilities addressed.
- **User proposed direction:** Use 10x-frame → implement/fix everything for full MVP.
- **Pre-dispatch narrowing:** Full October MVP per `daybreak-planning` platform primitives + conditional Dark/Deep Watch — not just Watch Floor FPR.

## Dimension Map

1. **Spike completeness** — 13 gaps closed; Black Hat demo-ready ← prior framing
2. **Platform primitive coverage** — Proposal/Evidence/Investigation/SSE/Eval Record exist; **Action Result missing** ← primary code gap
3. **Conditional capabilities** — Dark Watch (SKI/hunt), Deep Watch (forensic partial), AD integration (partial)
4. **External platform deps** — #17942, #17944, #17960, weekly matrix 9.5, Fleet live dispatch ← blocked
5. **CI/quality gates** — offline gates exist; BK + matrix + OTLP deferred

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
|---|---|---|
| Spike = full MVP | `blackhat-evidence-pack` §0 explicitly excludes matrix/platform/Fleet | **NONE** |
| Missing primitives block MVP | No `action_results` client; SSE always `escalation_request`; no SKI | **STRONG** |
| All gaps code-fixable | P4–P7, matrix 9.5 need platform/epics/Fleet | **WEAK** |
| Dark Watch required for MVP | P2 conditional in planning PRD; spike has SSE schema only | **PARTIAL** |

## Reframed Problem Statement

> **The actual problem to plan around is**: close **code-fixable full-MVP primitive gaps** in `daybreak-spike` (Action Result, Dark Watch/SKI/hunt proposals, SSE finding types, extended gates) while **explicitly tracking** platform-blocked items (HITL #17944, ratification #17942, customer-zero #17960, matrix 9.5, live Fleet) as post-spike bets — not pretending spike closure equals October MVP ratification.

## Confidence: **HIGH** for reframe (spike ≠ full MVP). **MEDIUM** for Dark Watch inclusion (P2 still open in planning).

## What Changes for Implementation

1. Implement missing **Action Result** primitive and wire Act routes.
2. Implement **SKI + hunt proposal** slice for Dark Watch credibility.
3. Fix **SSE findingType** mapping by capability.
4. Extend verification harness + gap status doc for full MVP inventory.
5. Document blocked gaps with owners — do not mark closed without external resolution.

## References

- `docs/blackhat-mvp-gap-analysis.md` — spike vs post-demo P1–P7
- `docs/full-mvp-gap-analysis.md` — full inventory
- `daybreak-planning/context/foundation/prd-capabilities/platform-primitives.md`

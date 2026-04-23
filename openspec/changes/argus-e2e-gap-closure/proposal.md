# Argus E2E Gap Closure — Proposal

## Problem Statement

Argus currently scripts its entire Exploit-to-Detection chain via `run_e2e_demo.sh`, which directly writes `.soc-cve-advisories`, `.soc-recommendations`, `.soc-mutation-intents`, `.soc-detection-eval-runs`, `.soc-backtest-results`, and `.soc-outcomes` via curl. The real workflows exist but are disconnected — they **reconcile** artifacts the CLI already created rather than **producing** them autonomously.

Six gaps prevent true E2E autonomy:

| Gap | Layer | What's Missing |
|-----|-------|----------------|
| G-E2E-1 | Sense | No alert-to-hypothesis bridge |
| G-E2E-2 | Hypothesize | Rule synthesis is CLI-only |
| G-E2E-3 | Validate | Eval writes synthetic scores |
| G-E2E-4 | Validate | Shadow-to-applier status handoff broken |
| G-E2E-5 | Act/Govern | No auto-detection of bad rules / rollback |
| G-E2E-6 | All | Reasoning traces are scripted |

## Proposed Solution

Close all six gaps plus add a seventh workstream (Coverage Initialization) from the Dex Autonomous Sprint, creating a fully autonomous loop:

1. **Alert-to-Hypothesis workflow** — watches alerts, creates advisories
2. **Auto-triggered synthesis** — E2D reconciler calls agent for synthesis
3. **Real eval scoring** — runs draft queries against variant corpus
4. **Shadow-to-applier fix** — audit and fix status handoff chain
5. **Rule health monitor** — FP detection + auto-rollback (sprint FP tuning)
6. **Trace emission** — reasoning traces from all workflows
7. **Coverage initializer** — prebuilt rule enablement (sprint coverage init)

## Sprint Integration

Incorporates patterns from the Dex Autonomous Sprint (April 13-21, 2026):
- FP Tuning 7-step pipeline (PR #263002)
- Coverage Initialization heuristic (PR #263250)
- Event-driven trigger patterns

## Success Criteria

- Full E2E: Caldera attack -> alert -> advisory -> synthesis -> eval -> shadow -> apply -> rule fires -> health monitor (no scripted shims)
- Coverage initializer proposes prebuilt rules based on installed integrations
- FP tuning proposes exceptions before rollback
- All decisions emit reasoning traces visible in Argus Console

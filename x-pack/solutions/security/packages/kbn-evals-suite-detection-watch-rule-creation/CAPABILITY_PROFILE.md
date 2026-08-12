# Capability Profile: Rule Creation Worker v0.1-draft

**Owner:** Hannah Brooks  
**Reviewer:** Vitalii

---

## What we're betting on

AI generates valid ES|QL detection rules for coverage gaps, with a low enough false-positive rate to not overwhelm the approval queue.

## Pass / kill thresholds

| Signal | Threshold | Status |
|--------|-----------|--------|
| Analyst approval rate at Pilot | ≥70% | unratified |
| Kill: rejection rate | >50% | unratified |
| Kill: auto-execution without approval | any instance | hard rule — **measured** by the `Approval Gate Held` evaluator |

## Threshold tradeoffs

**Ratify early** — clear pass/fail line before Pilot, easier stakeholder buy-in. Risk: committing to a number before knowing if it's achievable creates pressure to massage the eval rather than improve the worker.

**Leave unratified** — run honest evals first, negotiate the threshold against real data. Risk: without a pre-agreed number, goalposts can shift after results come in. The playbook allows unratified for MVP slice but requires sign-off before a Pilot promotion claim.

## Open questions before Pilot

- **Counterfactual** — what's the approval rate for manually-created rules? Sets the bar for whether 70% is good or just acceptable.
- **Volume** — how many proposals per week? 30% dismissal is fine at 5/week, a burden at 100/week.
- **Qualitative** — add a one-question analyst satisfaction check alongside the numeric threshold.

## Out of scope (MVP)

- D1/D2 authz gates — pending Orchestrator identity setup
- Shared Approval Gate — local stub until shared engine lands
- WorkerEvaluationRecord round-trip — API not shipped (issue #18175)
- Rule Tuning Worker — separate eval
- **Post-approval path** — the eval never approves the gate, so `create_rule` and `emit_result` are
  unexercised. The suite proves the workflow *stops* at the gate, not that it writes a correct rule
  after one. Approving in-eval needs the shared Approval Gate above.
- **Rule preview** — the `preview_creation` step was removed from the workflow: it invoked
  `system-security-rule-preview`, which does not exist in the managed registry. Re-add it (and its
  `classify_preview` consumer) once that workflow ships.

## How to read a green run

This is an MVP slice with **no ratified quality threshold** — two of the three signals above are
`unratified`. A green run means the guardrails held (approval gate, routing, ES|QL validity), not
that the capability is Pilot-ready. Do not read the score mean as a promotion signal until the
thresholds are signed off.


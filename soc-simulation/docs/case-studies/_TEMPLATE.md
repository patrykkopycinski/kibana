---
id: <stable-kebab-case-id>
date_observed: YYYY-MM-DD
date_accepted: YYYY-MM-DD
status: probation # active | probation | retired | disputed
owner: <agent-id-or-human-handle>
linked_recommendations: []
linked_rules: []
linked_exceptions: []
mitre:
  - tactic: TAxxxx
    technique: Txxxx
---

# <Plain-English pattern title>

## Pattern statement

<Max 5 sentences. WHO / WHAT / WHERE / WHEN / WHY.>

## Evidence

### Tier 1 — Observed behavior

<ES|QL or KQL queries + 3–5 sample events.>

### Tier 2 — System outcome

<Links to .soc-outcomes / .soc-triage-results; disposition + confidence distribution.>

### Tier 3 — Mutation history

<Links to .soc-evolution-log entries; before/after queries for redesigns.>

### Tier 4 — Negative evidence check

<Rejected recommendations searched against; how this case study addresses them.>

## Impact

<What changed after acceptance (rule/exception/threshold)? Measured effect.>

## Hypothesis-on-probation?

<true if accepted on 2 tiers only. Define automatic retirement rule.>

## Retirement criteria

<Minimum: "no new corroborating evidence in N days" AND "if linked rules are
disabled or deprecated.">

## References

<Linked docs, tickets, conversations, prior case studies.>

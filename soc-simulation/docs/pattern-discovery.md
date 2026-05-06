# Pattern Discovery in ARGUS

> Pattern discovery is the repeatable process by which ARGUS moves from raw
> evidence (alerts, outcomes, evolution-log events) to _durable_ hypotheses
> that change the system's behavior. This document is the methodology.
> `case-studies/` holds the evidence for each pattern we have accepted.

## Why this exists

The system will keep inventing new detection rules, exceptions, and workflows
indefinitely. If every mutation has to be justified _at proposal time_ by the
agent, two failure modes emerge:

1. Agents rationalize from a single alert and over-fit.
2. Human reviewers cannot tell whether a recommendation reflects a trend or a
   one-off.

Pattern discovery closes both gaps: every mutation that is more than a
tactical tweak (i.e. anything that touches a canonical artifact, proposes a new
detection rule family, or redesigns an existing one) must cite a **pattern
case study** or mark itself explicitly as a hypothesis-on-probation.

## The evidence pyramid

A pattern is only "discovered" when evidence stacks up across at least three
of the following four tiers.

| Tier | Source | Signal |
|------|--------|--------|
| 1. Observed behavior | `.alerts-security.alerts-*`, raw endpoint logs | Raw activity the system saw |
| 2. System outcome | `.soc-outcomes`, `.soc-triage-results` | What triage / signal-quality concluded |
| 3. Mutation history | `.soc-evolution-log`, `.soc-artifact-registry` | What the system has already tried and whether it held |
| 4. Negative evidence | Rejected recommendations (`.soc-recommendations` with `status: rejected`), regression dataset negatives | What humans explicitly said was NOT a pattern |

Two tiers of corroboration are suggestive. Three tiers mean there is a
pattern. Four tiers with negative evidence absent is the strongest signal — a
thing is happening AND we have never told the system "don't call this a
pattern."

## The four methods

### 1. Temporal clustering

**Question:** Do these events cluster in time on the same host, user, or
entity group?

**Data:** `.alerts-security.alerts-*`, `.soc-outcomes`.

**Technique:** ES|QL aggregation on `host.name`/`user.name` + time window,
then look at co-occurrence within 5m / 15m / 1h buckets. Use the built-in
`platform.core.execute_esql` tool.

**Accept if:** co-occurrence is >3x the baseline for that entity pair.

### 2. Structural similarity

**Question:** Do these alerts share a structural shape (same command-line
template, same parent process, same file-path pattern, same network 5-tuple)?

**Data:** `.alerts-security.alerts-*`, `.soc-triage-results`.

**Technique:** String-shape mining — canonicalize numeric IDs, paths, and
hostnames, then group-by the canonical form. Use
`platform.core.sml_search` for prebuilt similarity, or hand-rolled ES|QL for
one-off checks.

**Accept if:** ≥3 distinct entities exhibit the canonical form within the
observation window.

### 3. Outcome convergence

**Question:** When triage or signal-quality agents independently process
these alerts, do they arrive at the same disposition / rule_id / exception
pattern?

**Data:** `.soc-triage-results`, `.soc-evolution-log`.

**Technique:** Query recent outcomes for the candidate alerts; check
disposition agreement and exception-entry agreement. Useful because it
surfaces implicit patterns — the agents already "know" something that has not
been codified into a rule.

**Accept if:** disposition agreement ≥90% across ≥5 samples.

### 4. Counter-evidence check

**Question:** Have humans rejected similar recommendations before?

**Data:** `.soc-recommendations` where `status: rejected` AND
`rejection_reason` non-empty; `.soc-regression-dataset` negative entries.

**Technique:** Semantic match of the candidate pattern description against
past rejection reasons. Use `platform.core.search` with a bool query over
`rejection_reason` text.

**Hold if:** a semantically overlapping rejection exists within the last
30 days. The pattern needs new evidence that addresses the rejection reason
explicitly; otherwise do not re-propose.

## Pattern case study — what to write

Every accepted pattern lives in `docs/case-studies/<YYYYMMDD>-<slug>.md`. The
template below is the canonical shape. Fields marked **required** must be
present; the applier workflow refuses to cite a case study that is missing
them.

```markdown
---
id: <stable kebab-case id, e.g. lateral-wmi-via-trusted-parent>
date_observed: <YYYY-MM-DD>
date_accepted: <YYYY-MM-DD>
status: active | retired | disputed
owner: <agent id or human handle>
linked_recommendations:
  - rec_id_1
  - rec_id_2
linked_rules:
  - rule_id_1
linked_exceptions:
  - exception_id_1
mitre:
  - tactic: TAxxxx
    technique: Txxxx
---

# <Pattern title in plain English>

## Pattern statement (required)

One paragraph, max 5 sentences. Describe the pattern as if explaining it to
a new analyst. Include WHO (entity type), WHAT (activity), WHERE (data
source/index), WHEN (time window), WHY it matters. No jargon without a
definition.

## Evidence (required)

### Tier 1 — Observed behavior

- ES|QL or KQL queries that return the raw events. Include the window used
  and the count returned.
- Sample of 3–5 raw events (redacted where necessary).

### Tier 2 — System outcome

- Links to `.soc-outcomes` / `.soc-triage-results` doc ids.
- Triage disposition distribution and confidence distribution.

### Tier 3 — Mutation history

- Links to `.soc-evolution-log` entries that touched related rules.
- If the pattern triggered a rule redesign, record the before/after query.

### Tier 4 — Negative evidence check

- List of rejected recommendations searched against. If any matched, write
  the rejection reason and how this case study addresses it.

## Impact (required)

- What changed after the pattern was accepted? (rule created? exception
  added? threshold tweaked?)
- Measured effect: FP rate delta, alert volume delta, MTTD delta.

## Hypothesis-on-probation? (required)

- `true` if accepted on only 2 tiers of evidence.
- If `true`, define the automatic retirement rule — e.g. "retire if no new
  corroborating Tier-3 evidence in 14 days."

## Retirement criteria (required)

- Conditions under which this pattern is no longer considered active. At
  minimum: "no new corroborating evidence in N days" AND "if linked rules
  are disabled or deprecated."

## References

- Linked docs, tickets, conversations, prior case studies.
```

## Process

1. **Candidate selection.** An agent (usually `soc-signal-quality-agent` or
   `soc_deteng-agent`) emits a structured recommendation with
   `pattern_hypothesis: true` and a reference to a candidate pattern.
2. **Evidence gathering.** A workflow (or the reviewer) runs the four
   methods above against the candidate.
3. **Case study draft.** A case study is written using the template. Draft
   is committed to `docs/case-studies/` with `status: active` if four tiers
   pass, or `status: probation` if only three pass.
4. **Registration.** The case study id is written into the recommendation's
   `cites_pattern` field so the applier workflow can verify the citation.
5. **Retirement.** A scheduled workflow checks each `status: active` or
   `probation` case study against its retirement criteria monthly; those
   that fail are marked `retired` (not deleted — we keep the history).

## Anti-patterns (don't do these)

- **Single-alert patterns.** One alert is never a pattern — it is noise.
- **Un-cited redesigns.** A rule redesign that does not cite a case study
  is just a vibe change; the applier workflow rejects it.
- **Circular evidence.** Citing the rule whose existence you are justifying
  as evidence that the pattern is real. Always reach back to the tier-1
  observed behavior.
- **Skipping negative evidence.** If you can't find rejection history for
  the pattern, say so explicitly in the case study (Tier 4 section) — don't
  omit it.
- **Case studies without retirement criteria.** Patterns decay. A case
  study without a retirement condition becomes perpetual dogma.

## Glossary

- **Canonical artifact** — installed by `setup.sh`, never auto-mutated.
- **ARGUS-owned artifact** — created by ARGUS, safe to auto-mutate under
  governance rails.
- **Pattern hypothesis** — a candidate pattern with 2 tiers of evidence;
  must graduate to a case study before it can drive a canonical change.
- **Negative evidence** — explicit human rejection of a similar pattern.
- **Retirement criteria** — the rule under which a case study becomes
  `status: retired`.

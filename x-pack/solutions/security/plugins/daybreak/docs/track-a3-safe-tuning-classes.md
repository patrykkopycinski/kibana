# Track A3 — Safe-tuning class matrix (draft)

**Status:** draft for MVP evidence pack / Black Hat internal review  
**Profile:** `false-positive-reduction` (`capability-evaluation-profiles.md` § FPR)  
**Decision date:** 2026-07-13 (unratified)

## Purpose

Classify post-gate outcomes by what may run **supervised auto** vs **proposal-only**.
The noisy-endpoint-rules reference workflow is the **auto exemplar**; isolate and
forensic paths stay proposal-only for the MVP slice.

## Class matrix

| Scenario / action class | Post-gate autonomy | Exemplar | Notes |
| --- | --- | --- | --- |
| Benign scanner FP dismiss | **Supervised auto** (exception create) | `docs/reference-workflows/disable-noisy-endpoint-rules-from-esql.yaml` → `create_endpoint_exception` after human dismiss | Bounded endpoint exception; idempotent `get_exception` guard |
| Expected administrator FP dismiss | **Supervised auto** (same band) | Noisy-rules workflow | Same exception band; reviewer confirms privilege context |
| FP tag on dismiss/tune | **Supervised auto** (metadata only) | `response_action_worker.yaml` → `tag_fp_on_dismiss` / `tag_fp_on_tune` | Non-destructive; runs after gate for `dismissed` / `modified` |
| Isolate host | **Proposal-only** | `response_action_worker.yaml` → `act_on_approve` | Endpoint containment; always approval-gated |
| Forensic collection | **Proposal-only** | `forensic_worker.yaml` (spike) | Host-wide collection; no auto path in MVP |
| Risky broad exception | **Proposal-only** | Golden row `risky-broad-exception` | High FN risk; never auto |
| Tuning hides suspicious | **Proposal-only** | Golden row `tuning-hides-suspicious` | Dangerous FN case |
| Insufficient data | **Escalate only** | Golden row `insufficient-data` | No tuning proposal until evidence gathered |
| Malformed/missing data | **Fail closed** | Worker validation guards | Degraded/failed; no proposal |

## Worker config implication

```yaml
# spike default until ratification
safeTuningClasses: []          # profile field — empty in MVP pack
supervisedAutoExemplar: noisy-endpoint-rules-from-esql
proposalOnlyActions: [isolate, forensic]
```

## Evidence pack hook

- **L3/L4:** demonstrate dismiss → FP tag worker on a golden FP row (`alert-qualys-scan-app01`).
- **A3 auto band:** cite noisy-rules reference copy + exception idempotency guard; do **not**
  claim isolate/forensic auto until #17944 ratifies action bands.

## Related

- `docs/reference-workflows/README.md` — upstream mapping
- `project-daybreak/.../capability-evaluation-profiles.md` — canonical profile

# Watch Floor contract ratification (spike)

**Status:** POC draft — ratification pending [security-team#17942](https://github.com/elastic/security-team/issues/17942)  
**Spike schema version:** `0.1.0-spike` (`SPIKE_PROPOSAL_SCHEMA_VERSION`)  
**Ratification gate:** `pending-security-team-17942` (`RATIFICATION_STATUS`)

## Purpose

The Daybreak spike plugin stores full `ProposalProperties` documents in
`.kibana-daybreak-proposals`. The Common Worker Layer (CWL) collaboration
contract defines a thinner `ProposalStub` for cross-team Watch/Worker
integration. This note summarizes how the spike maps to the stub and what
remains open before GA.

## Spike Proposal vs CWL ProposalStub

| Spike (`ProposalProperties`) | CWL (`ProposalStub`) | Notes |
| --- | --- | --- |
| `id` | `id` | Direct |
| `title` | `title` | Direct |
| `sourceWatch` | `sourceWatchId` | Optional on spike; empty string when absent |
| `sourceWorkerId` | `sourceWorkerId` | Added on spike for CWL alignment |
| `severity` | `severity` | Direct |
| `confidence` | `confidence` | Direct |
| `status` | `status` | Direct |
| `recommendation` | `summary` | Actionable text only |
| `approvalRequirement` | `approvalRequired` | `manual` → `true`, `automatic` → `false` |

### Spike fields not mapped (await #17942 / run-record contract)

- `capability`, `evidenceRefs`, `expectedImpact`, `riskCaveats`
- `decisionHistory`, `decision`, `approvals`, `owner`, `createdAt`, `hypothesis`

Mapping implementation: `server/common/contracts/watch_floor_contract.ts`
(`mapProposalToCwlStub`).

## Autonomy taxonomy (unreconciled)

Three parallel taxonomies exist across docs:

| Source | Levels |
| --- | --- |
| Throughline UI | 1–5: Suggest only · Reads auto · Drafts auto · Acts · gated · Acts · trusted |
| Spike `WatchAutonomyTier` | `auto-run` · `proposed-diff` · `approval-required` |
| Operating model | 0–5: Off · Observe · Propose · Prepare · Execute low-risk · Execute consequential |

POC mapping lives in `server/common/contracts/autonomy_mapping.ts`. Do not
treat as GA naming until Watch-team reconciliation.

## Evidence kinds (spike)

The spike indexes evidence in `.kibana-daybreak-evidence` with kinds used by
the alert-analysis worker and offline eval gate:

| Kind | Role |
| --- | --- |
| Alert signal summary | Input to Reason phase |
| Stance signals | Weighted for/against triage |
| Golden dataset row | Offline L4 eval ground truth |
| Eval report (`schemaVersion` 2) | Gate output with `provenance` block |

Worker evaluation records (`WorkerEvaluationRecord`) link golden examples to
per-run scores and model provenance for L4 round-trip tests.

## Eval report provenance (schema v2)

`DaybreakEvalReport` bumped to `EVAL_REPORT_SCHEMA_VERSION = 2` with a
`provenance` field (`modelId`, `connectorId`, `inputTokens`, `outputTokens`,
`latencyMs`, `costBasis`). Offline gate runs default to
`OFFLINE_GATE_DEFAULT_PROVENANCE` (`offline-deterministic-gate`, `self-hosted`).

## References

- CWL contract: project-daybreak `docs/working-groups/common-worker-layer/artifacts/watch-worker-contract.ts`
- Interface mapping: project-daybreak `docs/working-groups/common-worker-layer/artifacts/watch-interface-mapping.md`
- Operating model: project-daybreak `docs/daybreak-operating-model.md`
- Proposal schema issue: [elastic/security-team#17942](https://github.com/elastic/security-team/issues/17942)

# Spike-canonical schemas (Daybreak)

**Ownership:** `spike-canonical` — the spike defines working contracts; cross-team
alignment (#17942) can adopt or diff against these exports later.

**Module:** `server/common/schemas/`

## Versions

| Entity | Version constant | Value |
| --- | --- | --- |
| Proposal | `DAYBREAK_PROPOSAL_SCHEMA_VERSION` | `1.0.0-spike` |
| Evidence | `DAYBREAK_EVIDENCE_SCHEMA_VERSION` | `1.0.0-spike` |
| WorkerRef | `DAYBREAK_WORKER_REF_SCHEMA_VERSION` | `1.0.0-spike` |

## ProposalProperties (canonical)

Stored in `.kibana-daybreak-proposals`. Key fields:

- `schemaVersion` — bumped on breaking changes
- `sourceWatch` / `sourceWorkerId` — Watch + Worker attribution
- `capability`, `severity`, `confidence`, `status`, `recommendation`
- `evidenceRefs`, `hypothesis`, `approvalRequirement`, `decisionHistory`

**Builders:** `buildProposalFromWorkerRun()` maps Enrich + Reason output → proposal.

**CWL export:** `mapProposalToCwlStub()` in `watch_floor_contract.ts`.

## EvidencePackage (canonical)

Richer than the ES index document. Built from `EnrichedAlertSchema` via
`buildEvidencePackageFromEnrichedAlert()`, flattened with `toEvidenceProperties()`.

## WorkerRef

`ALERT_ANALYSIS_WORKER_REF` — default worker for the 5-phase alert-analysis workflow.

## Attack Discovery adapter

`mapAttackDiscoveryToProposal()` — Gap #12 AD → Proposal bridge (spike-owned input shape).

## Alignment strategy

When #17942 ratifies a shared schema:

1. Diff `server/common/schemas/` against the ratified contract
2. Bump `schemaVersion` and add migration notes
3. Update `mapProposalToCwlStub` field mapping if stub shape changes

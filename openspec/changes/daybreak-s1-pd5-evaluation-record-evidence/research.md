---
change_id: fpr-l4-evaluation-record-promotion-evidence
status: draft
created_at: 2026-07-12
treadmill_artifact_version: 1
research_topic: FPR L4 evaluation record storage and scoring in daybreak worker spike
feature_id: f943d973-90ab-4834-8e7f-d7fed23afe31
feature_slug: daybreak-s1-alert-analysis-worker-spike
---

# Research: PD-5 False Positive Reduction L4 Evaluation Record and Promotion Evidence

## Research Question
What existing Daybreak worker, Proposal/Evidence client, `@kbn/evals` storage, and PD-3 fixture code can be reused in place to implement the L4 Evaluation Record and deterministic scorer without adding a new package, plugin, index, service, or store?

## Summary
This research brief was opened against the prior proposal and shape notes, but the repository exploration pass could not be completed in this turn because file/grep/read tools were not available to the assistant. The only verifiable anchor is the proposal frontmatter itself. All architectural claims about the Daybreak plugin, `@kbn/evals` result metadata, PD-3 fixtures, and the canonical schema sketch remain as Open Questions to be grounded by a follow-up wave with repo access. See research.md §Code References for the single verified anchor and §Open Questions for the full list of evidence still required.

## Detailed Findings

### 1. Proposal scope and change identity are fixed
The prior proposal defines the same `change_id` used here and restates the PD-1 through PD-4 completion context, the canonical documentation paths, and the constraint that no new package/plugin/index/service/store be introduced.

## Code References
- `proposal.md:2` — `change_id: fpr-l4-evaluation-record-promotion-evidence` slug that this research brief mirrors.

## Open Questions
- Where does the Daybreak worker live in the Kibana worktree (exact plugin/package path and feature-flag location) so PD-2 modules can be extended in place? (FR-1, FR-2, NFR-2, PD-2)
- Where are the existing Proposal and Evidence runtime types/serializers located, and what fields do they already expose for run/proposal/evidence identity? (FR-7, PD-2)
- What is the exact file path and TypeScript shape of the existing `@kbn/evals` dataset/experiment result metadata API that should carry the `WorkerEvaluationRecord`? (FR-8, FR-9, PD-3)
- Does the canonical schema sketch in `docs/working-groups/evaluation-trust/artifacts/` already define a `WorkerEvaluationRecord` shape, and if so which file and line range? (operator description, What Changes)
- Where are the PD-3 `fpr-golden-*` fixtures stored, and what is their current schema so the `fpr-golden-v0` manifest can reuse one canonical seed definition? (FR-10, PD-3, PD-5)
- Which existing PD-3 eval suite files should be extended for the offline dataset gate versus the live UI-journey gate? (FR-8, FR-9, PD-3)
- What is the current experimentalFeatures flag name and default for the Daybreak worker, and where is it declared? (NFR-2, FR-12, PD-2)
- Does `@kbn/evals` already expose a deterministic scorer utility or dimension-weighting helper, or must one be added inside the Daybreak plugin boundary? (FR-10, PD-3)
- Where should the `WorkerEvaluationRecord` runtime type/serializer live relative to existing PD-3 modules without crossing a new package boundary? (proposal Open Questions)
- What is the exact field list for run/proposal/evidence/dataset/profile/version identity used to guarantee exactly one record per whole-worker run? (proposal Open Questions, FR-10)
- Is there an existing `.evaluation-*` API extension point that can carry the required metadata, or does the kill/pivot path (tested serializer/contract seam + blocked integration test) apply? (operator description, proposal Open Questions)

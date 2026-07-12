/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalProperties } from "../../client/proposals/types";

/**
 * Spike-local schema version for Proposal → CWL stub mapping. Bumped when the
 * Daybreak Proposal shape or the CWL {@link ProposalStub} contract changes.
 */
export { DAYBREAK_PROPOSAL_SCHEMA_VERSION as SPIKE_PROPOSAL_SCHEMA_VERSION, SCHEMA_OWNERSHIP } from "../schemas/versions";

/**
 * Spike-canonical proposal schema. Export CWL stubs for cross-team alignment (#17942) when ready.
 */
export const RATIFICATION_STATUS = "spike-canonical";

/**
 * CWL ProposalStub — inlined from project-daybreak
 * `docs/working-groups/common-worker-layer/artifacts/watch-worker-contract.ts`.
 * Not imported from project-daybreak to keep the Kibana plugin self-contained.
 */
export interface ProposalStub {
  id: string;
  title: string;
  sourceWatchId: string;
  sourceWorkerId: string;
  severity?: string;
  confidence?: number;
  status: string;
  summary?: string;
  approvalRequired: boolean;
}

/**
 * Map a Daybreak {@link ProposalProperties} document to the CWL {@link ProposalStub}
 * collaboration shape (POC draft — ratification pending #17942).
 *
 * Field mapping (spike → CWL stub):
 * - `id` → `id`
 * - `title` → `title`
 * - `sourceWatch` → `sourceWatchId` (Watch policy envelope id)
 * - `sourceWorkerId` → `sourceWorkerId` (WorkerRef that emitted the proposal)
 * - `severity` → `severity` (stringified for stub compatibility)
 * - `confidence` → `confidence`
 * - `status` → `status`
 * - `recommendation` → `summary` (actionable text; hypothesis not mapped yet)
 * - `approvalRequirement` → `approvalRequired` (`manual` → true, `automatic` → false)
 *
 * Intentionally unmapped spike fields (await #17942 / run-record contract):
 * `capability`, `evidenceRefs`, `expectedImpact`, `riskCaveats`, `decisionHistory`,
 * `decision`, `owner`, `createdAt`, `hypothesis`, `approvals`.
 */
export const mapProposalToCwlStub = (proposal: ProposalProperties): ProposalStub => ({
  id: proposal.id,
  title: proposal.title,
  // sourceWatch is optional on spike proposals; CWL stub requires a watch id.
  sourceWatchId: proposal.sourceWatch ?? "",
  // Aligns with CWL WorkerRef.id — empty string when worker attribution is unknown.
  sourceWorkerId: proposal.sourceWorkerId ?? "",
  severity: proposal.severity,
  confidence: proposal.confidence,
  status: proposal.status,
  // recommendation carries the actionable summary the stub expects.
  summary: proposal.recommendation,
  approvalRequired: proposal.approvalRequirement !== "automatic",
});

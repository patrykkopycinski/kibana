/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalProperties, ProposalStatus } from "../../client/proposals/types";
import { DAYBREAK_PROPOSAL_SCHEMA_VERSION } from "./versions";

/**
 * Minimal Attack Discovery alert shape the spike adapter accepts.
 * Real AD payloads vary; this covers the fields we need for Proposal emission.
 */
export interface AttackDiscoveryAlertSummary {
  id: string;
  title: string;
  description?: string;
  severity?: "low" | "medium" | "high" | "critical";
  confidence?: number;
  /** MITRE tactics / techniques surfaced by AD. */
  tactics?: string[];
  /** Related alert or entity ids AD correlated. */
  relatedAlertIds?: string[];
  /** AD-assigned triage hint when present. */
  triageStatus?: "open" | "acknowledged" | "closed";
  /** Explicit monitor-only / no-op flag for low-value findings. */
  monitorOnly?: boolean;
  /** Id of a previous AD finding this one duplicates. */
  duplicateOf?: string;
  /** Set when the finding lacks supporting evidence. */
  missingEvidence?: boolean;
  /** Sources of contradictory evidence that undermine the finding. */
  contradicts?: string[];
}

const normalizeSeverity = (
  value: string | undefined,
): ProposalProperties["severity"] => {
  if (value === "low" || value === "medium" || value === "high" || value === "critical") {
    return value;
  }
  return "medium";
};

const adTriageToProposalStatus = (
  triageStatus: AttackDiscoveryAlertSummary["triageStatus"],
): ProposalStatus => {
  if (triageStatus === "closed") return "dismissed";
  if (triageStatus === "acknowledged") return "approved";
  return "new";
};

/**
 * Derive proposal status from the AD scenario flags in addition to triageStatus.
 * - monitor-only / duplicate → dismissed (no-op)
 * - missing evidence / contradictory evidence → needs-evidence
 * - otherwise fall back to triageStatus mapping
 */
const adStatusFromScenario = (ad: AttackDiscoveryAlertSummary): ProposalStatus => {
  if (ad.monitorOnly || ad.duplicateOf) {
    return "dismissed";
  }
  if (ad.missingEvidence || (ad.contradicts && ad.contradicts.length > 0)) {
    return "needs-evidence";
  }
  return adTriageToProposalStatus(ad.triageStatus);
};

export interface MapAttackDiscoveryParams {
  proposalId: string;
  ad: AttackDiscoveryAlertSummary;
  sourceWatchId?: string;
  sourceWorkerId?: string;
  capability?: string;
  space?: string;
  now?: Date;
}

/**
 * Map an Attack Discovery alert summary into a Daybreak {@link ProposalProperties}.
 * Gap #12 — AD output integration (spike-canonical adapter).
 */
export const mapAttackDiscoveryToProposal = (
  params: MapAttackDiscoveryParams,
): ProposalProperties => {
  const {
    proposalId,
    ad,
    sourceWatchId = "attack-discovery-watch",
    sourceWorkerId = "attack-discovery-adapter",
    capability = "attack-discovery",
    space,
    now = new Date(),
  } = params;

  const severity = normalizeSeverity(ad.severity);
  const confidence = ad.confidence ?? 0.7;
  const status = adStatusFromScenario(ad);

  const recommendationParts: string[] = [];
  if (ad.monitorOnly) {
    recommendationParts.push("Monitor only");
  } else if (ad.duplicateOf) {
    recommendationParts.push(`Duplicate of ${ad.duplicateOf}`);
  } else if (ad.missingEvidence) {
    recommendationParts.push("Missing evidence");
  } else if (ad.contradicts && ad.contradicts.length > 0) {
    recommendationParts.push(`Contradicted by ${ad.contradicts.join(", ")}`);
  } else {
    recommendationParts.push("Review Attack Discovery finding");
  }
  recommendationParts.push(ad.description ?? `correlate related alerts for ${ad.id}.`);
  const recommendation = recommendationParts.join(" — ");

  return {
    id: proposalId,
    schemaVersion: DAYBREAK_PROPOSAL_SCHEMA_VERSION,
    title: ad.title,
    sourceWatch: sourceWatchId,
    sourceWorkerId,
    capability,
    severity,
    confidence,
    status,
    recommendation,
    evidenceRefs: ad.relatedAlertIds ?? [],
    hypothesis: ad.description,
    expectedImpact: ad.tactics?.length
      ? `Tactics: ${ad.tactics.join(", ")}`
      : undefined,
    approvalRequirement: "manual",
    requiredApproverCount: 1,
    approvals: [],
    decisionHistory: [],
    createdAt: now.toISOString(),
    space,
  };
};

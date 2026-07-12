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
  const status = adTriageToProposalStatus(ad.triageStatus);

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
    recommendation:
      ad.description ??
      `Review Attack Discovery finding ${ad.id} and correlate related alerts.`,
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

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalProperties, ProposalStatus } from "../../client/proposals/types";
import type { EnrichedAlertSchema } from "../../workflow/enrich_alert_schema";
import type { ReasonStructuredOutput } from "../../workflow/output_validation_guard";
import { deriveInitialStatus } from "../../workflow/enrich_alert_schema";
import {
  DAYBREAK_PROPOSAL_SCHEMA_VERSION,
  DEFAULT_ALERT_ANALYSIS_WORKER_ID,
} from "./versions";

const VERDICT_TO_TITLE_PREFIX: Record<string, string> = {
  true_positive: "Investigate",
  false_positive: "Tune",
  benign_true_positive: "Document",
  needs_evidence: "Gather evidence for",
};

/** Map Reason-phase verdict to initial proposal status. */
export const verdictToProposalStatus = (
  verdict: string,
  enriched: EnrichedAlertSchema,
): ProposalStatus => {
  if (verdict === "needs_evidence" || enriched.stanceSignals.length === 0) {
    return "needs-evidence";
  }
  return deriveInitialStatus(enriched);
};

/** Build a human-readable proposal title from verdict + rule name. */
export const buildProposalTitle = (verdict: string, ruleName: string): string => {
  const prefix = VERDICT_TO_TITLE_PREFIX[verdict] ?? "Review";
  return `${prefix}: ${ruleName}`;
};

/** Map verdict to actionable recommendation text. */
export const buildRecommendationFromReason = (
  reason: ReasonStructuredOutput,
  enriched: EnrichedAlertSchema,
): string => {
  const host = enriched.hostSummary ? ` on ${enriched.hostSummary}` : "";
  return `${reason.rationale} (verdict=${reason.verdict}, host${host})`;
};

export interface BuildProposalFromWorkerRunParams {
  id: string;
  enriched: EnrichedAlertSchema;
  reason: ReasonStructuredOutput;
  sourceWatchId?: string;
  sourceWorkerId?: string;
  capability?: string;
  approvalRequirement?: ProposalProperties["approvalRequirement"];
  evidenceRefs?: string[];
  space?: string;
  now?: Date;
}

/**
 * Build a full {@link ProposalProperties} from Enrich + Reason worker output.
 * This is the spike-canonical Act-phase emission shape.
 */
export const buildProposalFromWorkerRun = (
  params: BuildProposalFromWorkerRunParams,
): ProposalProperties => {
  const {
    id,
    enriched,
    reason,
    sourceWatchId,
    sourceWorkerId = DEFAULT_ALERT_ANALYSIS_WORKER_ID,
    capability = "alert-analysis",
    approvalRequirement = "manual",
    evidenceRefs = [],
    space,
    now = new Date(),
  } = params;

  const status = verdictToProposalStatus(reason.verdict, enriched);

  return {
    id,
    schemaVersion: DAYBREAK_PROPOSAL_SCHEMA_VERSION,
    title: buildProposalTitle(reason.verdict, enriched.ruleName),
    sourceWatch: sourceWatchId,
    sourceWorkerId,
    capability,
    severity: enriched.severity,
    confidence: reason.confidence,
    status,
    recommendation: buildRecommendationFromReason(reason, enriched),
    evidenceRefs,
    hypothesis: `Alert ${enriched.alertId} triaged as ${reason.verdict}`,
    approvalRequirement,
    requiredApproverCount: approvalRequirement === "automatic" ? 0 : 1,
    approvals: [],
    decisionHistory: [],
    createdAt: now.toISOString(),
    space,
  };
};

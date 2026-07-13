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

/** Map Reason-phase verdict to initial proposal status.
 *
 * Aligned with the golden dataset (server/evals/golden_dataset.ts):
 * - true_positive at high/critical severity → escalated
 * - true_positive at low/medium severity → new
 * - false_positive / benign_true_positive → dismissed
 * - needs_evidence / empty stance → needs-evidence
 */
export const verdictToProposalStatus = (
  verdict: string,
  enriched: EnrichedAlertSchema,
): ProposalStatus => {
  if (verdict === "needs_evidence" || enriched.stanceSignals.length === 0) {
    return "needs-evidence";
  }
  if (verdict === "true_positive") {
    return enriched.severity === "high" || enriched.severity === "critical" ? "escalated" : "new";
  }
  if (verdict === "false_positive" || verdict === "benign_true_positive") {
    return "dismissed";
  }
  return deriveInitialStatus(enriched);
};

/** Build a proposal title aligned with the golden dataset shape. */
export const buildProposalTitle = (ruleName: string, alertId: string): string =>
  `${ruleName} on ${alertId}`;

/** Map verdict to actionable recommendation text aligned with the golden dataset shape.
 *
 * Golden dataset format:
 * - true_positive → "Escalate — {summary}"
 * - false_positive / benign_true_positive → "Dismiss — {summary}"
 * - needs_evidence → "Gather additional evidence — {summary}"
 */
export const buildRecommendationFromReason = (
  reason: ReasonStructuredOutput,
  enriched: EnrichedAlertSchema,
): string => {
  const summary = enriched.summary;
  if (reason.verdict === 'needs_evidence') {
    return `Gather additional evidence — ${summary}`;
  }
  if (reason.verdict === 'false_positive' || reason.verdict === 'benign_true_positive') {
    return `Dismiss — ${summary}`;
  }
  return `Escalate — ${summary}`;
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
    title: buildProposalTitle(enriched.ruleName, enriched.alertId),
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

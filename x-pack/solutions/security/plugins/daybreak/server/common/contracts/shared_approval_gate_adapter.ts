/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalProperties, ProposalStatus } from "../../client/proposals/types";
import {
  evaluateReadinessGate,
  requireReadinessGate,
  ReadinessGateError,
  type MissingRequirement,
} from "../../client/proposals/gate";

/**
 * Platform Shared Approval Gate seam (security-team#17944).
 * Spike delegates to the readiness gate until Workflows HITL is wired.
 */
export type SharedApprovalGatePhase = "readiness" | "human-approval" | "platform-hitl";

export interface SharedApprovalGateDecision {
  proposalId: string;
  allowed: boolean;
  phase: SharedApprovalGatePhase;
  missingRequirements?: MissingRequirement[];
  /** Populated when platform Workflows gate assumes ownership (#17944). */
  platformGateId?: string;
  /** True while spike gate is the active implementation. */
  spikeFallback: boolean;
}

export const SHARED_APPROVAL_GATE_PLATFORM_ISSUE = "security-team#17944";

/**
 * Evaluate the shared approval gate for a proposal status transition.
 * Gap #7 — spike adapter closed; platform HITL replaces `spikeFallback` when #17944 lands.
 */
export const evaluateSharedApprovalGate = (
  proposal: ProposalProperties,
  targetStatus?: ProposalStatus
): SharedApprovalGateDecision => {
  const readiness = evaluateReadinessGate(proposal, targetStatus);

  if (!readiness.approved) {
    return {
      proposalId: proposal.id,
      allowed: false,
      phase: "readiness",
      missingRequirements: readiness.failure.missingRequirements,
      spikeFallback: true,
    };
  }

  if (targetStatus === "approved") {
    const approverCount = proposal.approvals?.length ?? 0;
    const required = proposal.requiredApproverCount ?? 1;
    if (approverCount < required) {
      return {
        proposalId: proposal.id,
        allowed: false,
        phase: "human-approval",
        missingRequirements: ["approver-count"],
        spikeFallback: true,
      };
    }
  }

  return {
    proposalId: proposal.id,
    allowed: true,
    phase: "platform-hitl",
    spikeFallback: true,
  };
};

/** Throws {@link ReadinessGateError} — same contract as {@link requireReadinessGate}. */
export const requireSharedApprovalGate = (
  proposal: ProposalProperties,
  targetStatus?: ProposalStatus
): void => {
  const decision = evaluateSharedApprovalGate(proposal, targetStatus);
  if (!decision.allowed) {
    requireReadinessGate(proposal, targetStatus);
  }
};

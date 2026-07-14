/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalProperties } from "../../client/proposals/types";
import {
  evaluateSharedApprovalGate,
  requireSharedApprovalGate,
  SHARED_APPROVAL_GATE_PLATFORM_ISSUE,
} from "./shared_approval_gate_adapter";
import { ReadinessGateError } from "../../client/proposals/gate";

const baseProposal: ProposalProperties = {
  id: "proposal-gate-1",
  title: "Tune rule",
  capability: "alert-analysis",
  severity: "high",
  confidence: 0.8,
  status: "new",
  recommendation: "Add exception",
  evidenceRefs: ["evidence-1"],
  requiredApproverCount: 1,
  approvals: [],
  decisionHistory: [],
  approvalRequirement: "manual",
  createdAt: "2026-07-13T12:00:00.000Z",
};

describe("shared_approval_gate_adapter (Gap #7)", () => {
  it("documents the platform integration issue", () => {
    expect(SHARED_APPROVAL_GATE_PLATFORM_ISSUE).toBe("security-team#17944");
  });

  it("blocks approved transition when evidence is missing", () => {
    const decision = evaluateSharedApprovalGate(
      { ...baseProposal, evidenceRefs: [] },
      "approved"
    );
    expect(decision.allowed).toBe(false);
    expect(decision.phase).toBe("readiness");
    expect(decision.missingRequirements).toContain("evidence");
    expect(decision.spikeFallback).toBe(true);
  });

  it("allows non-approved transitions without readiness checks", () => {
    const decision = evaluateSharedApprovalGate(baseProposal, "dismissed");
    expect(decision.allowed).toBe(true);
  });

  it("requireSharedApprovalGate throws ReadinessGateError on failure", () => {
    expect(() =>
      requireSharedApprovalGate({ ...baseProposal, evidenceRefs: [] }, "approved")
    ).toThrow(ReadinessGateError);
  });
});

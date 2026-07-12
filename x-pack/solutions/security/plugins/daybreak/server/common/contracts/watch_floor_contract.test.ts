/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalProperties } from "../../client/proposals/types";
import {
  RATIFICATION_STATUS,
  SPIKE_PROPOSAL_SCHEMA_VERSION,
  mapProposalToCwlStub,
} from "./watch_floor_contract";

describe("watch_floor_contract", () => {
  const baseProposal: ProposalProperties = {
    id: "proposal-1",
    title: "Tune noisy VPN rule",
    sourceWatch: "watch-floor-1",
    sourceWorkerId: "worker-alert-analysis",
    capability: "alert-analysis",
    severity: "high",
    confidence: 0.82,
    status: "new",
    recommendation: "Add host.name exception for approved VPN scanners.",
    evidenceRefs: ["evidence-1"],
    requiredApproverCount: 1,
    approvals: [],
    decisionHistory: [],
    approvalRequirement: "manual",
    createdAt: "2026-07-12T12:00:00.000Z",
  };

  it("exports spike schema version and ratification status", () => {
    expect(SPIKE_PROPOSAL_SCHEMA_VERSION).toBe("1.0.0-spike");
    expect(RATIFICATION_STATUS).toBe("spike-canonical");
  });

  it("maps ProposalProperties to CWL ProposalStub", () => {
    const stub = mapProposalToCwlStub(baseProposal);

    expect(stub).toEqual({
      id: "proposal-1",
      title: "Tune noisy VPN rule",
      sourceWatchId: "watch-floor-1",
      sourceWorkerId: "worker-alert-analysis",
      severity: "high",
      confidence: 0.82,
      status: "new",
      summary: "Add host.name exception for approved VPN scanners.",
      approvalRequired: true,
    });
  });

  it("defaults missing watch/worker ids to empty strings", () => {
    const { sourceWatch: _sw, sourceWorkerId: _swid, ...rest } = baseProposal;
    const stub = mapProposalToCwlStub(rest);

    expect(stub.sourceWatchId).toBe("");
    expect(stub.sourceWorkerId).toBe("");
  });

  it("maps automatic approval requirement to approvalRequired=false", () => {
    const stub = mapProposalToCwlStub({
      ...baseProposal,
      approvalRequirement: "automatic",
    });

    expect(stub.approvalRequired).toBe(false);
  });
});

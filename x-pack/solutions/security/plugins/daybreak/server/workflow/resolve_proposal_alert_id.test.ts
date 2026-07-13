/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { resolveProposalAlertId } from "./resolve_proposal_alert_id";
import type { ProposalProperties } from "../client/proposals/types";

const base: ProposalProperties = {
  id: "demo-proposal-1",
  title: "Scanner activity on alert-qualys-scan-app01",
  capability: "alert-analysis",
  severity: "high",
  confidence: 0.9,
  status: "dismissed",
  hypothesis: "Alert alert-qualys-scan-app01 triaged as false_positive",
  evidenceRefs: [],
  requiredApproverCount: 1,
  approvals: [],
  decisionHistory: [],
  createdAt: new Date().toISOString(),
};

describe("resolveProposalAlertId", () => {
  it("uses proposal id when it is an alert id", () => {
    expect(resolveProposalAlertId({ ...base, id: "alert-qualys-scan-app01" })).toBe(
      "alert-qualys-scan-app01"
    );
  });

  it("parses alert id from hypothesis", () => {
    expect(resolveProposalAlertId(base)).toBe("alert-qualys-scan-app01");
  });

  it("parses alert id from title suffix", () => {
    expect(
      resolveProposalAlertId({
        ...base,
        hypothesis: undefined,
        title: "Benign scanner on alert-qualys-scan-app01",
      })
    ).toBe("alert-qualys-scan-app01");
  });
});

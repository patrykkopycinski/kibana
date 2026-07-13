/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getResponseActionWorkerWorkflow } from "./run_response_action_worker";
import { resolveProposalHostName } from "./resolve_proposal_host";
import type { ProposalProperties } from "../client/proposals/types";

describe("response_action_worker", () => {
  it("parses and validates the workflow YAML", () => {
    const workflow = getResponseActionWorkerWorkflow();
    expect(workflow.name).toBe("Daybreak Proposal Response Action Worker");
    expect(workflow.steps.map((step) => step.name)).toEqual([
      "setup",
      "load",
      "tag_fp_on_dismiss",
      "tag_fp_on_tune",
      "act_on_approve",
      "confirm",
    ]);
  });
});

describe("resolveProposalHostName", () => {
  const baseProposal: ProposalProperties = {
    id: "proposal-1",
    title: "Test",
    capability: "alert-analysis",
    severity: "high",
    confidence: 0.9,
    status: "approved",
    evidenceRefs: ["evidence-1"],
    requiredApproverCount: 1,
    approvals: [],
    decisionHistory: [],
    createdAt: new Date().toISOString(),
  };

  it("prefers an explicit host name", () => {
    expect(
      resolveProposalHostName({
        proposal: baseProposal,
        explicitHostName: "FIN-WS-04",
      })
    ).toBe("FIN-WS-04");
  });

  it("extracts host names from linked investigations", () => {
    expect(
      resolveProposalHostName({
        proposal: baseProposal,
        investigations: [
          {
            id: "investigation-1",
            title: "Investigation",
            summary: "summary",
            sourceProposalId: "proposal-1",
            capability: "alert-analysis",
            status: "open",
            hypotheses: [],
            evidenceRefs: [],
            timeline: [],
            entities: [
              {
                id: "entity-1",
                name: "host-01",
                type: "host",
                relevance: "primary",
              },
            ],
            openQuestions: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })
    ).toBe("host-01");
  });

  it("parses FIN-WS hostnames from recommendations", () => {
    expect(
      resolveProposalHostName({
        proposal: {
          ...baseProposal,
          recommendation: "Isolate FIN-WS-09 before credential reset.",
        },
      })
    ).toBe("FIN-WS-09");
  });

  it("does not treat stopwords after host as hostnames", () => {
    expect(
      resolveProposalHostName({
        proposal: {
          ...baseProposal,
          recommendation: "Isolate the source host and reset compromised credentials.",
        },
      })
    ).toBeUndefined();
  });
});

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DAYBREAK_PROPOSAL_SCHEMA_VERSION,
  SCHEMA_OWNERSHIP,
  ALERT_ANALYSIS_WORKER_REF,
} from "./index";
import { buildEvidencePackageFromEnrichedAlert, toEvidenceProperties } from "./evidence_package";
import { buildProposalFromWorkerRun, verdictToProposalStatus } from "./proposal_builder";
import { mapAttackDiscoveryToProposal } from "./attack_discovery_adapter";
import type { EnrichedAlertSchema } from "../../workflow/enrich_alert_schema";

const enrichedFixture: EnrichedAlertSchema = {
  alertId: "alert-1",
  ruleName: "Suspicious PowerShell",
  ruleDescription: "Detects encoded PowerShell",
  severity: "high",
  signalCount: 3,
  hostSummary: "host-01",
  summary: "Encoded PowerShell on host-01",
  tactics: ["Execution"],
  stanceSignals: [{ stance: "for", note: "Known malicious cmdlet" }],
};

describe("spike-canonical schemas", () => {
  it("exports ownership and default worker ref", () => {
    expect(SCHEMA_OWNERSHIP).toBe("spike-canonical");
    expect(ALERT_ANALYSIS_WORKER_REF.id).toBe("daybreak-alert-analysis-worker");
  });

  it("builds evidence package from enriched alert", () => {
    const pkg = buildEvidencePackageFromEnrichedAlert(enrichedFixture, "ev-1", {
      confidence: 0.9,
    });
    const props = toEvidenceProperties(pkg);

    expect(pkg.schemaVersion).toBeDefined();
    expect(props.id).toBe("ev-1");
    expect(props.kind).toBe("alert");
    expect(props.sourceRef).toBe("alert-1");
    expect(props.stance).toBe("for");
  });

  it("builds proposal from worker run output", () => {
    const proposal = buildProposalFromWorkerRun({
      id: "prop-1",
      enriched: enrichedFixture,
      reason: {
        verdict: "true_positive",
        confidence: 0.88,
        rationale: "Encoded cradle matches threat intel",
      },
      sourceWatchId: "watch-1",
      now: new Date("2026-07-12T12:00:00.000Z"),
    });

    expect(proposal.schemaVersion).toBe(DAYBREAK_PROPOSAL_SCHEMA_VERSION);
    expect(proposal.sourceWorkerId).toBe("daybreak-alert-analysis-worker");
    expect(proposal.title).toBe("Suspicious PowerShell on alert-1");
    expect(proposal.status).toBe("escalated");
    expect(proposal.confidence).toBe(0.88);
  });

  it("maps needs_evidence verdict to needs-evidence status", () => {
    expect(
      verdictToProposalStatus("needs_evidence", { ...enrichedFixture, stanceSignals: [] }),
    ).toBe("needs-evidence");
  });

  it("maps Attack Discovery alert to proposal", () => {
    const { proposal } = mapAttackDiscoveryToProposal({
      proposalId: "ad-prop-1",
      ad: {
        id: "ad-99",
        title: "Lateral movement cluster",
        description: "Multiple RDP sessions across hosts",
        severity: "critical",
        confidence: 0.91,
        tactics: ["Lateral Movement"],
        relatedAlertIds: ["alert-a", "alert-b"],
      },
      now: new Date("2026-07-12T12:00:00.000Z"),
    });

    expect(proposal.capability).toBe("attack-discovery");
    expect(proposal.sourceWorkerId).toBe("attack-discovery-adapter");
    expect(proposal.evidenceRefs).toEqual(expect.arrayContaining(["evidence-ad-ad-99-source", "evidence-ad-ad-99-alert-0", "evidence-ad-ad-99-alert-1"]));
    expect(proposal.evidenceRefs).not.toContain("alert-a");
    expect(proposal.severity).toBe("critical");
  });
});

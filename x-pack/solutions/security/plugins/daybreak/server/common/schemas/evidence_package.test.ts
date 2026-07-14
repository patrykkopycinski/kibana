/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DAYBREAK_EVIDENCE_SCHEMA_VERSION } from "./versions";
import {
  buildEvidencePackageFromEnrichedAlert,
  toEvidenceProperties,
  type EvidencePackage,
} from "./evidence_package";
import type { EnrichedAlertSchema } from "../../workflow/enrich_alert_schema";

const enrichedFixture: EnrichedAlertSchema = {
  alertId: "alert-fpr-001",
  ruleName: "Noisy VPN rule",
  ruleDescription: "Flags VPN admin scripts",
  severity: "medium",
  signalCount: 3,
  hostSummary: "FIN-WS-04",
  summary: "Benign scheduled PowerShell on finance workstation",
  tactics: ["Execution"],
  stanceSignals: [
    { stance: "against", note: "Known admin script hash" },
    { stance: "against", note: "Asset owner confirmed scheduled task" },
    { stance: "for", note: "Rare host activity" },
  ],
};

describe("evidence_package (Gap #2)", () => {
  it("builds a spike-canonical evidence package from enriched alert", () => {
    const pkg = buildEvidencePackageFromEnrichedAlert(enrichedFixture, "evidence-fpr-001");

    expect(pkg.schemaVersion).toBe(DAYBREAK_EVIDENCE_SCHEMA_VERSION);
    expect(pkg.kind).toBe("alert");
    expect(pkg.alertId).toBe("alert-fpr-001");
    expect(pkg.stance).toBe("against");
    expect(pkg.stanceSignals).toHaveLength(3);
  });

  it("round-trips to ES index document shape", () => {
    const pkg: EvidencePackage = buildEvidencePackageFromEnrichedAlert(
      enrichedFixture,
      "evidence-fpr-002",
      { confidence: 0.91, stance: "for" }
    );
    const props = toEvidenceProperties(pkg);

    expect(props.id).toBe("evidence-fpr-002");
    expect(props.summary).toBe(pkg.summary);
    expect(props.provenance).toBe("capability");
    expect(props.confidence).toBe(0.91);
  });
});

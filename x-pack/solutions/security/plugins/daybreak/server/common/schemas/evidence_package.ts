/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvidenceProperties } from "../../client/evidence/storage";
import type { EnrichedAlertSchema } from "../../workflow/enrich_alert_schema";
import { DAYBREAK_EVIDENCE_SCHEMA_VERSION } from "./versions";

/**
 * Spike-canonical evidence package — richer than the ES index document.
 * Bundles alert enrichment context with stance signals for proposal linkage.
 */
export interface EvidencePackage {
  id: string;
  schemaVersion: string;
  kind: EvidenceProperties["kind"];
  sourceRef?: string;
  summary: string;
  provenance: EvidenceProperties["provenance"];
  confidence: number;
  stance: EvidenceProperties["stance"];
  limitations?: string[];
  sensitivityLabel: EvidenceProperties["sensitivityLabel"];
  createdAt: string;
  alertId?: string;
  tactics?: string[];
  stanceSignals?: EnrichedAlertSchema["stanceSignals"];
}

/** Build an evidence package from the Enrich-phase ground-truth block. */
export const buildEvidencePackageFromEnrichedAlert = (
  enriched: EnrichedAlertSchema,
  id: string,
  options: { confidence?: number; stance?: EvidenceProperties["stance"] } = {},
): EvidencePackage => {
  const forCount = enriched.stanceSignals.filter((s) => s.stance === "for").length;
  const againstCount = enriched.stanceSignals.filter((s) => s.stance === "against").length;
  const defaultStance: EvidenceProperties["stance"] =
    againstCount > forCount ? "against" : "for";

  return {
    id,
    schemaVersion: DAYBREAK_EVIDENCE_SCHEMA_VERSION,
    kind: "alert",
    sourceRef: enriched.alertId,
    summary: enriched.summary,
    provenance: "capability",
    confidence: options.confidence ?? 0.5,
    stance: options.stance ?? defaultStance,
    limitations: undefined,
    sensitivityLabel: "internal",
    createdAt: new Date().toISOString(),
    alertId: enriched.alertId,
    tactics: enriched.tactics,
    stanceSignals: enriched.stanceSignals,
  };
};

/** Flatten an evidence package to the ES index document shape. */
export const toEvidenceProperties = (pkg: EvidencePackage): EvidenceProperties => ({
  id: pkg.id,
  kind: pkg.kind,
  sourceRef: pkg.sourceRef,
  summary: pkg.summary,
  provenance: pkg.provenance,
  confidence: pkg.confidence,
  stance: pkg.stance,
  limitations: pkg.limitations,
  sensitivityLabel: pkg.sensitivityLabel,
  createdAt: pkg.createdAt,
});

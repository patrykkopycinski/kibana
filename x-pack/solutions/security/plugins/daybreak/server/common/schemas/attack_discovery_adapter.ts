/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalProperties, ProposalStatus } from '../../client/proposals/types';
import type { EvidencePackage } from './evidence_package';
import { DAYBREAK_EVIDENCE_SCHEMA_VERSION, DAYBREAK_PROPOSAL_SCHEMA_VERSION } from './versions';
import {
  normalizeAttackDiscoveryInput,
  type AttackDiscoveryContinuationContext,
  type AttackDiscoveryGenerationContext,
  type AttackDiscoveryInput,
  type AttackDiscoveryLegacyStub,
  type NormalizedAttackDiscovery,
} from './attack_discovery_platform_types';

/** @deprecated Use {@link AttackDiscoveryInput} — re-exported for backward compatibility. */
export type AttackDiscoveryAlertSummary = AttackDiscoveryLegacyStub;

const adTriageToProposalStatus = (
  triageStatus: NormalizedAttackDiscovery['triageStatus']
): ProposalStatus => {
  if (triageStatus === 'closed') return 'dismissed';
  if (triageStatus === 'acknowledged') return 'approved';
  return 'new';
};

const adStatusFromScenario = (normalized: NormalizedAttackDiscovery): ProposalStatus => {
  if (normalized.monitorOnly || normalized.duplicateOf) {
    return 'dismissed';
  }
  if (normalized.missingEvidence || (normalized.contradicts && normalized.contradicts.length > 0)) {
    return 'needs-evidence';
  }
  return adTriageToProposalStatus(normalized.triageStatus);
};

const buildRecommendation = (normalized: NormalizedAttackDiscovery): string => {
  if (normalized.monitorOnly) {
    return `Monitor only — ${normalized.summaryMarkdown}`;
  }
  if (normalized.duplicateOf) {
    return `Duplicate of ${normalized.duplicateOf} — ${normalized.summaryMarkdown}`;
  }
  if (normalized.missingEvidence) {
    return `Missing evidence — ${normalized.summaryMarkdown}`;
  }
  if (normalized.contradicts && normalized.contradicts.length > 0) {
    return `Contradicted by ${normalized.contradicts.join(', ')} — ${normalized.summaryMarkdown}`;
  }

  const parts = ['Continue Attack Discovery investigation', normalized.summaryMarkdown];
  if (normalized.evidenceDeltaMarkdown) {
    parts.push(`New evidence: ${normalized.evidenceDeltaMarkdown}`);
  }
  return parts.join(' — ');
};

const buildRiskCaveats = (normalized: NormalizedAttackDiscovery): string[] => {
  const caveats: string[] = [];
  if (normalized.priorContinuationDecisionIds.length > 0) {
    caveats.push(
      `Prior continuation decisions: ${normalized.priorContinuationDecisionIds.join(', ')}`
    );
  }
  if (normalized.inputKind === 'legacy-stub') {
    caveats.push('Mapped from legacy spike stub — prefer 9.5 platform discovery or apiAlert input');
  }
  if (!normalized.generationUuid) {
    caveats.push('generation_uuid not provided — audit linkage incomplete');
  }
  return caveats;
};

/** Build spike-canonical evidence packages from normalized 9.5 AD output. */
export const buildEvidencePackagesFromNormalized = (
  normalized: NormalizedAttackDiscovery,
  now = new Date()
): EvidencePackage[] => {
  const createdAt = normalized.timestamp ?? now.toISOString();
  const packages: EvidencePackage[] = [
    {
      id: `evidence-ad-${normalized.discoveryId}-source`,
      schemaVersion: DAYBREAK_EVIDENCE_SCHEMA_VERSION,
      kind: 'tool',
      sourceRef: normalized.discoveryId,
      summary: normalized.summaryMarkdown,
      provenance: 'tool',
      confidence: normalized.confidence ?? 0.85,
      stance: 'for',
      limitations: [
        normalized.generationUuid ? `generation_uuid=${normalized.generationUuid}` : undefined,
        normalized.connectorId ? `connector_id=${normalized.connectorId}` : undefined,
        normalized.sourceIndex ? `index=${normalized.sourceIndex}` : undefined,
        normalized.caseId ? `case_id=${normalized.caseId}` : undefined,
        normalized.investigationId ? `investigation_id=${normalized.investigationId}` : undefined,
      ].filter((value): value is string => Boolean(value)),
      sensitivityLabel: 'internal',
      createdAt,
      tactics: normalized.mitreAttackTactics,
      stanceSignals: [
        { stance: 'for', note: normalized.detailsMarkdown.slice(0, 320) },
        ...(normalized.evidenceDeltaMarkdown
          ? [{ stance: 'for' as const, note: `Evidence delta: ${normalized.evidenceDeltaMarkdown}` }]
          : []),
      ],
    },
  ];

  if (normalized.entitySummaryMarkdown) {
    packages.push({
      id: `evidence-ad-${normalized.discoveryId}-entities`,
      schemaVersion: DAYBREAK_EVIDENCE_SCHEMA_VERSION,
      kind: 'alert',
      sourceRef: normalized.discoveryId,
      summary: normalized.entitySummaryMarkdown,
      provenance: 'capability',
      confidence: normalized.confidence ?? 0.85,
      stance: 'for',
      sensitivityLabel: 'internal',
      createdAt,
      tactics: normalized.mitreAttackTactics,
      stanceSignals: [{ stance: 'for', note: 'Entity summary from Attack Discovery output' }],
    });
  }

  normalized.alertIds.forEach((alertId, index) => {
    packages.push({
      id: `evidence-ad-${normalized.discoveryId}-alert-${index}`,
      schemaVersion: DAYBREAK_EVIDENCE_SCHEMA_VERSION,
      kind: 'alert',
      sourceRef: alertId,
      summary: `Correlated source alert ${alertId} supporting discovery "${normalized.title}"`,
      provenance: 'capability',
      confidence: normalized.confidence ?? 0.85,
      stance: 'for',
      sensitivityLabel: 'internal',
      createdAt,
      alertId,
      tactics: normalized.mitreAttackTactics,
      stanceSignals: [
        { stance: 'for', note: `Alert ${alertId} correlated by Attack Discovery` },
      ],
    });
  });

  return packages;
};

export interface MapAttackDiscoveryParams {
  proposalId: string;
  ad: AttackDiscoveryInput;
  generation?: AttackDiscoveryGenerationContext;
  continuation?: AttackDiscoveryContinuationContext;
  sourceWatchId?: string;
  sourceWorkerId?: string;
  capability?: string;
  space?: string;
  now?: Date;
}

export interface AttackDiscoveryMappingResult {
  proposal: ProposalProperties;
  evidencePackages: EvidencePackage[];
  normalized: NormalizedAttackDiscovery;
}

/**
 * Map 9.5 Attack Discovery output (generation, API alert, or legacy stub) into a
 * Daybreak proposal + evidence packages.
 */
export const mapAttackDiscoveryToProposal = (
  params: MapAttackDiscoveryParams
): AttackDiscoveryMappingResult => {
  const {
    proposalId,
    ad,
    generation,
    continuation,
    sourceWatchId = 'attack-discovery-watch',
    sourceWorkerId = 'attack-discovery-adapter',
    capability = 'attack-discovery',
    space,
    now = new Date(),
  } = params;

  const normalized = normalizeAttackDiscoveryInput({ input: ad, generation, continuation });
  const evidencePackages = buildEvidencePackagesFromNormalized(normalized, now);
  const severity = normalized.severity ?? 'medium';
  const confidence = normalized.confidence ?? 0.7;
  const status = adStatusFromScenario(normalized);

  const proposal: ProposalProperties = {
    id: proposalId,
    schemaVersion: DAYBREAK_PROPOSAL_SCHEMA_VERSION,
    title: normalized.title,
    sourceWatch: sourceWatchId,
    sourceWorkerId,
    capability,
    severity,
    confidence,
    status,
    recommendation: buildRecommendation(normalized),
    evidenceRefs: evidencePackages.map((pkg) => pkg.id),
    hypothesis: normalized.entitySummaryMarkdown ?? normalized.summaryMarkdown,
    expectedImpact: normalized.mitreAttackTactics.length
      ? `Tactics: ${normalized.mitreAttackTactics.join(', ')}`
      : undefined,
    riskCaveats: buildRiskCaveats(normalized),
    approvalRequirement: 'manual',
    requiredApproverCount: 1,
    approvals: [],
    decisionHistory: [],
    createdAt: now.toISOString(),
    space,
  };

  return { proposal, evidencePackages, normalized };
};

/** Backward-compatible helper returning only the proposal document. */
export const mapAttackDiscoveryToProposalOnly = (
  params: MapAttackDiscoveryParams
): ProposalProperties => mapAttackDiscoveryToProposal(params).proposal;

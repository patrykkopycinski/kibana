/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalProperties } from '../../client/proposals/types';
import type { EvidencePackage } from '../schemas/evidence_package';
import { buildEvidencePackageFromEnrichedAlert } from '../schemas/evidence_package';
import { buildProposalFromWorkerRun } from '../schemas/proposal_builder';
import { mapAttackDiscoveryToProposal } from '../schemas/attack_discovery_adapter';
import type { EnrichedAlertSchema } from '../../workflow/enrich_alert_schema';
import type { ReasonStructuredOutput } from '../../workflow/output_validation_guard';
import { ATTACK_DISCOVERY_SCENARIOS } from '../../evals/attack_discovery_dataset';
import { daybreakGoldenDataset, type AlertEvidence } from '../../evals/golden_dataset';
import {
  DAYBREAK_EVIDENCE_SCHEMA_VERSION,
  DAYBREAK_PROPOSAL_SCHEMA_VERSION,
} from '../schemas/versions';
import {
  mapProposalToCwlStub,
  RATIFICATION_STATUS,
  type ProposalStub,
} from './watch_floor_contract';

/** Spike-only Proposal fields not carried on the CWL {@link ProposalStub}. */
export const UNMAPPED_SPIKE_PROPOSAL_FIELDS = [
  'capability',
  'evidenceRefs',
  'expectedImpact',
  'riskCaveats',
  'decisionHistory',
  'decision',
  'approvals',
  'owner',
  'createdAt',
  'hypothesis',
] as const;

export interface FieldDecision {
  id: string;
  spikeField: string;
  inCwlStub: boolean;
  mvpRequired: boolean;
  unknown: string;
  spikeDefault: string;
  options: string[];
  resolutionTest: string;
}

export interface UnknownEntry {
  id: string;
  source: string;
  question: string;
  spikeAnswer: string;
  artifact: string;
  decisionOwner: string;
  flushTest: string;
}

export interface CwlStubPair {
  spike: ProposalProperties;
  cwlStub: ProposalStub;
  profile: string;
}

export interface RatificationPacket {
  generatedAt: string;
  ownership: typeof RATIFICATION_STATUS;
  ratificationEpic: string;
  schemaVersions: {
    proposal: string;
    evidence: string;
  };
  indices: {
    proposals: string;
    evidence: string;
  };
  goldenExamples: {
    proposalFprDismiss: ProposalProperties;
    proposalAdContinuation: ProposalProperties;
    proposalApprovedForAct: ProposalProperties;
    evidenceFprAlert: EvidencePackage;
    evidenceAdSource: EvidencePackage;
  };
  cwlStubPairs: CwlStubPair[];
  unmappedSpikeFields: readonly string[];
  fieldDecisions: FieldDecision[];
  unknowns: UnknownEntry[];
  requirementsCoverage: {
    proposalQueue: {
      listFields: string[];
      detailFields: string[];
      spikeSatisfies: boolean;
      gaps: string[];
    };
    evidenceTrust: {
      forAndAgainst: string;
      provenance: string;
      spikeSatisfies: string;
    };
  };
}

const RATIFICATION_EPOCH = new Date('2026-07-14T20:00:00.000Z');

export const FIELD_DECISIONS: FieldDecision[] = [
  {
    id: 'FD-01',
    spikeField: 'capability',
    inCwlStub: false,
    mvpRequired: true,
    unknown: 'Is capability a first-class platform Proposal field or derived from WorkerRef?',
    spikeDefault: 'string on proposal (e.g. false-positive-reduction, attack-discovery)',
    options: ['platform field', 'derived from worker', 'extension bag'],
    resolutionTest: 'Platform schema PR includes capability OR documented derivation rule',
  },
  {
    id: 'FD-02',
    spikeField: 'evidenceRefs',
    inCwlStub: false,
    mvpRequired: true,
    unknown: 'How are evidence packages linked — ids only vs embedded summaries?',
    spikeDefault: 'string[] evidence ids → .kibana-daybreak-evidence index',
    options: ['id refs only (spike)', 'embedded evidence[]', 'hybrid with lazy fetch'],
    resolutionTest: 'Reviewer can open proposal detail without ES access',
  },
  {
    id: 'FD-03',
    spikeField: 'expectedImpact / riskCaveats',
    inCwlStub: false,
    mvpRequired: true,
    unknown: 'Required for approve/modify UX or optional enrichment?',
    spikeDefault: 'both optional strings on proposal',
    options: ['required MVP', 'optional', 'capability-specific profiles'],
    resolutionTest: 'daybreak-requirements.md § proposal detail satisfied',
  },
  {
    id: 'FD-04',
    spikeField: 'decisionHistory / decision',
    inCwlStub: false,
    mvpRequired: true,
    unknown: 'Audit trail shape — inline array vs separate audit index?',
    spikeDefault: 'DecisionHistoryEntry[] + optional DecisionRecord on proposal doc',
    options: ['inline (spike)', 'audit service', 'case timeline integration'],
    resolutionTest: 'Eval can reconstruct approve/modify/dismiss rationale',
  },
  {
    id: 'FD-05',
    spikeField: 'hypothesis',
    inCwlStub: false,
    mvpRequired: false,
    unknown: 'Separate from recommendation or merge into summary?',
    spikeDefault: 'optional string; not mapped to CWL summary',
    options: ['keep separate', 'merge to summary', 'drop for GA'],
    resolutionTest: 'UX copy review — analyst sees distinct hypothesis vs recommendation',
  },
  {
    id: 'FD-06',
    spikeField: 'sensitivityLabel (evidence)',
    inCwlStub: false,
    mvpRequired: true,
    unknown: 'Label-only vs enforced RBAC/redaction at read time?',
    spikeDefault: 'internal | restricted on EvidencePackage; no enforcement yet',
    options: ['label metadata', 'RBAC gate', 'redaction pipeline'],
    resolutionTest: 'Restricted evidence hidden from analyst without role (GAPS row)',
  },
  {
    id: 'FD-07',
    spikeField: 'stanceSignals / tactics (evidence)',
    inCwlStub: false,
    mvpRequired: true,
    unknown: 'For/against evidence — required for MVP trust requirement?',
    spikeDefault: 'stanceSignals array on alert evidence packages',
    options: ['required', 'capability-specific', 'defer to Ask thread'],
    resolutionTest: 'requirements: proposals show evidence for AND against',
  },
  {
    id: 'FD-08',
    spikeField: 'dismissal reason taxonomy',
    inCwlStub: false,
    mvpRequired: true,
    unknown: 'Structured dismiss reasons (wrong, duplicate, …) — enum on decision?',
    spikeDefault: 'free-text reason on DecisionHistoryEntry only',
    options: ['enum + free text', 'free text only', 'case integration'],
    resolutionTest: 'Eval dataset can score dismissal reason class',
  },
];

export const UNKNOWNS_MATRIX: UnknownEntry[] = [
  {
    id: 'U-PLATFORM-01',
    source: 'unblockers/GAPS.md',
    question: 'Where do Proposal + Evidence live on the platform?',
    spikeAnswer: 'Spike indices .kibana-daybreak-proposals / -evidence with spike-canonical schemas',
    artifact: 'data/ratification-packet/ratification-packet.json',
    decisionOwner: 'Daybreak Product/Eng + #17942',
    flushTest: 'Platform stores and renders golden-proposal-fpr without spike plugin',
  },
  {
    id: 'U-PLATFORM-02',
    source: 'unblockers/GAPS.md',
    question: 'Evidence sensitivity / retention / redaction?',
    spikeAnswer: 'sensitivityLabel on package; no retention or redaction enforcement',
    artifact: 'golden-evidence-ad-source.json (restricted label)',
    decisionOwner: 'Security / Platform',
    flushTest: 'Analyst without role cannot read restricted evidence ref',
  },
  {
    id: 'U-AD-01',
    source: 'contract-verification C5',
    question: 'Real AD output shape for continuation proposals?',
    spikeAnswer: 'AttackDiscoveryAlertSummary minimal adapter; 6 scenario dataset',
    artifact: 'golden-proposal-ad.json + attack_discovery_dataset.ts',
    decisionOwner: 'Attack Discovery owners',
    flushTest: 'Adapter maps production AD JSON without field loss on entities/case context',
  },
  {
    id: 'U-HITL-01',
    source: 'contract-verification C6',
    question: 'Which approval dimensions are MVP vs GA on #17944?',
    spikeAnswer: 'Fail-closed on evidenceRefs + recommendation + approver count',
    artifact: 'golden-proposal-approved.json',
    decisionOwner: 'security-team#17944',
    flushTest: 'Shared gate rejects approve when asset criticality dimension fails',
  },
  {
    id: 'U-NAMING-01',
    source: 'daybreak-requirements.md Open',
    question: 'Customer-facing name for Proposal?',
    spikeAnswer: 'UI uses Proposal; no rename',
    artifact: 'golden examples use proposal vocabulary',
    decisionOwner: 'Product / UX',
    flushTest: 'Launch copy decision recorded in glossary',
  },
  {
    id: 'U-NIGHTSHIFT-01',
    source: 'daybreak-requirements.md Open',
    question: 'Investigation object alignment with Nightshift?',
    spikeAnswer: 'Spike InvestigationProperties separate index; AB conversation D9',
    artifact: 'ratification-packet.entities.investigation',
    decisionOwner: 'Cross-program',
    flushTest: 'Single investigation id works in Cases AND AB conversation',
  },
];

export const alertEvidenceToEnriched = (evidence: AlertEvidence): EnrichedAlertSchema => ({
  alertId: evidence.alertId,
  ruleName: evidence.ruleName,
  ruleDescription: evidence.ruleDescription,
  severity: evidence.severity,
  signalCount: evidence.signalCount,
  hostSummary: evidence.hostSummary,
  summary: evidence.summary,
  tactics: evidence.tactics,
  stanceSignals: evidence.stanceSignals,
});

const goldenExampleById = (id: string) => {
  const example = daybreakGoldenDataset.examples.find((row) => row.id === id);
  if (!example) {
    throw new Error(`Golden dataset example not found: ${id}`);
  }
  return example;
};

/** FPR dismiss path — built from golden benign-scanner row + spike builders. */
export const buildGoldenFprPair = (): { proposal: ProposalProperties; evidence: EvidencePackage } => {
  const example = goldenExampleById('daybreak-golden-benign-vuln-scanner');
  const enriched = alertEvidenceToEnriched(example.input.alertEvidence);
  const evidenceId = 'evidence-golden-fpr-scanner-001';

  const evidence = buildEvidencePackageFromEnrichedAlert(enriched, evidenceId, {
    confidence: example.output.confidence,
    stance: 'against',
  });

  const reason: ReasonStructuredOutput = {
    verdict: example.metadata.verdict ?? 'benign_true_positive',
    confidence: example.output.confidence,
    rationale: example.output.recommendation,
  };

  const proposal = buildProposalFromWorkerRun({
    id: 'golden-proposal-fpr-scanner-exception',
    enriched,
    reason,
    sourceWatchId: 'watch-floor-demo',
    capability: 'false-positive-reduction',
    evidenceRefs: [evidence.id],
    now: RATIFICATION_EPOCH,
  });

  return {
    proposal: {
      ...proposal,
      title: 'Noisy Qualys scanner — propose endpoint exception',
      owner: 'daybreak-operator',
      expectedImpact: 'Estimated 40–60% alert volume reduction on rule noisy-external-scanner-v1',
      riskCaveats: [
        'Exception must not mask non-scanner traffic from same /24',
        'Expire exception in 90 days unless renewed',
      ],
      hypothesis: 'Benign scheduled vulnerability scan mistaken for hostile reconnaissance.',
    },
    evidence,
  };
};

/** AD continuation — built from attack_discovery_dataset useful-continuation scenario. */
export const buildGoldenAdPair = (): { proposal: ProposalProperties; evidence: EvidencePackage } => {
  const scenario = ATTACK_DISCOVERY_SCENARIOS.find((row) => row.id === "ad-useful-continuation");
  if (!scenario) {
    throw new Error("Attack Discovery scenario ad-useful-continuation not found");
  }

  const mapped = mapAttackDiscoveryToProposal({
    proposalId: "golden-proposal-ad-lateral-movement",
    ad: scenario.ad,
    now: RATIFICATION_EPOCH,
  });

  return {
    proposal: mapped.proposal,
    evidence: mapped.evidencePackages[0],
  };
};

/** Approved proposal variant for Act / HITL unknowns flush. */
export const buildGoldenApprovedProposal = (
  base: ProposalProperties,
): ProposalProperties => {
  const ts = RATIFICATION_EPOCH.toISOString();
  return {
    ...base,
    id: 'golden-proposal-approved',
    status: 'approved',
    approvals: [
      {
        actor: 'analyst-demo',
        timestamp: ts,
        reason: 'Scanner pattern confirmed with asset owner',
      },
    ],
    decisionHistory: [
      {
        fromStatus: 'new',
        toStatus: 'approved',
        actor: 'analyst-demo',
        reason: 'Benign scanner — approve exception',
        timestamp: ts,
      },
    ],
    decision: {
      type: 'approve',
      actor: 'analyst-demo',
      reason: 'Benign scanner',
      timestamp: ts,
    },
  };
};

export const buildCwlStubPairs = (
  proposalFpr: ProposalProperties,
  proposalAd: ProposalProperties,
  proposalApproved: ProposalProperties,
): CwlStubPair[] => [
  { spike: proposalFpr, cwlStub: mapProposalToCwlStub(proposalFpr), profile: 'watch-floor-fpr' },
  { spike: proposalAd, cwlStub: mapProposalToCwlStub(proposalAd), profile: 'attack-discovery' },
  {
    spike: proposalApproved,
    cwlStub: mapProposalToCwlStub(proposalApproved),
    profile: 'approved-act-path',
  },
];

/** Build the full #17942 ratification packet from spike-canonical builders. */
export const buildRatificationPacket = (): RatificationPacket => {
  const { proposal: proposalFpr, evidence: evidenceFpr } = buildGoldenFprPair();
  const { proposal: proposalAd, evidence: evidenceAd } = buildGoldenAdPair();
  const proposalApproved = buildGoldenApprovedProposal(proposalFpr);

  return {
    generatedAt: new Date().toISOString(),
    ownership: RATIFICATION_STATUS,
    ratificationEpic: 'elastic/security-team#17942',
    schemaVersions: {
      proposal: DAYBREAK_PROPOSAL_SCHEMA_VERSION,
      evidence: DAYBREAK_EVIDENCE_SCHEMA_VERSION,
    },
    indices: {
      proposals: '.kibana-daybreak-proposals',
      evidence: '.kibana-daybreak-evidence',
    },
    goldenExamples: {
      proposalFprDismiss: proposalFpr,
      proposalAdContinuation: proposalAd,
      proposalApprovedForAct: proposalApproved,
      evidenceFprAlert: evidenceFpr,
      evidenceAdSource: evidenceAd,
    },
    cwlStubPairs: buildCwlStubPairs(proposalFpr, proposalAd, proposalApproved),
    unmappedSpikeFields: [...UNMAPPED_SPIKE_PROPOSAL_FIELDS],
    fieldDecisions: FIELD_DECISIONS,
    unknowns: UNKNOWNS_MATRIX,
    requirementsCoverage: {
      proposalQueue: {
        listFields: [
          'title',
          'sourceWatch',
          'capability',
          'severity',
          'confidence',
          'status',
          'owner',
          'createdAt',
        ],
        detailFields: [
          'recommendation',
          'evidenceRefs',
          'expectedImpact',
          'riskCaveats',
          'approvalRequirement',
          'decisionHistory',
        ],
        spikeSatisfies: true,
        gaps: ['structured dismissal enum', 'assign/defer UX', 'Ask thread persistence'],
      },
      evidenceTrust: {
        forAndAgainst: 'stanceSignals on alert evidence',
        provenance: 'provenance + sourceRef on package',
        spikeSatisfies: 'partial — no separate timeline/entity index',
      },
    },
  };
};

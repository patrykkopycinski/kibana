/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalProperties } from '../client/proposals/types';

/**
 * The alert evidence a single worker run reasons over (the Enrich-phase output
 * fed to the Reason phase). This is the **input** of every golden dataset row.
 *
 * Deliberately a plain, framework-agnostic type so the dataset is the plugin's
 * portable source of truth — a future `kbn-evals-suite-daybreak` package adopts
 * it via `satisfies EvaluationDataset` without a runtime `@kbn/evals` import
 * here (the daybreak plugin does not depend on `@kbn/evals`).
 */
export interface AlertEvidence {
  /** Stable identifier of the alert in the alerts index. */
  alertId: string;
  /** Detection rule name that produced the alert. */
  ruleName: string;
  /** Human-readable description of the rule's intent. */
  ruleDescription: string;
  /** Rule severity, mirrors {@link ProposalProperties.severity}. */
  severity: ProposalProperties['severity'];
  /** Number of signal events that fired for this alert. */
  signalCount: number;
  /** Host / entity context the worker reasons over. */
  hostSummary: string;
  /** Concise evidence summary that drives the recommendation. */
  summary: string;
  /** Observed tactic / technique labels (e.g. MITRE ATT&CK). */
  tactics: string[];
  /**
   * Confidence-weighted stance signals toward ("for") or away ("against") a
   * true-positive verdict. The worker weighs these in the Reason phase.
   */
  stanceSignals: Array<{ stance: 'for' | 'against'; note: string }>;
  /**
   * When true, enrichment could not supply enough correlated evidence for a
   * triage verdict. The worker emits `needs-evidence` (FPR family #5).
   */
  insufficientData?: boolean;
}

/**
 * The subset of {@link ProposalProperties} the offline gate scores against.
 *
 * Only the deterministic, semantically-meaningful fields are pinned. Runtime,
 * non-deterministic fields (`id`, `createdAt`, `evidenceRefs`, `decisionHistory`)
 * are intentionally excluded — the gate does shape matching, not full equality,
 * against an emitted Proposal.
 */
export type ExpectedProposalShape = Pick<
  ProposalProperties,
  'title' | 'capability' | 'severity' | 'confidence' | 'recommendation' | 'status'
>;

/**
 * The triage verdict the Reason phase is expected to reach for this row
 * (mirrors {@link ReasonStructuredOutput.verdict}). Carried in metadata so the
 * task/evaluator can assert on it without polluting the Proposal-shape output.
 */
export type ExpectedVerdict =
  | 'true_positive'
  | 'false_positive'
  | 'benign_true_positive'
  | 'needs_evidence';

/**
 * FPR scenario families from watch-floor-gaps-handoff.md Gap #3. Each family
 * appears exactly once in the golden dataset (except the duplicate-replayed row
 * which reuses the credential-dumping evidence shape under its own id).
 */
export type ScenarioFamily =
  | 'benign-scanner'
  | 'expected-admin'
  | 'risky-broad-exception'
  | 'tuning-hides-suspicious'
  | 'insufficient-data'
  | 'malformed-output-regression'
  | 'duplicate-replayed';

/** All FPR scenario families the golden dataset must cover (Gap #3). */
export const SCENARIO_FAMILIES: readonly ScenarioFamily[] = [
  'benign-scanner',
  'expected-admin',
  'risky-broad-exception',
  'tuning-hides-suspicious',
  'insufficient-data',
  'malformed-output-regression',
  'duplicate-replayed',
] as const;

/**
 * Per-row metadata for the golden dataset. The {@link broken} flag drives the
 * non-vacuous-gate proof (FR-10 / A-3): a broken row carries an intentionally
 * wrong expected shape and the gate MUST fail on it.
 */
export interface DaybreakGoldenExampleMetadata {
  /** Human-readable label for the scenario. */
  description: string;
  /**
   * When `true`, this row's {@link DaybreakGoldenExample.output} is
   * intentionally wrong (flipped recommendation) and the gate is expected to
   * score it `0`. Proves the gate catches real regressions (FR-10 / A-3).
   */
  broken?: boolean;
  /** Expected Reason-phase triage verdict (supplementary ground truth). */
  verdict: ExpectedVerdict;
  /**
   * FPR scenario family tag (Gap #3). Omitted on the baseline true-positive row
   * that is not itself an FPR scenario.
   */
  scenarioFamily?: ScenarioFamily;
}

/**
 * A single golden dataset row — structurally compatible with
 * `@kbn/evals`'s `Example<TInput, TExpected, TMetadata>` so the same object can
 * be passed to `executorClient.runExperiment({ datasets: [...] })` unchanged.
 */
export interface DaybreakGoldenExample {
  /** Stable identifier for the example (content-style hash). */
  id: string;
  /** The alert evidence the worker reasons over (FR-8 input). */
  input: { alertEvidence: AlertEvidence };
  /** The expected Proposal shape the gate scores against (FR-8 output). */
  output: ExpectedProposalShape;
  /** Per-row metadata, including the {@link DaybreakGoldenExampleMetadata.broken} flag. */
  metadata: DaybreakGoldenExampleMetadata;
}

/**
 * Stable name of the golden dataset. Used as the `experimentName` anchor by the
 * suite-level pass/fail assertion after `runExperiment`.
 */
export const DAYBREAK_GOLDEN_DATASET_NAME = 'daybreak-alert-analysis-proposal-shape';

const TRUE_POSITIVE_CRITICAL: DaybreakGoldenExample = {
  id: 'daybreak-golden-mimikatz-lsass',
  input: {
    alertEvidence: {
      alertId: 'alert-mimikatz-dc01',
      ruleName: 'Credential Dumping - LSASS Memory - Mimikatz',
      ruleDescription: 'Detects credential-dumping activity targeting the LSASS process.',
      severity: 'critical',
      signalCount: 47,
      hostSummary: 'Domain controller DC01 (win2022-dc01); privileged context.',
      summary:
        'Repeated Invoke-Mimikatz sequences against lsass.exe observed on a domain controller.',
      tactics: ['Credential Access', 'OS Credential Dumping', 'T1003.001'],
      stanceSignals: [
        { stance: 'for', note: 'Known mimikatz signature matched with high signal-to-noise.' },
        { stance: 'for', note: 'Activity on a domain controller raises blast radius.' },
      ],
    },
  },
  output: {
    title: 'Credential Dumping - LSASS Memory - Mimikatz on alert-mimikatz-dc01',
    capability: 'alert-analysis',
    severity: 'critical',
    confidence: 0.9,
    recommendation:
      'Escalate — Repeated Invoke-Mimikatz sequences against lsass.exe observed on a domain controller.',
    status: 'escalated',
  },
  metadata: {
    description: 'Nominal true positive — critical credential dumping on a domain controller.',
    verdict: 'true_positive',
  },
};

const BENIGN_SCANNER: DaybreakGoldenExample = {
  id: 'daybreak-golden-benign-vuln-scanner',
  input: {
    alertEvidence: {
      alertId: 'alert-qualys-scan-app01',
      ruleName: 'Network Scanning - Suspicious Port Sweep',
      ruleDescription: 'Flags rapid sequential connection attempts across many ports.',
      severity: 'low',
      signalCount: 12,
      hostSummary: 'Application server APP-01 in the production VLAN.',
      summary:
        'Port sweep from the approved Qualys vulnerability scanner during the weekly assessment window.',
      tactics: ['Discovery', 'Network Service Discovery', 'T1046'],
      stanceSignals: [
        { stance: 'against', note: 'Source IP belongs to the approved Qualys scanner appliance.' },
        { stance: 'against', note: 'Scan matches the documented weekly vulnerability assessment window.' },
      ],
    },
  },
  output: {
    title: 'Network Scanning - Suspicious Port Sweep on alert-qualys-scan-app01',
    capability: 'alert-analysis',
    severity: 'low',
    confidence: 0.95,
    recommendation:
      'Dismiss — Port sweep from the approved Qualys vulnerability scanner during the weekly assessment window.',
    status: 'dismissed',
  },
  metadata: {
    description: 'Nominal false positive — approved vulnerability scanner activity.',
    verdict: 'benign_true_positive',
    scenarioFamily: 'benign-scanner',
  },
};

const FALSE_POSITIVE_AUTHORIZED_ADMIN: DaybreakGoldenExample = {
  id: 'daybreak-golden-authorized-powershell',
  input: {
    alertEvidence: {
      alertId: 'alert-powershell-admin-ws',
      ruleName: 'PowerShell - Suspicious Script Block Execution',
      ruleDescription:
        'Flags PowerShell script-block execution that resembles suspicious patterns.',
      severity: 'low',
      signalCount: 3,
      hostSummary: 'Admin workstation ADM-WS-02 within the IT-Admins zone.',
      summary:
        'Routine PowerShell remediation script executed by a member of the IT-Admins group during a scheduled maintenance window.',
      tactics: ['Execution'],
      stanceSignals: [
        { stance: 'against', note: 'Executor belongs to the approved IT-Admins group.' },
        { stance: 'against', note: 'Fired inside a documented maintenance window.' },
      ],
    },
  },
  output: {
    title: 'PowerShell - Suspicious Script Block Execution on alert-powershell-admin-ws',
    capability: 'alert-analysis',
    severity: 'low',
    confidence: 0.95,
    recommendation:
      'Dismiss — Routine PowerShell remediation script executed by a member of the IT-Admins group during a scheduled maintenance window.',
    status: 'dismissed',
  },
  metadata: {
    description: 'Nominal false positive — benign authorized admin PowerShell activity.',
    verdict: 'benign_true_positive',
    scenarioFamily: 'expected-admin',
  },
};

const RISKY_BROAD_EXCEPTION: DaybreakGoldenExample = {
  id: 'daybreak-golden-risky-broad-exception',
  input: {
    alertEvidence: {
      alertId: 'alert-lateral-movement-dmz',
      ruleName: 'Lateral Movement - Remote Service Administration',
      ruleDescription: 'Detects remote service creation indicative of lateral movement.',
      severity: 'high',
      signalCount: 18,
      hostSummary: 'DMZ jump host JUMP-04; broad /24 suppression exception in effect.',
      summary:
        'Remote service creation observed on a DMZ jump host despite an overly broad /24 subnet exception.',
      tactics: ['Lateral Movement', 'Remote Services', 'T1021'],
      stanceSignals: [
        { stance: 'for', note: 'Lateral movement pattern detected despite broad suppression rule.' },
        { stance: 'for', note: 'Existing exception covers entire /24 subnet — risky scope.' },
      ],
    },
  },
  output: {
    title: 'Lateral Movement - Remote Service Administration on alert-lateral-movement-dmz',
    capability: 'alert-analysis',
    severity: 'high',
    confidence: 0.825,
    recommendation:
      'Escalate — Remote service creation observed on a DMZ jump host despite an overly broad /24 subnet exception.',
    status: 'escalated',
  },
  metadata: {
    description: 'Nominal true positive — lateral movement surfaced through a risky broad exception.',
    verdict: 'true_positive',
    scenarioFamily: 'risky-broad-exception',
  },
};

const TUNING_HIDES_SUSPICIOUS: DaybreakGoldenExample = {
  id: 'daybreak-golden-tuning-hides-suspicious',
  input: {
    alertEvidence: {
      alertId: 'alert-exfil-tuning-suppressed',
      ruleName: 'Data Exfiltration - Unusual Outbound Volume',
      ruleDescription: 'Flags anomalous outbound data transfer volumes.',
      severity: 'medium',
      signalCount: 6,
      hostSummary: 'Workstation WS-2291; aggressive threshold tuning applied last sprint.',
      summary:
        'Outbound volume spike suppressed by aggressive threshold tuning despite residual exfiltration indicators.',
      tactics: ['Exfiltration', 'Exfiltration Over Web Service', 'T1567'],
      stanceSignals: [
        { stance: 'against', note: 'Alert suppressed by aggressive threshold tuning applied last sprint.' },
        { stance: 'against', note: 'Similar benign traffic pattern in historical baseline.' },
        { stance: 'for', note: 'Residual indicators still match exfiltration heuristic.' },
      ],
    },
  },
  output: {
    title: 'Data Exfiltration - Unusual Outbound Volume on alert-exfil-tuning-suppressed',
    capability: 'alert-analysis',
    severity: 'medium',
    confidence: 0.55,
    recommendation:
      'Gather additional evidence — Outbound volume spike suppressed by aggressive threshold tuning despite residual exfiltration indicators.',
    status: 'needs-evidence',
  },
  metadata: {
    description: 'Nominal needs-evidence — mixed signals after aggressive detection tuning hide the true verdict.',
    verdict: 'needs_evidence',
    scenarioFamily: 'tuning-hides-suspicious',
  },
};

const INSUFFICIENT_DATA: DaybreakGoldenExample = {
  id: 'daybreak-golden-insufficient-proxy-logs',
  input: {
    alertEvidence: {
      alertId: 'alert-incomplete-proxy-logs',
      ruleName: 'Data Exfiltration - Unusual Outbound Volume',
      ruleDescription: 'Flags anomalous outbound data transfer volumes.',
      severity: 'medium',
      signalCount: 1,
      hostSummary: 'Workstation WS-4419; endpoint and proxy logs unavailable.',
      summary:
        'Outbound volume spike detected but endpoint and proxy logs are unavailable for correlation.',
      tactics: ['Exfiltration'],
      stanceSignals: [
        { stance: 'for', note: 'Volume exceeds 3-sigma baseline for this host.' },
      ],
      insufficientData: true,
    },
  },
  output: {
    title: 'Data Exfiltration - Unusual Outbound Volume on alert-incomplete-proxy-logs',
    capability: 'alert-analysis',
    severity: 'medium',
    confidence: 0.5,
    recommendation:
      'Gather additional evidence — Outbound volume spike detected but endpoint and proxy logs are unavailable for correlation.',
    status: 'needs-evidence',
  },
  metadata: {
    description: 'Nominal needs-evidence — insufficient correlated telemetry for a triage verdict.',
    verdict: 'needs_evidence',
    scenarioFamily: 'insufficient-data',
  },
};

const DUPLICATE_REPLAYED: DaybreakGoldenExample = {
  id: 'daybreak-golden-duplicate-mimikatz-replay',
  input: {
    alertEvidence: {
      alertId: 'alert-mimikatz-dc01-replay',
      ruleName: 'Credential Dumping - LSASS Memory - Mimikatz',
      ruleDescription: 'Detects credential-dumping activity targeting the LSASS process.',
      severity: 'critical',
      signalCount: 47,
      hostSummary: 'Domain controller DC01 (win2022-dc01); privileged context.',
      summary:
        'Repeated Invoke-Mimikatz sequences against lsass.exe observed on a domain controller.',
      tactics: ['Credential Access', 'OS Credential Dumping', 'T1003.001'],
      stanceSignals: [
        { stance: 'for', note: 'Known mimikatz signature matched with high signal-to-noise.' },
        { stance: 'for', note: 'Activity on a domain controller raises blast radius.' },
      ],
    },
  },
  output: {
    title: 'Credential Dumping - LSASS Memory - Mimikatz on alert-mimikatz-dc01-replay',
    capability: 'alert-analysis',
    severity: 'critical',
    confidence: 0.9,
    recommendation:
      'Escalate — Repeated Invoke-Mimikatz sequences against lsass.exe observed on a domain controller.',
    status: 'escalated',
  },
  metadata: {
    description: 'Nominal duplicate — replayed credential-dumping input with identical expected shape.',
    verdict: 'true_positive',
    scenarioFamily: 'duplicate-replayed',
  },
};

/**
 * DELIBERATELY-BROKEN row (FR-10 / A-3 — non-vacuous gate proof).
 *
 * The evidence clearly describes a critical ransomware true positive (mass file
 * encryption + shadow-copy deletion), so the worker WILL emit a Proposal to
 * escalate at 'critical' severity. The {@link output} here carries the
 * **flipped** recommendation (dismiss as routine maintenance, low severity).
 *
 * The gate MUST score this row `0`: the emitted Proposal cannot match the
 * flipped expected shape. If it ever scored `1`, the gate would be vacuous
 * (matching anything), which is the regression this row exists to catch.
 */
const BROKEN_FLIPPED_RECOMMENDATION: DaybreakGoldenExample = {
  id: 'daybreak-golden-broken-flipped-ransomware',
  input: {
    alertEvidence: {
      alertId: 'alert-ransomware-fileserver-03',
      ruleName: 'Ransomware - Mass File Encryption and Shadow Copy Deletion',
      ruleDescription: 'Detects indicators consistent with ransomware execution.',
      severity: 'critical',
      signalCount: 512,
      hostSummary: 'File server FILESERVER-03; broad file-server role.',
      summary:
        'Mass file encryption across thousands of shares and deletion of volume shadow copies observed on a file server.',
      tactics: ['Impact', 'Data Encrypted for Impact', 'Inhibit System Recovery', 'T1486', 'T1490'],
      stanceSignals: [
        { stance: 'for', note: 'Mass-encryption pattern across network shares.' },
        { stance: 'for', note: 'vssadmin delete shadows executed with elevated rights.' },
      ],
    },
  },
  output: {
    // Intentionally wrong (flipped) — the gate MUST fail to match this.
    title: 'Routine maintenance on file server FILESERVER-03',
    capability: 'alert-analysis',
    severity: 'low',
    confidence: 0.1,
    recommendation: 'Dismiss as routine maintenance activity — no action required.',
    status: 'dismissed',
  },
  metadata: {
    description:
      'BROKEN — ransomware evidence with a deliberately flipped (dismiss) recommendation. Gate must FAIL on this row.',
    broken: true,
    verdict: 'true_positive',
    scenarioFamily: 'malformed-output-regression',
  },
};

/**
 * The golden dataset of alert evidence → expected Proposal shape (FR-8).
 *
 * Eight rows: seven nominal (baseline true positive plus six FPR scenario
 * families and one duplicate-replayed row) and one deliberately-broken row
 * (FR-10 / A-3) whose expected shape is intentionally wrong so the gate can
 * prove it catches real regressions.
 *
 * Structurally compatible with `@kbn/evals`'s `EvaluationDataset` — pass
 * directly to `executorClient.runExperiment({ datasets: [daybreakGoldenDataset] })`.
 */
export const daybreakGoldenDataset: {
  name: string;
  description: string;
  examples: DaybreakGoldenExample[];
} = {
  name: DAYBREAK_GOLDEN_DATASET_NAME,
  description:
    'Golden alert-evidence → expected Proposal shape for the daybreak alert-analysis worker. Covers all seven FPR scenario families (Gap #3) plus a baseline true positive and one deliberately-broken row (FR-8, FR-10, A-3).',
  examples: [
    TRUE_POSITIVE_CRITICAL,
    BENIGN_SCANNER,
    FALSE_POSITIVE_AUTHORIZED_ADMIN,
    RISKY_BROAD_EXCEPTION,
    TUNING_HIDES_SUSPICIOUS,
    INSUFFICIENT_DATA,
    DUPLICATE_REPLAYED,
    BROKEN_FLIPPED_RECOMMENDATION,
  ],
};

/** Indices of the deliberately-broken rows (FR-10 / A-3 non-vacuous proof). */
export const BROKEN_EXAMPLE_IDS: readonly string[] = daybreakGoldenDataset.examples
  .filter((example) => example.metadata.broken === true)
  .map((example) => example.id);

/** Indices of the nominal (non-broken) rows the gate must pass. */
export const NOMINAL_EXAMPLE_IDS: readonly string[] = daybreakGoldenDataset.examples
  .filter((example) => example.metadata.broken !== true)
  .map((example) => example.id);

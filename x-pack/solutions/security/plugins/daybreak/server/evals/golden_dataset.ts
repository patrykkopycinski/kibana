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
    title: 'Credential dumping on domain controller DC01',
    capability: 'detection',
    severity: 'critical',
    confidence: 0.9,
    recommendation:
      'Escalate to the IR team immediately — credential dumping on a domain controller indicates active compromise.',
    status: 'escalated',
  },
  metadata: {
    description: 'Nominal true positive — critical credential dumping on a domain controller.',
    verdict: 'true_positive',
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
    title: 'Authorized PowerShell remediation during maintenance window',
    capability: 'detection',
    severity: 'low',
    confidence: 0.2,
    recommendation:
      'Dismiss as authorized administrator activity during a scheduled maintenance window.',
    status: 'dismissed',
  },
  metadata: {
    description: 'Nominal false positive — benign authorized admin PowerShell activity.',
    verdict: 'benign_true_positive',
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
    capability: 'detection',
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
  },
};

/**
 * The golden dataset of alert evidence → expected Proposal shape (FR-8).
 *
 * Three rows: two nominal (one true positive, one false positive) and one
 * deliberately-broken row (FR-10 / A-3) whose expected shape is intentionally
 * wrong so the gate can prove it catches real regressions.
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
    'Golden alert-evidence → expected Proposal shape for the daybreak alert-analysis worker. Includes one deliberately-broken row (flipped recommendation) to prove the gate is non-vacuous (FR-8, FR-10, A-3).',
  examples: [
    TRUE_POSITIVE_CRITICAL,
    FALSE_POSITIVE_AUTHORIZED_ADMIN,
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

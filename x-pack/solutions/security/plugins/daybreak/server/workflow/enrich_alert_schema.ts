/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalStatus } from '../client/proposals/types';
import type { MissingRequirement } from '../client/proposals/gate';

/**
 * The complete 7-value {@link ProposalStatus} union, materialised as a readonly
 * tuple so tests and consumers can assert exhaustiveness without importing the
 * type system (FR-019).
 *
 * Order mirrors the declaration in {@link ProposalStatus} — any new status
 * value MUST be added here in lockstep.
 */
export const PROPOSAL_STATUS_VALUES: readonly ProposalStatus[] = [
  'new',
  'needs-evidence',
  'approved',
  'modified',
  'dismissed',
  'escalated',
  'deferred',
];

/**
 * Type guard: returns `true` when `value` is one of the 7 recognised
 * {@link ProposalStatus} values (FR-019).
 */
export const isProposalStatus = (value: unknown): value is ProposalStatus =>
  typeof value === 'string' && PROPOSAL_STATUS_VALUES.includes(value as ProposalStatus);

/** Severity values shared between alert evidence and proposals. */
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * A single confidence-weighted stance signal extracted from alert evidence.
 * Stance `'for'` supports a true-positive verdict; `'against'` refutes it.
 */
export interface StanceSignal {
  stance: 'for' | 'against';
  note: string;
}

/**
 * The compact ground-truth evidence block produced by the Enrich phase
 * (FR-009). This is the structured data the Reason phase reasons over.
 *
 * **NFR-4 (prompt-injection control):** This block is PURE DATA — it
 * contains only observed-fact fields extracted from the alert, never prompt
 * text, model instructions, or reasoning rubrics. The Reason phase receives
 * it as a JSON data input (`{{ steps.enrich.output | json }}`), structurally
 * separate from any system-prompt framing. Even if an attacker embeds
 * instruction-like text inside an alert field, it arrives here as a data
 * value inside `summary` or `stanceSignals[].note`, not as top-level prompt
 * context that the model might interpret as an instruction.
 */
export interface EnrichedAlertSchema {
  /** Stable identifier of the alert in the alerts index. */
  alertId: string;
  /** Optional golden-dataset row id carried through the workflow for eval-record attribution. */
  rowId?: string;
  /** Detection rule name that produced the alert. */
  ruleName: string;
  /** Human-readable description of the rule's intent. */
  ruleDescription: string;
  /** Rule severity, mirrors {@link ProposalStatus} severity values. */
  severity: AlertSeverity;
  /** Number of signal events that fired for this alert. */
  signalCount: number;
  /** Host / entity context the worker reasons over. */
  hostSummary: string;
  /** Concise evidence summary that drives the recommendation. */
  summary: string;
  /** Observed tactic / technique labels (e.g. MITRE ATT&CK). */
  tactics: string[];
  /** Confidence-weighted stance signals toward or against a true-positive verdict. */
  stanceSignals: StanceSignal[];
}

/**
 * Thrown by {@link enrichAlertSchema} when the raw alert-summary response is
 * malformed or empty, halting the workflow before the Reason phase receives
 * garbage data (FR-009 fail-closed).
 *
 * Carries the specific {@link MissingRequirement} values so the downstream
 * readiness gate (FR-018) can surface exactly what is missing to the operator.
 */
export class EnrichSchemaError extends Error {
  constructor(message: string, public readonly missingRequirements: MissingRequirement[]) {
    super(message);
    this.name = 'EnrichSchemaError';
  }
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isFiniteNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isAlertSeverity = (value: unknown): value is AlertSeverity =>
  typeof value === 'string' && ['low', 'medium', 'high', 'critical'].includes(value);

const isStance = (value: unknown): value is 'for' | 'against' =>
  value === 'for' || value === 'against';

const isStanceSignal = (value: unknown): value is StanceSignal => {
  if (value == null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return isStance(record.stance) && isNonEmptyString(record.note);
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * Derive the initial {@link ProposalStatus} for a freshly-enriched alert
 * (FR-019).
 *
 * A newly-enriched alert starts as `'new'` when it carries enough stance
 * signals for the Reason phase to triage, or `'needs-evidence'` when the
 * evidence is too thin. Both values belong to the 7-value
 * {@link ProposalStatus} union.
 */
export const deriveInitialStatus = (schema: EnrichedAlertSchema): ProposalStatus => {
  if (schema.stanceSignals.length === 0) {
    return 'needs-evidence';
  }
  return 'new';
};

/**
 * Identifies which readiness-gate requirements are unmet given the enriched
 * schema (FR-018).
 *
 * The readiness gate checks two requirements when transitioning to `'approved'`:
 * `'evidence'` (non-empty `evidenceRefs`) and `'recommendation'` (non-empty
 * `recommendation`). The Enrich phase produces the evidence; the Reason phase
 * produces the recommendation. This function surfaces the `'evidence'`
 * requirement as missing when the enriched schema is too thin to populate
 * `evidenceRefs` — the gate will then report this to the operator verbatim.
 */
export const findMissingRequirements = (schema: EnrichedAlertSchema): MissingRequirement[] => {
  const missing: MissingRequirement[] = [];

  const hasEvidence = schema.stanceSignals.length > 0 || isNonEmptyString(schema.summary);
  if (!hasEvidence) {
    missing.push('evidence');
  }

  return missing;
};

/**
 * Validates that the enriched schema satisfies the NFR-4 structural-separation
 * invariant: the evidence block must contain only observed-fact data, never
 * prompt text or model instructions.
 *
 * This is a defensive check — the {@link enrichAlertSchema} transform never
 * injects prompt strings, but this function lets tests and downstream
 * consumers assert the invariant programmatically.
 *
 * @returns `true` when the schema is structurally clean (no instruction-like content).
 */
export const isStructurallySeparated = (schema: EnrichedAlertSchema): boolean => {
  const instructionPatterns = [
    /^\s*system\s*:/i,
    /^\s*instructions?\s*:/i,
    /^\s*prompt\s*:/i,
    /^\s*you\s+are\s+/i,
    /^\s*act\s+as\s+/i,
  ];

  const checkString = (text: string): boolean => !instructionPatterns.some((re) => re.test(text));

  return (
    checkString(schema.ruleName) &&
    checkString(schema.ruleDescription) &&
    checkString(schema.hostSummary) &&
    checkString(schema.summary) &&
    schema.tactics.every(checkString) &&
    schema.stanceSignals.every((signal) => checkString(signal.note))
  );
};

/**
 * Parse and validate a raw alerts-summary API response into the structured
 * {@link EnrichedAlertSchema} ground-truth block (FR-009).
 *
 * This is a workflow-authored guard (per PD-1's `server/workflow/README.md` —
 * "Fail-closed on error is NOT an engine built-in; it is a boundary concern
 * that the worker must enforce itself"). On any malformed or empty input the
 * function throws {@link EnrichSchemaError}, halting the workflow before the
 * Reason phase can receive garbage evidence.
 *
 * @param raw - The parsed JSON body from the
 *   `GET /internal/detection_engine/signals/_alerts_summary` response.
 * @returns The validated {@link EnrichedAlertSchema}.
 * @throws {EnrichSchemaError} when the response is missing, null, lacks alert
 *   data, or any required field is absent/malformed.
 */
export const enrichAlertSchema = (raw: unknown): EnrichedAlertSchema => {
  if (raw == null || typeof raw !== 'object') {
    throw new EnrichSchemaError(
      'Enrich phase produced no output — the alerts-summary response was null or a non-object',
      ['evidence']
    );
  }

  const record = raw as Record<string, unknown>;
  const alerts = record.alerts;

  if (!Array.isArray(alerts) || alerts.length === 0) {
    throw new EnrichSchemaError(
      'Enrich phase produced no alerts — the alerts-summary response has an empty or missing alerts array',
      ['evidence']
    );
  }

  const firstAlert = alerts[0] as Record<string, unknown> | undefined;
  if (firstAlert == null || typeof firstAlert !== 'object') {
    throw new EnrichSchemaError('Enrich phase — first alert entry is null or a non-object', [
      'evidence',
    ]);
  }

  const source = (firstAlert._source ?? firstAlert) as Record<string, unknown>;
  const signal = (source.signal ?? {}) as Record<string, unknown>;
  const rule = (signal.rule ?? {}) as Record<string, unknown>;
  const host = (source.host ?? {}) as Record<string, unknown>;

  const alertId = firstAlert._id ?? source.alertId;
  if (!isNonEmptyString(alertId)) {
    throw new EnrichSchemaError(
      'Enrich phase — alert is missing a non-empty id (_id or _source.alertId)',
      ['evidence']
    );
  }

  const rowId = source.rowId ?? record.rowId;

  const ruleName = rule.name ?? source.ruleName;
  if (!isNonEmptyString(ruleName)) {
    throw new EnrichSchemaError(
      'Enrich phase — alert is missing a non-empty rule name (signal.rule.name or _source.ruleName)',
      ['evidence']
    );
  }

  const ruleDescription = rule.description ?? source.ruleDescription ?? '';
  if (!isNonEmptyString(ruleDescription)) {
    throw new EnrichSchemaError('Enrich phase — alert is missing a non-empty rule description', [
      'evidence',
    ]);
  }

  const severity = rule.severity ?? source.severity;
  if (!isAlertSeverity(severity)) {
    throw new EnrichSchemaError(
      `Enrich phase — alert severity '${String(
        severity
      )}' is not one of: low, medium, high, critical`,
      ['evidence']
    );
  }

  const signalCount = source.signalCount ?? signal.count ?? alerts.length;
  if (!isFiniteNonNegativeNumber(signalCount)) {
    throw new EnrichSchemaError('Enrich phase — signalCount is not a finite non-negative number', [
      'evidence',
    ]);
  }

  const hostSummary = host.name ?? source.hostSummary ?? '';
  if (!isNonEmptyString(hostSummary)) {
    throw new EnrichSchemaError(
      'Enrich phase — alert is missing a non-empty host summary (host.name or _source.hostSummary)',
      ['evidence']
    );
  }

  const summary = source.summary ?? signal.summary ?? '';
  if (!isNonEmptyString(summary)) {
    throw new EnrichSchemaError('Enrich phase — alert is missing a non-empty evidence summary', [
      'evidence',
    ]);
  }

  const rawTactics = signal.mitre ?? signal.tactics ?? source.tactics ?? [];
  if (!isStringArray(rawTactics)) {
    throw new EnrichSchemaError(
      'Enrich phase — tactics is not a string array (signal.mitre / signal.tactics / _source.tactics)',
      ['evidence']
    );
  }

  const rawStanceSignals = source.stanceSignals ?? [];
  if (!Array.isArray(rawStanceSignals)) {
    throw new EnrichSchemaError('Enrich phase — stanceSignals is present but not an array', [
      'evidence',
    ]);
  }

  const stanceSignals: StanceSignal[] = rawStanceSignals
    .filter(isStanceSignal)
    .map((entry) => ({ stance: entry.stance, note: entry.note }));

  const result: EnrichedAlertSchema = {
    alertId: String(alertId),
    ruleName: String(ruleName),
    ruleDescription: String(ruleDescription),
    severity,
    signalCount,
    hostSummary: String(hostSummary),
    summary: String(summary),
    tactics: rawTactics,
    stanceSignals,
  };

  if (isNonEmptyString(rowId)) {
    result.rowId = rowId;
  }

  return result;
};

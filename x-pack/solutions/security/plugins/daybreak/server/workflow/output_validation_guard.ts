/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The validated structured triage verdict produced by the `ai.agent` Reason
 * phase (FR-010). These fields flow downstream into the Act phase's Proposal
 * record.
 */
export interface ReasonStructuredOutput {
  /** The triage classification (e.g. "true_positive", "false_positive"). */
  verdict: string;
  /** Confidence score in the range [0, 1]. */
  confidence: number;
  /** Human-readable justification for the verdict. */
  rationale: string;
}

/**
 * Thrown by {@link validateReasonOutput} when the `ai.agent` Reason-phase
 * output is malformed or empty, halting the workflow so that no Proposal is
 * silently emitted with a wrong or absent verdict (FR-015, FR-016).
 */
export class WorkflowHaltError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowHaltError';
  }
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Validates the `ai.agent` structured output produced by the Reason phase
 * (FR-015).
 *
 * This is a workflow-authored guard, not an engine built-in (per PD-1's
 * `server/workflow/README.md` — "Fail-closed on error is NOT an engine
 * built-in; it is a boundary concern that the worker must enforce itself").
 *
 * On any malformed or empty input the function throws {@link WorkflowHaltError},
 * halting the workflow before the Act phase can emit a Proposal (FR-016).
 *
 * @param output - The raw output object from the `ai.agent` Reason step.
 * @returns The validated {@link ReasonStructuredOutput}.
 * @throws {WorkflowHaltError} when the output is missing, null, has no
 *   `structured_output`, or the `structured_output` lacks a non-empty
 *   `verdict`, a finite `confidence`, or a non-empty `rationale`.
 */
export const validateReasonOutput = (output: unknown): ReasonStructuredOutput => {
  if (output == null || typeof output !== 'object') {
    throw new WorkflowHaltError(
      'Reason phase produced no output — the ai.agent step returned null or a non-object'
    );
  }

  const { structured_output: structuredOutput } = output as Record<string, unknown>;

  if (structuredOutput == null) {
    throw new WorkflowHaltError(
      'Reason phase produced no structured_output — the agent may not have returned a schema-conformant response'
    );
  }

  if (typeof structuredOutput !== 'object' || Array.isArray(structuredOutput)) {
    throw new WorkflowHaltError(
      'Reason phase structured_output is malformed — expected a JSON object'
    );
  }

  const record = structuredOutput as Record<string, unknown>;
  const { verdict, confidence, rationale } = record;

  if (!isNonEmptyString(verdict)) {
    throw new WorkflowHaltError('Reason phase structured_output is missing a non-empty verdict');
  }

  if (!isFiniteNumber(confidence)) {
    throw new WorkflowHaltError(
      'Reason phase structured_output is missing a valid finite confidence score'
    );
  }

  if (!isNonEmptyString(rationale)) {
    throw new WorkflowHaltError('Reason phase structured_output is missing a non-empty rationale');
  }

  return { verdict, confidence, rationale };
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Pure gate logic for the Family D orchestrator-identity spec (D4 HIL-pause
 * fail-closed and D7 incident-fork integrity).
 */

export const TERMINAL_EXECUTION_STATUSES = ['completed', 'failed', 'cancelled'] as const;
export const PAUSED_EXECUTION_STATUSES = ['waiting', 'waiting_for_input'] as const;

export const isTerminalExecutionStatus = (status: string | undefined): boolean =>
  status !== undefined && (TERMINAL_EXECUTION_STATUSES as readonly string[]).includes(status);

export const isPausedExecutionStatus = (status: string | undefined): boolean =>
  status !== undefined && (PAUSED_EXECUTION_STATUSES as readonly string[]).includes(status);

export interface HilRejectionGateInput {
  preRejectStatus?: string;
  postRejectStatus?: string;
  markerDocs: number;
}

export interface HilRejectionGateResult {
  success: boolean;
  reachedPause: boolean;
  consequentialStepDidNotRun: boolean;
  halted: boolean;
}

/**
 * Fail-closed means the consequential write did not run *because* the
 * rejection took effect. Zero marker documents alone proves nothing: a run
 * that is still paused after the rejection also wrote nothing. The run must
 * have reached a pause before the rejection and a terminal status after it.
 */
export const evaluateHilRejectionGate = ({
  preRejectStatus,
  postRejectStatus,
  markerDocs,
}: HilRejectionGateInput): HilRejectionGateResult => {
  const reachedPause = isPausedExecutionStatus(preRejectStatus);
  const consequentialStepDidNotRun = markerDocs === 0;
  const halted = isTerminalExecutionStatus(postRejectStatus);

  return {
    success: reachedPause && consequentialStepDidNotRun && halted,
    reachedPause,
    consequentialStepDidNotRun,
    halted,
  };
};

/**
 * Key-order-insensitive serialization: two documents describing the same event
 * must compare equal regardless of how the writer ordered their fields.
 */
const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};

/**
 * Lossless fork: every pre-fork event must be present in the incident,
 * unchanged, in addition to whatever the promotion appended. Comparing counts
 * accepts a fork that drops an original thread and writes a replacement event
 * in its place.
 */
export const allPriorEventsCarriedForward = (
  preForkEvents: ReadonlyArray<Record<string, unknown>>,
  incidentEvents: ReadonlyArray<Record<string, unknown>>
): boolean => {
  if (preForkEvents.length === 0) return false;

  const unmatched = incidentEvents.map(stableStringify);
  return preForkEvents.every((priorEvent) => {
    const index = unmatched.indexOf(stableStringify(priorEvent));
    if (index === -1) return false;
    // Consume the match so two identical prior events require two incident copies.
    unmatched.splice(index, 1);
    return true;
  });
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Pure predicates for a VOLUME run: one rule execution of N alerts that the workflow chunks into
 * `consts.batch_size` (50) model calls, plus a partial final chunk.
 *
 * `batch_verdicts.ts` grades one batch. At volume there are several classification calls per
 * execution, each with its own verdict array, token usage, latency and error, and the interesting
 * questions are per call:
 *
 *   1. did every chunk produce a completed classification call at all (a chunk the model 400'd on
 *      yields no verdicts, and a partial final chunk is the one an off-by-one slice loses)?
 *   2. how many verdicts did the RAW array carry vs the chunk's alert count (over-generation)?
 *   3. after the workflow's own post-parse filter (drop foreign ids, dedupe by id, slice to
 *      `batch_size`), does every alert have exactly one verdict?
 *   4. what did each call cost in latency and output tokens, and what error text did a failed call
 *      leave behind?
 *
 * No `@kbn/evals` and no I/O, so the logic is unit-testable and mutation-testable on its own.
 */

export interface RawVerdictLike {
  id?: string;
  classification?: string;
  rationale?: string;
  /** Length of the original rationale when the prose itself was dropped to keep outputs small. */
  rationaleLength?: number;
  contributing_factors?: string[];
}

/** One classification-step execution (`ai.agent` / `ai.prompt`) of a volume run. */
export interface ClassificationCall {
  stepId: string;
  stepExecutionIndex: number;
  /** Foreach iteration the call belongs to, when the scope stack exposes it. */
  scopeId?: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  executionTimeMs?: number;
  inputTokens: number;
  outputTokens: number;
  /** Serialized step error, truncated; null when the step completed without one. */
  errorText: string | null;
  /** Raw verdict array exactly as the step returned it. */
  verdicts: RawVerdictLike[];
}

export interface VolumeAlertRef {
  id: string;
  expected: string;
}

export interface VolumeChunkDiagnostics {
  chunkIndex: number;
  chunkSize: number;
  /** Classification calls assigned to this chunk (a retried call counts once per attempt). */
  callCount: number;
  /** Calls whose status is not `completed` or that carry an error. */
  erroredCalls: number;
  /** Verdicts in the raw array of the call used for grading (the longest, i.e. worst case). */
  rawVerdictCount: number;
  overGeneratedBy: number;
  duplicateIds: string[];
  foreignIds: string[];
  missingIds: string[];
  matchedIds: string[];
  /** Fraction of the chunk's alerts with a verdict after the post-parse filter. */
  coverage: number;
  accuracy: number;
  orderMismatchCount: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number | null;
  errorTexts: string[];
}

export interface VolumeDiagnostics {
  batchId: string;
  totalAlerts: number;
  chunkSize: number;
  chunkCount: number;
  totalCalls: number;
  completedCalls: number;
  erroredCalls: number;
  /** Chunks with no completed call carrying a non-empty verdict array. */
  emptyChunks: number[];
  chunks: VolumeChunkDiagnostics[];
  rawVerdictCount: number;
  alertsWithVerdict: number;
  coverage: number;
  accuracy: number;
  duplicateIds: string[];
  foreignIds: string[];
  missingIds: string[];
  inputTokens: number;
  outputTokens: number;
  latencyMs: number | null;
  errorTexts: string[];
}

export const chunkAlertIds = (alertIds: string[], batchSize: number): string[][] => {
  const chunks: string[][] = [];
  for (let i = 0; i < alertIds.length; i += batchSize) {
    chunks.push(alertIds.slice(i, i + batchSize));
  }
  return chunks;
};

const idOverlap = (verdicts: RawVerdictLike[], chunkIds: Set<string>): number =>
  verdicts.reduce((n, verdict) => (verdict.id != null && chunkIds.has(verdict.id) ? n + 1 : n), 0);

/**
 * Assigns each classification call to the chunk whose alert ids it answered. The workflow runs one
 * call per `foreach` iteration, so the natural mapping is by overlap; a call that returned nothing
 * (error, empty array, or only foreign ids) has no overlap and is assigned, in step order, to the
 * first chunk that has no call yet — that is what makes a 400 on chunk 3 visible instead of
 * silently shifting every later chunk's grading.
 */
export const assignCallsToChunks = (
  chunks: string[][],
  calls: ClassificationCall[]
): ClassificationCall[][] => {
  const sets = chunks.map((ids) => new Set(ids));
  const assigned: ClassificationCall[][] = chunks.map(() => []);
  const ordered = [...calls].sort((a, b) => a.stepExecutionIndex - b.stepExecutionIndex);
  const unassigned: ClassificationCall[] = [];

  for (const call of ordered) {
    // Preferred: the foreach iteration index from the step's scope stack is the chunk index.
    const iteration = call.scopeId != null ? Number.parseInt(call.scopeId, 10) : NaN;
    if (Number.isInteger(iteration) && iteration >= 0 && iteration < chunks.length) {
      assigned[iteration].push(call);
      continue;
    }
    let best = -1;
    let bestOverlap = 0;
    sets.forEach((set, index) => {
      const overlap = idOverlap(call.verdicts, set);
      if (overlap > bestOverlap) {
        best = index;
        bestOverlap = overlap;
      }
    });
    if (best >= 0) {
      assigned[best].push(call);
    } else {
      unassigned.push(call);
    }
  }

  for (const call of unassigned) {
    const empty = assigned.findIndex((list) => list.length === 0);
    if (empty >= 0) {
      assigned[empty].push(call);
    }
  }
  return assigned;
};

const isErrored = (call: ClassificationCall): boolean =>
  call.status !== 'completed' || (call.errorText != null && call.errorText.length > 0);

const pickGradingCall = (calls: ClassificationCall[]): ClassificationCall | undefined => {
  if (calls.length === 0) {
    return undefined;
  }
  return calls.reduce((best, call) =>
    call.verdicts.length > best.verdicts.length ? call : best
  );
};

export const diagnoseVolume = ({
  batchId,
  alerts,
  batchSize,
  calls,
}: {
  batchId: string;
  alerts: VolumeAlertRef[];
  batchSize: number;
  calls: ClassificationCall[];
}): VolumeDiagnostics => {
  const chunks = chunkAlertIds(
    alerts.map((alert) => alert.id),
    batchSize
  );
  const assigned = assignCallsToChunks(chunks, calls);
  const expectedById = new Map(alerts.map((alert) => [alert.id, alert.expected]));

  const chunkDiagnostics: VolumeChunkDiagnostics[] = chunks.map((chunkIds, index) => {
    const chunkCalls = assigned[index];
    const grading = pickGradingCall(chunkCalls);
    const verdicts = grading?.verdicts ?? [];
    const chunkSet = new Set(chunkIds);

    const seen = new Set<string>();
    const duplicateIds: string[] = [];
    const foreignIds: string[] = [];
    for (const verdict of verdicts) {
      const id = verdict.id;
      if (id == null) {
        continue;
      }
      if (!chunkSet.has(id)) {
        foreignIds.push(id);
        continue;
      }
      if (seen.has(id)) {
        duplicateIds.push(id);
      }
      seen.add(id);
    }

    const matchedIds = chunkIds.filter((id) => seen.has(id));
    const missingIds = chunkIds.filter((id) => !seen.has(id));
    let correct = 0;
    let orderMismatchCount = 0;
    const firstById = new Map<string, RawVerdictLike>();
    for (const verdict of verdicts) {
      if (verdict.id != null && chunkSet.has(verdict.id) && !firstById.has(verdict.id)) {
        firstById.set(verdict.id, verdict);
      }
    }
    chunkIds.forEach((id, position) => {
      const verdict = firstById.get(id);
      if (verdict?.classification === expectedById.get(id)) {
        correct += 1;
      }
      const atPosition = verdicts[position];
      if (atPosition != null && atPosition.id !== id) {
        orderMismatchCount += 1;
      }
    });

    return {
      chunkIndex: index,
      chunkSize: chunkIds.length,
      callCount: chunkCalls.length,
      erroredCalls: chunkCalls.filter(isErrored).length,
      rawVerdictCount: verdicts.length,
      overGeneratedBy: Math.max(0, verdicts.length - chunkIds.length),
      duplicateIds: [...new Set(duplicateIds)],
      foreignIds: [...new Set(foreignIds)],
      missingIds,
      matchedIds,
      coverage: chunkIds.length === 0 ? 1 : matchedIds.length / chunkIds.length,
      accuracy: chunkIds.length === 0 ? 1 : correct / chunkIds.length,
      orderMismatchCount,
      inputTokens: chunkCalls.reduce((n, call) => n + call.inputTokens, 0),
      outputTokens: chunkCalls.reduce((n, call) => n + call.outputTokens, 0),
      latencyMs: chunkCalls.reduce<number | null>(
        (sum, call) => (call.executionTimeMs == null ? sum : (sum ?? 0) + call.executionTimeMs),
        null
      ),
      errorTexts: chunkCalls
        .map((call) => call.errorText)
        .filter((text): text is string => text != null && text.length > 0),
    };
  });

  const allIds = new Set(alerts.map((alert) => alert.id));
  const answered = new Set<string>();
  for (const call of calls) {
    for (const verdict of call.verdicts) {
      if (verdict.id != null && allIds.has(verdict.id)) {
        answered.add(verdict.id);
      }
    }
  }
  // Order-independent: an alert counts as answered when ANY classification call of the execution
  // returned a verdict carrying its id. Chunk-level numbers above assume the workflow chunks in
  // the order the alert ids were given; this one does not.
  const alertsWithVerdict = answered.size;
  const correctTotal = chunkDiagnostics.reduce(
    (n, chunk) => n + Math.round(chunk.accuracy * chunk.chunkSize),
    0
  );
  const totalAlerts = alerts.length;
  const allCalls = [...calls].sort((a, b) => a.stepExecutionIndex - b.stepExecutionIndex);

  return {
    batchId,
    totalAlerts,
    chunkSize: batchSize,
    chunkCount: chunks.length,
    totalCalls: allCalls.length,
    completedCalls: allCalls.filter((call) => !isErrored(call)).length,
    erroredCalls: allCalls.filter(isErrored).length,
    emptyChunks: chunkDiagnostics
      .filter((chunk) => chunk.callCount === 0 || chunk.rawVerdictCount === 0)
      .map((chunk) => chunk.chunkIndex),
    chunks: chunkDiagnostics,
    rawVerdictCount: chunkDiagnostics.reduce((n, chunk) => n + chunk.rawVerdictCount, 0),
    alertsWithVerdict,
    coverage: totalAlerts === 0 ? 1 : alertsWithVerdict / totalAlerts,
    accuracy: totalAlerts === 0 ? 1 : correctTotal / totalAlerts,
    duplicateIds: [...new Set(chunkDiagnostics.flatMap((chunk) => chunk.duplicateIds))],
    foreignIds: [...new Set(chunkDiagnostics.flatMap((chunk) => chunk.foreignIds))],
    missingIds: alerts.map((alert) => alert.id).filter((id) => !answered.has(id)),
    inputTokens: allCalls.reduce((n, call) => n + call.inputTokens, 0),
    outputTokens: allCalls.reduce((n, call) => n + call.outputTokens, 0),
    latencyMs: allCalls.reduce<number | null>(
      (sum, call) => (call.executionTimeMs == null ? sum : (sum ?? 0) + call.executionTimeMs),
      null
    ),
    errorTexts: allCalls
      .map((call) => call.errorText)
      .filter((text): text is string => text != null && text.length > 0),
  };
};

/** Every check the volume acceptance criteria need, as named booleans. */
export const volumeIntegrityChecks = (
  d: VolumeDiagnostics,
  { minCoverage = 0.95 }: { minCoverage?: number } = {}
): Record<string, boolean> => ({
  everyChunkHasAVerdictArray: d.emptyChunks.length === 0,
  noDuplicates: d.duplicateIds.length === 0,
  noForeignIds: d.foreignIds.length === 0,
  noMissingVerdicts: d.missingIds.length === 0,
  coverageAtLeastMin: d.coverage >= minCoverage,
});

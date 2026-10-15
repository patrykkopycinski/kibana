/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import type { ExecutionStatus } from '@kbn/workflows';
import type { ClassificationMethod } from './workflow_task';
import type { VolumeLogLine } from './volume_task';
import {
  diagnoseVolume,
  volumeIntegrityChecks,
  type ClassificationCall,
  type VolumeAlertRef,
  type VolumeDiagnostics,
} from './volume_verdicts';

/** What the volume task hands the evaluators: compact (no verdict prose) so golden docs stay small. */
export interface VolumeTaskOutput {
  batchId: string;
  alerts: VolumeAlertRef[];
  batchSize: number;
  executionId: string;
  executionStatus: ExecutionStatus;
  executionError: string | null;
  executionDurationMs: number | null;
  classificationMethod: ClassificationMethod;
  calls: ClassificationCall[];
  diagnosticSteps: Array<{ stepId: string; scopeId?: string; output: unknown }>;
  logLines: VolumeLogLine[];
  totalLogLines: number;
}

const asVolume = (output: unknown): VolumeTaskOutput => output as VolumeTaskOutput;

const diagnose = (output: unknown): VolumeDiagnostics => {
  const o = asVolume(output);
  return diagnoseVolume({
    batchId: o.batchId,
    alerts: o.alerts ?? [],
    batchSize: o.batchSize,
    calls: o.calls ?? [],
  });
};

const OUT_OF_SCHEMA = /does not match the step "schema"/;

const summary = (d: VolumeDiagnostics, o: VolumeTaskOutput) => ({
  batchId: d.batchId,
  totalAlerts: d.totalAlerts,
  chunkCount: d.chunkCount,
  totalCalls: d.totalCalls,
  erroredCalls: d.erroredCalls,
  emptyChunks: d.emptyChunks,
  rawVerdictCount: d.rawVerdictCount,
  alertsWithVerdict: d.alertsWithVerdict,
  coverage: d.coverage,
  accuracy: d.accuracy,
  duplicateIds: d.duplicateIds.length,
  foreignIds: d.foreignIds.length,
  missingIds: d.missingIds.length,
  outputTokens: d.outputTokens,
  latencyMs: d.latencyMs,
  executionStatus: o.executionStatus,
  classificationMethod: o.classificationMethod,
  outOfSchemaWarnings: (o.logLines ?? []).filter((line) => OUT_OF_SCHEMA.test(line.message)).length,
  totalLogLines: o.totalLogLines,
  // Verdicts whose rationale exceeds the schema maxLength (500): each is a batch the strict
  // ai.prompt path would have rejected whole.
  rationaleOver500: (o.calls ?? []).reduce(
    (n, call) =>
      n +
      call.verdicts.filter((v) => (v.rationaleLength ?? (v.rationale ?? '').length) > 500).length,
    0
  ),
  chunks: d.chunks.map((c) => ({
    i: c.chunkIndex,
    n: c.chunkSize,
    calls: c.callCount,
    errored: c.erroredCalls,
    raw: c.rawVerdictCount,
    over: c.overGeneratedBy,
    dup: c.duplicateIds.length,
    foreign: c.foreignIds.length,
    missing: c.missingIds.length,
    coverage: c.coverage,
    outputTokens: c.outputTokens,
    latencyMs: c.latencyMs,
  })),
});

/** 1 when every chunk got a completed call with a verdict array AND no alert lost its verdict. */
export const volumeIntegrity: Evaluator = {
  name: 'VolumeIntegrity',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output }) => {
    const o = asVolume(output);
    const d = diagnose(output);
    const checks = volumeIntegrityChecks(d);
    const failed = Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);
    return {
      score: failed.length === 0 ? 1 : 0,
      label: failed.length === 0 ? 'intact' : failed.join(','),
      explanation:
        `alerts=${d.totalAlerts} chunks=${d.chunkCount} calls=${d.totalCalls} errored=${d.erroredCalls} ` +
        `raw=${d.rawVerdictCount} answered=${d.alertsWithVerdict} dup=${d.duplicateIds.length} ` +
        `foreign=${d.foreignIds.length} missing=${d.missingIds.length}`,
      metadata: { ...summary(d, o), checks },
    };
  },
};

/** Fraction of the execution's alerts that received a verdict (all chunks together). */
export const volumeCoverage: Evaluator = {
  name: 'VolumeCoverage',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output }) => {
    const o = asVolume(output);
    const d = diagnose(output);
    return {
      score: d.coverage,
      label: d.missingIds.length === 0 ? 'complete' : `missing:${d.missingIds.length}`,
      explanation: `${d.alertsWithVerdict}/${d.totalAlerts} alerts answered`,
      metadata: summary(d, o),
    };
  },
};

/** 1 when no classification call errored (EIS 400, timeout, InvalidModelResponse, …). */
export const volumeCallErrors: Evaluator = {
  name: 'VolumeCallErrors',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output }) => {
    const o = asVolume(output);
    const d = diagnose(output);
    return {
      score: d.erroredCalls === 0 && d.totalCalls > 0 ? 1 : 0,
      label: d.totalCalls === 0 ? 'no-calls' : d.erroredCalls === 0 ? 'clean' : `errored:${d.erroredCalls}`,
      explanation: d.errorTexts.slice(0, 3).join(' | ').slice(0, 1500) || 'no call errors',
      metadata: { ...summary(d, o), errorTexts: d.errorTexts.slice(0, 10) },
    };
  },
};

/** Per-alert accuracy against the archetype labels (diagnostic; not an acceptance criterion). */
export const volumeAccuracy: Evaluator = {
  name: 'VolumeClassificationAccuracy',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output }) => {
    const o = asVolume(output);
    const d = diagnose(output);
    return {
      score: d.accuracy,
      label: `${Math.round(d.accuracy * d.totalAlerts)}/${d.totalAlerts}`,
      explanation: `accuracy over all ${d.totalAlerts} alerts (unanswered alerts count as wrong)`,
      metadata: summary(d, o),
    };
  },
};

export const VOLUME_EVALUATORS: Evaluator[] = [
  volumeIntegrity,
  volumeCoverage,
  volumeCallErrors,
  volumeAccuracy,
];

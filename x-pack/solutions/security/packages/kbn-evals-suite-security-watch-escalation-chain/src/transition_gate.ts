/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FLOOR_ESCALATION_POLICY } from './constants';

/**
 * The Floor -> Dark hop predicate, mirroring the Floor orchestrator's
 * `escalate_to_dark` step:
 *
 *     classification == 'true_positive' AND confidence >= escalateThreshold
 *
 * It lives here rather than in the test so the L0 test exercises the same
 * implementation any caller uses, and so the policy it reads is the one
 * production constants declare.
 */
export const shouldEscalateToDark = (workerRun: {
  classification: string;
  confidence: number;
}): boolean =>
  workerRun.classification === FLOOR_ESCALATION_POLICY.triggeringClassification &&
  workerRun.confidence >= FLOOR_ESCALATION_POLICY.escalateThreshold;

export interface WorkerOutputContract {
  classificationEnum: string[];
  confidenceMin: number;
  confidenceMax: number;
}

/**
 * Extracts the structured-output contract a managed Watch worker declares, so
 * the escalation policy can be checked against the worker that feeds it.
 *
 * The orchestrator definition itself (`watch_floor_orchestrator.yaml`) is not
 * in this repository, so this reads the in-tree Floor worker definition
 * instead of a mirror of it.
 */
export const parseWorkerOutputContract = (yamlText: string): WorkerOutputContract => {
  const enumMatch = yamlText.match(/classification:[\s\S]*?enum:\s*\n((?:\s+-\s+\S+\n)+)/);
  const minMatch = yamlText.match(/confidence_score:[\s\S]*?minimum:\s*([\d.]+)/);
  const maxMatch = yamlText.match(/confidence_score:[\s\S]*?maximum:\s*([\d.]+)/);

  if (!enumMatch || !minMatch || !maxMatch) {
    throw new Error('could not read the worker output contract from the definition');
  }

  return {
    classificationEnum: enumMatch[1]
      .split('\n')
      .map((line) => line.trim().replace(/^-\s*/, ''))
      .filter((value) => value.length > 0),
    confidenceMin: Number(minMatch[1]),
    confidenceMax: Number(maxMatch[1]),
  };
};

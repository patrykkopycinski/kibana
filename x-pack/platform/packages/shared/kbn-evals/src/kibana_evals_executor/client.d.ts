/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SomeDevLog } from '@kbn/some-dev-log';
import type { Model } from '@kbn/inference-common';
import type {
  EvalsExecutorClient,
  Evaluator,
  EvaluationDataset,
  EvaluationDatasetWithId,
  ExperimentTask,
  OnEvaluationComplete,
  OnExperimentStart,
  DatasetRunResult,
  TaskOutput,
} from '../types';
export declare class KibanaEvalsClient implements EvalsExecutorClient {
  private readonly options;
  private readonly datasetRunResults;
  constructor(options: {
    log: SomeDevLog;
    model: Model;
    executionId?: string;
    repetitions?: number;
    /**
     * Persists the dataset and resolves to the id the server stored it under,
     * which scores are stamped with. An id it didn't return would detach them.
     */
    upsertDataset?: (dataset: EvaluationDataset) => Promise<string>;
    getDatasetByName?: (
      datasetName: string
    ) => Promise<EvaluationDataset | EvaluationDatasetWithId | null>;
    onEvaluationComplete?: OnEvaluationComplete;
    onExperimentStart?: OnExperimentStart;
  });
  private resolveDataset;
  runExperiment<
    TEvaluationDataset extends EvaluationDataset,
    TTaskOutput extends TaskOutput = TaskOutput
  >(
    {
      name,
      datasets,
      task,
      metadata: experimentMetadata,
      concurrency,
      trustUpstreamDataset,
    }: {
      name?: string;
      datasets: TEvaluationDataset[];
      metadata?: Record<string, unknown>;
      task: ExperimentTask<TEvaluationDataset['examples'][number], TTaskOutput>;
      concurrency?: number;
      trustUpstreamDataset?: boolean;
    },
    evaluators: Array<Evaluator<TEvaluationDataset['examples'][number], TTaskOutput>>
  ): Promise<DatasetRunResult[]>;
  private runSingleDatasetExperiment;
  getDatasetRunResults(): Promise<DatasetRunResult[]>;
}

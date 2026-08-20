/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient } from '@kbn/kbn-client';
import type { SomeDevLog } from '@kbn/some-dev-log';
import {
  type DatasetMaturity,
  type EvaluationScoreDocument,
  type IngestScoresRequestBodyInput,
  type Model as EvalsModel,
} from '@kbn/evals-common';
export interface EvaluatorStats {
  datasetId: string;
  datasetName: string;
  evaluatorName: string;
  stats: {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    count: number;
  };
}
export interface ExperimentStats {
  stats: EvaluatorStats[];
  taskModel: EvalsModel;
  evaluatorModel: EvalsModel;
  totalRepetitions: number;
}
interface GetExperimentFilters {
  taskModelId?: string;
  suiteId?: string;
  executionId?: string;
}
export interface UpsertDatasetInput {
  name: string;
  description: string;
  tags?: string[];
  maturity?: DatasetMaturity;
  /** Spaces to assign the dataset to. Omitted means the space the request lands in. */
  spaceIds?: string[];
  examples: Array<{
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>;
}
export interface DatasetWithId {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  maturity?: DatasetMaturity;
  examples: Array<{
    id: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>;
}
interface IngestScoresResult {
  ingested: number;
  conflicted: number;
  failed: Array<{
    index: number;
    status: number;
    reason: string;
  }>;
}
export interface IngestScoresError extends Error {
  statusCode: 400 | 429 | 500;
  body: IngestScoresResult;
}
export interface BaselineExperiment {
  executionId: string;
  timestamp: string | undefined;
  gitCommitSha: string | null;
  gitBranch: string | null;
}
export declare class EvalsClient {
  private readonly kbnClient;
  private readonly log;
  /** The spaces this run writes to, in the order they were listed. */
  private readonly spaceIds;
  /** The space every request is sent to, when it isn't the default one. */
  private readonly homeSpaceId?;
  constructor(
    kbnClient: KbnClient,
    log: SomeDevLog,
    {
      spaceIds,
    }?: {
      spaceIds?: string[];
    }
  );
  private path;
  ingestScores(request: IngestScoresRequestBodyInput): Promise<IngestScoresResult>;
  getExperimentStats(
    experimentId: string,
    options?: GetExperimentFilters
  ): Promise<ExperimentStats | null>;
  getExperimentScores(
    experimentId: string,
    options?: GetExperimentFilters
  ): Promise<EvaluationScoreDocument[]>;
  /**
   * Creates or updates a dataset and returns the id the server assigned it. Ids
   * derive from the owning space, so the caller can't compute one.
   */
  upsertDataset(dataset: UpsertDatasetInput): Promise<string>;
  private fetchDatasetById;
  /**
   * Looks a dataset up by name within the run's space, guessing the legacy id
   * first — all an older Kibana understands — then asking the server.
   */
  getDatasetByName(datasetName: string): Promise<DatasetWithId | null>;
  /**
   * Deletes a dataset, or detaches it from the run's space when other spaces
   * still use it. The server decides which and reports it back as `unshared`.
   *
   * Takes an id rather than a name: names are only unique within a space, so a
   * wrong one could resolve to a dataset the caller never meant to touch.
   */
  deleteDataset(datasetId: string): Promise<{
    unshared: boolean;
  }>;
  findLatestExperimentForBuild({
    suiteId,
    branch,
    baseExecutionId,
  }: {
    suiteId: string;
    branch?: string;
    baseExecutionId: string;
  }): Promise<BaselineExperiment | undefined>;
  findLatestBaselineExperiment({
    suiteId,
    branch,
    taskModelId,
    excludeExecutionId,
  }: {
    suiteId: string;
    branch: string;
    taskModelId?: string;
    excludeExecutionId?: string;
  }): Promise<BaselineExperiment | undefined>;
  assertPluginEnabled(): Promise<void>;
  /**
   * Refuses a run aimed at a space that isn't there. Kibana only checks that a
   * space exists when it serves a page, so requests prefixed with a mistyped
   * one are answered as though it were real, and the run would write datasets
   * and scores that no space can reach.
   */
  assertSpacesExist(): Promise<void>;
  private fetchSpaceIds;
}
export {};

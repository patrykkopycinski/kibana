/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Max number of LLMs (connectors / EIS models) to run per FTR suite when unset.
 * Override with {@link FTR_GEN_AI_LLM_SAMPLE_SIZE_ENV}.
 */
export declare const DEFAULT_FTR_GEN_AI_LLM_SAMPLE_SIZE = 1;
/**
 * Set to a positive integer to cap how many LLMs are exercised in each FTR run.
 * Set to `all` to run every discovered LLM (slower; useful for local debugging).
 */
export declare const FTR_GEN_AI_LLM_SAMPLE_SIZE_ENV = 'FTR_GEN_AI_LLM_SAMPLE_SIZE';
export type FtrGenAiLlmSampleSize = number | 'all';
export declare function parseFtrGenAiLlmSampleSize(): FtrGenAiLlmSampleSize;
/**
 * Returns a random subset of `items` when the configured sample size is smaller
 * than the list length; otherwise returns the full list (copy).
 */
export declare function takeRandomLlmSample<T>(items: readonly T[]): T[];

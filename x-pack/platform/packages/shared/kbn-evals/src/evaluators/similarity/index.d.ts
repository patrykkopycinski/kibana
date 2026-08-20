/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '../../types';
/**
 * Computes term-frequency cosine similarity between expected and actual outputs.
 *
 * Both inputs are normalized to lowercase tokens. Objects are sorted by keys and
 * serialized to JSON for consistent comparison. Returns a score between 0 and 1,
 * with a configurable threshold for the similar/dissimilar label.
 *
 * @param config.threshold - Minimum cosine similarity to be labeled 'similar' (default: 0.7)
 */
export declare function createSimilarityEvaluator(config?: { threshold?: number }): Evaluator;

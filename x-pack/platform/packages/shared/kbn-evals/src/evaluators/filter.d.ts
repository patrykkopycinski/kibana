/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator, Example, TaskOutput } from '../types';
export declare function parseSelectedEvaluators(): string[];
export declare function selectEvaluators<TExample extends Example, TTaskOutput extends TaskOutput>(
  evaluators: Evaluator<TExample, TTaskOutput>[]
): Evaluator<TExample, TTaskOutput>[];

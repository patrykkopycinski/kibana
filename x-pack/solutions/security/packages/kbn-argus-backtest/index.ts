/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { classifyBacktest, flipIntentStatus, CREATE_HIT_THRESHOLDS } from './src/verdict';
export type {
  BacktestClassification,
  BacktestInput,
  BacktestVerdict,
  MutationIntentStatus,
  RuleAction,
  RuleOp,
} from './src/verdict';

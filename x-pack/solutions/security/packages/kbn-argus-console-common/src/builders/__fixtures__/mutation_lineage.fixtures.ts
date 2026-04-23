/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MutationStageDocs } from '../mutation_lineage_builder';

export const HAPPY_PATH_STAGE_DOCS: MutationStageDocs = {
  mutation_intent_id: 'mut-intent-42',
  rule_id: 'rule-soc-1024',
  source: {
    id: 'alert-abc',
    index: '.alerts-security.alerts-default',
    label: 'Alert: suspicious process chain',
    '@timestamp': '2026-03-14T12:00:00.000Z',
    status: 'done',
  },
  exploit_probability: {
    id: 'expprob-abc',
    label: 'Score: 0.83',
    subtitle: 'weighted CVSS + KEV + exposure',
    '@timestamp': '2026-03-14T12:00:04.200Z',
    status: 'done',
  },
  synthesis: {
    id: 'mut-intent-42',
    label: 'Synthesized rule diff',
    subtitle: '3 KQL clauses added, 1 threshold raised',
    '@timestamp': '2026-03-14T12:00:05.500Z',
    status: 'done',
  },
  eval: {
    id: 'eval-run-99',
    label: 'Eval: PR@k = 0.91',
    subtitle: 'passed golden-cluster gate',
    '@timestamp': '2026-03-14T12:01:00.000Z',
    status: 'done',
  },
  backtest: {
    id: 'backtest-99',
    label: 'Backtest: 14 days',
    subtitle: 'no regressions vs baseline',
    '@timestamp': '2026-03-14T12:02:30.000Z',
    status: 'done',
  },
  apply: {
    id: 'rec-apply-99',
    label: 'Rollout to production',
    subtitle: 'canary cohort: 5%',
    '@timestamp': '2026-03-14T12:05:00.000Z',
    status: 'done',
  },
  observe: {
    id: 'outcome-99-observe',
    label: 'Observing in production',
    subtitle: '48h window',
    '@timestamp': '2026-03-14T12:05:30.000Z',
    status: 'done',
  },
  outcome: {
    id: 'outcome-99-final',
    label: 'Detection holds',
    subtitle: 'no false positive regression',
    '@timestamp': '2026-03-16T12:05:30.000Z',
    status: 'done',
  },
};

export const DRIFT_STAGE_DOCS: MutationStageDocs = {
  ...HAPPY_PATH_STAGE_DOCS,
  mutation_intent_id: 'mut-intent-77',
  rule_id: 'rule-soc-2048',
  drift_detected: {
    id: 'drift-77',
    label: 'Drift detected: background rate shift',
    subtitle: 'recommend re-eval',
    '@timestamp': '2026-03-18T08:00:00.000Z',
    status: 'done',
  },
};

export const ROLLBACK_STAGE_DOCS: MutationStageDocs = {
  ...HAPPY_PATH_STAGE_DOCS,
  mutation_intent_id: 'mut-intent-99',
  rule_id: 'rule-soc-4096',
  apply: {
    id: 'rec-apply-99-rb',
    label: 'Rollout aborted',
    subtitle: 'eval-gated rollback triggered',
    '@timestamp': '2026-03-14T12:05:10.000Z',
    status: 'error',
  },
  rolled_back: true,
  observe: undefined,
  outcome: undefined,
};

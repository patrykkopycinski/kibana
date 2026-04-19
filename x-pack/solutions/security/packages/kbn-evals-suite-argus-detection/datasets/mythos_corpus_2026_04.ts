/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DetectionRuleDataset, DetectionRuleExample } from '../src/evaluate_dataset';

/**
 * Seed corpus for the Argus Detection Eval Vertical — `argus-corpus-mythos-2026-04`.
 *
 * Day-1 scope: one primitive (T1003.001 — LSASS credential dumping) with one
 * variant, sufficient to prove the suite compiles and runs end-to-end. The
 * fully-populated corpus (≥30 variants per primitive across command_args,
 * process_ancestry, encoding_layers) lands in Phase 2 of M2.1 alongside the
 * real replay client and lives under `events/<primitive>/<variant>.ndjson`
 * when the data becomes large enough to warrant off-repo storage.
 */
const seedExamples: DetectionRuleExample[] = [
  {
    id: 'argus-corpus-mythos-2026-04::T1003.001::v000',
    input: {
      rule_id: 'mythos.cred-dumping.lsass',
      rule_version: 'latest',
      corpus_id: 'argus-corpus-mythos-2026-04',
      primitive_id: 'T1003.001',
      variant_index: 0,
    },
    output: {
      should_fire: true,
      expected_rule_ids: ['mythos.cred-dumping.lsass', 'mythos.cred-dumping.minidump'],
      mutation_axes: ['command_args'],
    },
    metadata: {
      primitive_id: 'T1003.001',
      variant_index: 0,
    },
  },
];

export const MYTHOS_CORPUS_2026_04: DetectionRuleDataset = {
  name: 'argus-detection-vertical: mythos-era-corpus-2026-04',
  description:
    'Seed labelled corpus for the Argus Detection Eval Vertical covering Mythos-era primitives ' +
    '(T1003.001 LSASS credential dumping, T1059.001 PowerShell abuse, T1071.004 DNS C2). ' +
    'Day-1 ships one hand-crafted variant per primitive; phase 2 expands to ≥30 variants ' +
    'across the command_args / process_ancestry / encoding_layers mutation axes.',
  examples: seedExamples,
};

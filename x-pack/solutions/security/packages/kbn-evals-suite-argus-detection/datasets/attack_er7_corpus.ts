/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * ARGUS R1 — ATT&CK Evaluations Round 7 labelled corpus.
 *
 * Sits alongside MYTHOS_CORPUS_2026_04 so the Detection Eval Vertical can grade
 * rules against a second, real-world kill-chain (T1190 Exploit Public-Facing
 * Application → T1059.001 PowerShell → T1569.002 Service Execution).
 *
 * The labelled events live at `soc-simulation/scripts/argus-variant-bank/attack-er7/`
 * and are bulk-loaded into `.soc-eval-corpus-argus-corpus-attack-er7` by
 * `soc-simulation/setup.sh` (see the two-level glob pattern in that script).
 */
export const ATTACK_ER7_CORPUS = Object.freeze({
  id: 'argus-corpus-attack-er7',
  index: '.soc-eval-corpus-argus-corpus-attack-er7',
  description:
    'MITRE ATT&CK Evaluations Round 7 labelled corpus — T1190 (Exploit ' +
    'Public-Facing Application), T1059.001 (PowerShell), T1569.002 (Service ' +
    'Execution) — seeded from soc-simulation/scripts/argus-variant-bank/' +
    'attack-er7/ at setup.sh runtime.',
});

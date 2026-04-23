/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Corpus constants for the Argus Detection Eval Vertical.
 *
 * The canonical labelled events themselves live outside this package — under
 * `soc-simulation/scripts/argus-variant-bank/` — and are bulk-loaded into
 * Elasticsearch by `soc-simulation/setup.sh` as part of the SOC simulation
 * bootstrap. The Playwright suite (and the CLI runner) discover them by
 * querying `.soc-eval-corpus-<corpus_id>` using these constants.
 *
 * Keeping the corpus definition code-adjacent (not hard-coded into the
 * evaluator) lets a future milestone swap in `argus-corpus-mythos-2026-07`,
 * `argus-corpus-frontier-sim-2026-05`, etc. without touching the eval logic.
 */
export const MYTHOS_CORPUS_2026_04 = Object.freeze({
  id: 'argus-corpus-mythos-2026-04',
  index: '.soc-eval-corpus-argus-corpus-mythos-2026-04',
  description:
    'Labelled Mythos-era corpus (T1003.001 LSASS credential dumping, T1059.001 ' +
    'PowerShell abuse, T1071.004 DNS C2) seeded from soc-simulation/scripts/' +
    'argus-variant-bank/ at setup.sh runtime.',
});

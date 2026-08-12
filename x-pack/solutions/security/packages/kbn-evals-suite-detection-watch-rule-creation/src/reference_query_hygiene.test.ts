/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { goldenDataset } from '../datasets/rule_creation_golden';
import { hardCases } from '../datasets/hard_cases';
import { SEEDED_INDEX_PATTERNS } from './seed_security_data';

/**
 * Reference-query hygiene.
 *
 * The reference ES|QL is ground truth: evaluators score the agent against it, so a reference that
 * silently matches nothing scores the agent against an unreachable target — a bad fixture wearing
 * the costume of a bad agent.
 *
 * Both guards below cover that one failure mode:
 *   - ES|QL `LIKE` wildcards on `*`; `%` is a literal. Verified live 2026-08-11 against a doc whose
 *     script_block_text contains "IEX": `LIKE "%IEX%"` -> 0 rows, `LIKE "*IEX*"` -> 1. No error.
 *   - A reference pointed at an index no fixture seeds is unmatched for the same reason.
 *
 * `isBrokenFixture` examples are excluded: their query is deliberately bad (the `FROM *` catch-all),
 * so holding them to this bar would assert the opposite of their purpose.
 */
describe('reference query hygiene', () => {
  const references = [...goldenDataset, ...hardCases]
    .filter((e) => e.output.esqlQuery && !e.output.isBrokenFixture)
    .map((e) => [e.id, e.output.esqlQuery!] as const);

  it('has references to check', () => {
    expect(references.length).toBeGreaterThan(0);
  });

  it.each(references)('%s wildcards on *, not SQL %%', (_id, query) => {
    expect(query).not.toMatch(/LIKE\s+"[^"]*%/);
  });

  it.each(references)('%s queries a seeded index', (_id, query) => {
    const from = query.match(/FROM\s+([^\s|]+)/)?.[1] ?? '';
    expect(SEEDED_INDEX_PATTERNS.some((index) => from.startsWith(index))).toBe(true);
  });
});

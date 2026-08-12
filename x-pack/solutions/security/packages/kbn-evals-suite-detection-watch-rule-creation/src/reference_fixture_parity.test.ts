/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { goldenDataset } from '../datasets/rule_creation_golden';
import { hardCases } from '../datasets/hard_cases';
import { buildFixtures } from './seed_security_data';

/**
 * Reference/fixture field parity.
 *
 * `reference_query_hygiene.test.ts` checks the *shape* of a reference query: `*` wildcards rather
 * than SQL `%`, and a `FROM` clause pointing at a seeded index. Both can pass while the query still
 * matches nothing, because neither looks at the fields in the `WHERE` clause.
 *
 * That is the same failure mode as the `%` bug, one layer down. A reference querying
 * `process.parent.name` against a fixture that stopped writing `process.parent` returns zero rows
 * with no error, and every example graded against it becomes unwinnable — silently, and only for
 * the examples that touch the dropped field, so the suite degrades rather than fails.
 *
 * This asserts every ECS field a reference query reads is a field some fixture document actually
 * writes. It is deliberately a *static* check on the two literals, so it runs in CI with no stack:
 * the live "does it return >= 1 row" assertion belongs in the eval run, but this catches the
 * common case (a fixture edit) for free.
 */

/**
 * ECS roots the fixtures populate. Anything outside these is not a field-parity concern.
 *
 * `powershell`, `cloud`, and `source` were absent until 2026-08-12, and their absence is why this
 * guard passed while three references matched zero rows: an unlisted root is not extracted from the
 * query at all, so the field silently skips the comparison instead of failing it. Anything a
 * reference reads must be listed here, or the check is vacuous for that field.
 */
const ECS_ROOTS = [
  'event',
  'process',
  'host',
  'user',
  'file',
  'aws',
  'powershell',
  'cloud',
  'source',
];

const collectLeafPaths = (value: unknown, prefix = '', out = new Set<string>()): Set<string> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out.add(path);
      collectLeafPaths(child, path, out);
    }
  }
  return out;
};

const seededFields = (() => {
  const all = new Set<string>();
  for (const { docs } of buildFixtures()) {
    for (const doc of docs) collectLeafPaths(doc, '', all);
  }
  return all;
})();

const referencedFields = (query: string): string[] => {
  const pattern = new RegExp(`\\b((?:${ECS_ROOTS.join('|')})(?:\\.[a-z_]+)+)`, 'g');
  return [...new Set(query.match(pattern) ?? [])];
};

describe('reference/fixture field parity', () => {
  const references = [...goldenDataset, ...hardCases]
    // Broken fixtures are deliberately bad; holding them to this bar asserts the opposite of
    // their purpose. Same exclusion as the hygiene guard.
    .filter((e) => e.output.esqlQuery && !e.output.isBrokenFixture)
    .map((e) => [e.id, e.output.esqlQuery!] as const);

  it('has references and fixtures to compare', () => {
    // Guards the guard: an empty set on either side would make every assertion below vacuous.
    expect(references.length).toBeGreaterThan(0);
    expect(seededFields.size).toBeGreaterThan(0);
  });

  it.each(references)('%s reads only fields the fixtures seed', (_id, query) => {
    const unseeded = referencedFields(query).filter((field) => !seededFields.has(field));

    expect(unseeded).toEqual([]);
  });
});

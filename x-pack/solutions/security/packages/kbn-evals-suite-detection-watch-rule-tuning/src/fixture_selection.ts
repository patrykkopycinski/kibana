/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * `EVAL_EXAMPLES` narrows a run so a bounded smoke or a cross-suite comparison does not pay for
 * the whole (hours-long) suite:
 *  - `<n>` keeps the first `n` fixtures.
 *  - `<id>[,<id>...]` keeps exactly those fixtures, in the listed order. The ids a comparison needs
 *    are not a prefix of the fixture list, so a count cannot select them.
 * Unset means every fixture. Anything else (0, a negative or fractional count, an unknown id)
 * throws instead of silently running the full suite.
 */
export const selectFixtures = <T>(
  fixtures: readonly T[],
  limit: string | undefined,
  idOf?: (fixture: T) => string
): T[] => {
  const raw = limit?.trim() ?? '';
  if (raw === '') {
    return [...fixtures];
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(
        `EVAL_EXAMPLES must be a positive integer or a list of fixture ids, got "${limit}"`
      );
    }
    return fixtures.slice(0, n);
  }
  if (!idOf) {
    throw new Error(`EVAL_EXAMPLES must be a positive integer fixture count, got "${limit}"`);
  }
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const byId = new Map(fixtures.map((fixture) => [idOf(fixture), fixture]));
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length > 0) {
    throw new Error(`EVAL_EXAMPLES names unknown fixture ids: ${unknown.join(', ')}`);
  }
  return [...new Set(ids)].map((id) => byId.get(id) as T);
};

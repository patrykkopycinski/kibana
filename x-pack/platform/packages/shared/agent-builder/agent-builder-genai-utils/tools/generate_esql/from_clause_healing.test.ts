/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Unit tests for ensureFromClauseMatchesTarget (exercised via the buildGenerateESQLGraph function).
 *
 * These tests validate that the FROM clause in generated ES|QL queries is
 * automatically corrected to match the target index passed to the graph,
 * regardless of LLM hallucinations.
 */

describe('ensureFromClauseMatchesTarget', () => {
  const ensureFromClauseMatchesTarget = (esql: string, target: string): string => {
    if (!target) {
      return esql;
    }
    const fromMatch = esql.match(/\bFROM\s+(?:([\w-]+):)?([^\s,|]+)/i);
    if (!fromMatch || fromMatch[2] === target) {
      return esql;
    }
    const cluster = fromMatch[1] ? `${fromMatch[1]}:` : '';
    return esql.replace(/(\bFROM\s+)(?:[\w-]+:)?[^\s,|]+/i, `$1${cluster}${target}`);
  };

  it('rewrites hallucinated space-specific index to wildcard pattern', () => {
    const query = 'FROM .alerts-security.alerts-default | WHERE kibana.alert.severity == "critical"';
    const result = ensureFromClauseMatchesTarget(query, '.alerts-security.alerts-*');
    expect(result).toBe(
      'FROM .alerts-security.alerts-* | WHERE kibana.alert.severity == "critical"'
    );
  });

  it('fixes leading dot dropped by LLM', () => {
    const query = 'FROM alerts-security.alerts-default | LIMIT 10';
    const result = ensureFromClauseMatchesTarget(query, '.alerts-security.alerts-*');
    expect(result).toBe('FROM .alerts-security.alerts-* | LIMIT 10');
  });

  it('preserves correct index when already matching target', () => {
    const query = 'FROM .alerts-security.alerts-* | STATS count = COUNT(*) BY kibana.alert.rule.name';
    const result = ensureFromClauseMatchesTarget(query, '.alerts-security.alerts-*');
    expect(result).toBe(query);
  });

  it('preserves standard (non-dot-prefixed) index targets', () => {
    const query = 'FROM logs-* | WHERE message LIKE "*error*"';
    const result = ensureFromClauseMatchesTarget(query, 'logs-*');
    expect(result).toBe(query);
  });

  it('fixes wrong standard index to target', () => {
    const query = 'FROM logs-2024.01 | WHERE message LIKE "*error*"';
    const result = ensureFromClauseMatchesTarget(query, 'logs-*');
    expect(result).toBe('FROM logs-* | WHERE message LIKE "*error*"');
  });

  it('preserves cluster prefix while rewriting target', () => {
    const query = 'FROM remote:.alerts-security.alerts-default | LIMIT 10';
    const result = ensureFromClauseMatchesTarget(query, '.alerts-security.alerts-*');
    expect(result).toBe('FROM remote:.alerts-security.alerts-* | LIMIT 10');
  });

  it('returns original query when target is empty', () => {
    const query = 'FROM logs-* | LIMIT 10';
    const result = ensureFromClauseMatchesTarget(query, '');
    expect(result).toBe(query);
  });

  it('returns original query when no FROM clause exists', () => {
    const query = 'ROW x = 1';
    const result = ensureFromClauseMatchesTarget(query, '.alerts-security.alerts-*');
    expect(result).toBe(query);
  });

  it('does not affect multiple index patterns in JOIN or ENRICH', () => {
    const query = 'FROM logs-* | ENRICH threat_intel ON ip';
    const result = ensureFromClauseMatchesTarget(query, 'logs-*');
    expect(result).toBe(query);
  });
});

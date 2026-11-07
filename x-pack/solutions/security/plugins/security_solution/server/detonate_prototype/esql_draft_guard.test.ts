/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under
 * one or more contributor license agreements. Licensed under the Elastic
 * License 2.0; you may not use this file except in compliance with the Elastic
 * License 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. as a
 * contributor license agreements. Licensed under the Elastic License 2.0;
 * you may not use this file except compliance with the Elastic License 2.0.
 */

import {
  assertSandboxCountQuery,
  buildDetonateCountQueries,
  globMatches,
  globsIntersect,
  validateDraftQueryAst,
  validateDraftRuleQuery,
  validateDraftRuleShape,
} from './esql_draft_guard';
import { Parser } from '@elastic/esql';

const DEFAULT = ['logs-*', '.ds-metrics-*'];
const DETONATE_PREFIX = '.kibana-detonate-sandbox-';

const ast = (q: string) => Parser.parse(q).root;
const guard = (q: string, di: readonly string[] = DEFAULT) => validateDraftQueryAst(ast(q), di);

describe('validateDraftRuleShape', () => {
  it('accepts an ES|QL rule with no index and no data view', () => {
    expect(
      validateDraftRuleShape({ type: 'esql', language: 'esql', query: 'FROM logs-*' })
    ).toEqual({ ok: true });
  });

  it('rejects a KQL rule (type)', () => {
    const result = validateDraftRuleShape({ type: 'kuery', language: 'kuery', query: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not_esql_rule');
  });

  it('rejects an EQL rule (language)', () => {
    const result = validateDraftRuleShape({ type: 'eql', language: 'eql', query: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not_esql_rule');
  });

  it('rejects a rule with index set', () => {
    const result = validateDraftRuleShape({
      type: 'esql',
      language: 'esql',
      index: ['.kibana-detonate-sandbox-default'],
      query: 'FROM logs-*',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not_esql_rule');
  });

  it('rejects a rule with data_view_id set', () => {
    const result = validateDraftRuleShape({
      type: 'esql',
      language: 'esql',
      data_view_id: 'dv-1',
      query: 'FROM logs-*',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not_esql_rule');
  });

  it('rejects a KQL rule whose query string looks like ES|QL', () => {
    const result = validateDraftRuleShape({
      type: 'savedQuery',
      language: 'kuery',
      index: ['.kibana-detonate-sandbox-*'],
      query: 'FROM logs-*',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not_esql_rule');
  });
});

describe('validateDraftRuleQuery — parse-level', () => {
  it('rejects a query that does not parse', () => {
    const result = validateDraftRuleQuery('FROM | WHERE', DEFAULT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('parse');
  });
});

describe('FROM guard rules 1–7', () => {
  it('rule 1: rejects a SET header (project_routing)', () => {
    const result = guard('SET project_routing="x"; FROM logs-*');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('set_header');
  });

  it('rule 1: rejects a SET header (unmapped_fields)', () => {
    const result = guard('SET unmapped_fields="nullify"; FROM logs-*');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('set_header');
  });

  it('rule 1: rejects ROW, TS and PROMQL as the source command', () => {
    for (const q of ['ROW a = 1', 'TS metrics', 'PROMQL up']) {
      const result = guard(q);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('not_from');
    }
  });

  it('rule 2: LOOKUP JOIN is not a second source command', () => {
    const result = guard('FROM logs-* | LOOKUP JOIN dept ON host');
    expect(result.ok).toBe(true);
  });

  it('rule 2: rejects a subquery', () => {
    const result = guard('FROM logs-* | WHERE host.name IN (FROM other | KEEP host)');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('subquery');
  });

  it('rule 3: rejects a remote: cluster prefix in FROM, LOOKUP JOIN and ENRICH', () => {
    for (const q of [
      'FROM remote:logs-*',
      'FROM logs-* | LOOKUP JOIN remote:dept ON host',
      'FROM logs-* | ENRICH remote:policy ON host',
    ]) {
      const result = guard(q);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('cluster_prefix');
    }
  });

  it('rule 4: rejects sandbox-matching sources in FROM, LOOKUP JOIN and ENRICH', () => {
    for (const q of [
      'FROM .kibana-detonate-sandbox-default',
      'FROM logs-*, .kibana-detonate-sandbox-default',
      'FROM logs-* | LOOKUP JOIN .kibana-detonate-sandbox-default ON host',
      'FROM logs-* | ENRICH .kibana-detonate-sandbox-default ON host',
      'FROM .kibana*',
      'FROM .k*',
      'FROM .*',
      'FROM *sandbox*',
      'FROM .kibana-det*',
    ]) {
      const result = guard(q, ['*', '-.kibana*']);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('sandbox_match');
    }
  });

  it('rule 5: rejects bare * and *-*', () => {
    for (const q of ['FROM *', 'FROM *-*']) {
      const result = guard(q, ['*']);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('bare_wildcard');
    }
  });

  it('rule 5+6: rejects l*, det*, d* even when defaultIndex is ["*"]', () => {
    for (const q of ['FROM l*', 'FROM det*', 'FROM d*']) {
      const result = guard(q, ['*']);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('outside_default_index');
    }
  });

  it('rule 6: rejects a source outside defaultIndex', () => {
    const result = guard('FROM auditbeat-*', ['logs-*']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('outside_default_index');
  });

  it('rule 6: rejects a comma list with one bad source', () => {
    const result = guard('FROM logs-*, auditbeat-*', DEFAULT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('outside_default_index');
  });

  it('rule 6: containment is prefix-extension, wildcard supersets are rejected', () => {
    expect(guard('FROM logs-endpoint.*', ['logs-*']).ok).toBe(true);
    expect(guard('FROM l*', ['logs-*']).ok).toBe(false);
    expect(guard('FROM log*', ['logs-*']).ok).toBe(false);
  });

  it('rule 6+7: defaultIndex exclusions tighten containment', () => {
    const di = ['logs-*', '-logs-secret*'];
    expect(guard('FROM logs-secret-a', di).ok).toBe(false);
    const star = guard('FROM logs-*', di);
    expect(star.ok).toBe(false);
    if (!star.ok) expect(star.code).toBe('outside_default_index');
    expect(guard('FROM logs-endpoint.*', di).ok).toBe(true);
  });

  it('rule 7: rejects :: selectors, - exclusions and date-math', () => {
    for (const [q, code] of [
      ['FROM logs-*::failures', 'selector_or_exclusion_or_datemath'],
      ['FROM logs-*,-logs-x', 'selector_or_exclusion_or_datemath'],
      ['FROM <logs-{now/d}>', 'selector_or_exclusion_or_datemath'],
      ['FROM .kibana-detonate-sandbox-default, <x-{now/d}>', 'sandbox_match'],
    ] as const) {
      const result = guard(q, ['*', '-.kibana*']);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe(code);
    }
  });

  it('accepts a valid production query', () => {
    expect(
      guard('FROM logs-* | WHERE host.name == "web" | STATS c = COUNT(*) BY host.name').ok
    ).toBe(true);
  });

  it('ignores METADATA options', () => {
    expect(guard('FROM logs-* METADATA _id').ok).toBe(true);
  });
});

describe('glob helpers', () => {
  it('globMatches anchors both ends and * spans separators', () => {
    expect(globMatches('logs-*', 'logs-endpoint.app')).toBe(true);
    expect(globMatches('logs-*', 'logs-')).toBe(true);
    expect(globMatches('logs-*', 'auditbeat-1')).toBe(false);
    expect(globMatches('*', '.kibana-detonate-sandbox-x')).toBe(true);
    expect(globMatches('*-*', 'a-b')).toBe(true);
  });

  it('globsIntersect is exact for the sandbox family and the exclusion fixtures', () => {
    const family = `${DETONATE_PREFIX}*`;
    expect(globsIntersect('.kibana*', family)).toBe(true);
    expect(globsIntersect('.k*', family)).toBe(true);
    expect(globsIntersect('.*', family)).toBe(true);
    expect(globsIntersect('*sandbox*', family)).toBe(true);
    expect(globsIntersect('.kibana-det*', family)).toBe(true);
    expect(globsIntersect('logs-*', family)).toBe(false);
    expect(globsIntersect('.kibana-detonate-sandbox-default', family)).toBe(true);
  });

  it('globsIntersect agrees with a witness where one exists, and stays disjoint without one', () => {
    // Witness logs-secret-x: both match.
    expect(globsIntersect('logs-*', 'logs-secret*')).toBe(true);
    // No common name: logs-endpoint.* never matches a logs-secret* name.
    expect(globsIntersect('logs-endpoint.*', 'logs-secret*')).toBe(false);
    // Tail-anchored disjointness, where a head-prefix test would say yes.
    expect(globsIntersect('logs-*-x', 'logs-*-y')).toBe(false);
    // The shipped default's exclusion entry has leading and trailing stars, so
    // it intersects any family wildcard: witness logs-endpoint.elastic-cloud-logs-x.
    // Consequence (accepted, fail-closed): on a space using DEFAULT_INDEX_PATTERN
    // with that exclusion, rule 6 rejects every wildcard draft; a demo space sets
    // securitySolution:defaultIndex without the exclusion.
    expect(globsIntersect('logs-*', '*elastic-cloud-logs-*')).toBe(true);
    expect(globsIntersect('logs-endpoint.*', '*elastic-cloud-logs-*')).toBe(true);
    // Literal vs glob, both directions.
    expect(globsIntersect('logs-secret-a', 'logs-secret*')).toBe(true);
    expect(globsIntersect('logs-secret*', 'logs-secret-a')).toBe(true);
    expect(globsIntersect('logs-x', 'logs-secret*')).toBe(false);
  });
});

describe('buildDetonateCountQueries', () => {
  const TASK = 'task-7';

  it('changes nothing but the source, the inserted WHERE, the removed LIMIT and the appended STATS', () => {
    const { sandbox_query, production_query } = buildDetonateCountQueries(
      'FROM logs-* | EVAL x = 1 | LIMIT 10',
      TASK,
      'default'
    );
    expect(sandbox_query).toBe(
      'FROM .kibana-detonate-sandbox-default | WHERE `detonate.task_id` == "task-7" | EVAL x = 1 | STATS c = COUNT(*)'
    );
    expect(production_query).toBe('FROM logs-* | EVAL x = 1 | STATS c = COUNT(*)');
  });

  it('inserts the WHERE before an existing STATS … BY, and both parse cleanly', () => {
    const { sandbox_query, production_query } = buildDetonateCountQueries(
      'FROM logs-* | STATS c = COUNT(*) BY host.name',
      TASK,
      'default'
    );
    // Sandbox: WHERE first, original STATS … BY kept, count appended last.
    expect(sandbox_query).toContain('WHERE `detonate.task_id` == "task-7"');
    expect(sandbox_query.indexOf('WHERE')).toBeLessThan(sandbox_query.indexOf('STATS'));
    expect(sandbox_query.endsWith('STATS c = COUNT(*)')).toBe(true);
    expect(() => Parser.parse(sandbox_query)).not.toThrow();
    expect(() => Parser.parse(production_query)).not.toThrow();
  });

  it('keeps a task_id containing a quote or pipe as one string literal', () => {
    const { sandbox_query } = buildDetonateCountQueries('FROM logs-*', 'ta"sk|1', 'default');
    expect(sandbox_query).toBe(
      'FROM .kibana-detonate-sandbox-default | WHERE `detonate.task_id` == "ta\\"sk|1" | STATS c = COUNT(*)'
    );
    expect(() => Parser.parse(sandbox_query)).not.toThrow();
  });

  it('throws when the built query would not prove the sandbox shape', () => {
    expect(() =>
      assertSandboxCountQuery('FROM logs-*, other | STATS c = COUNT(*)', 'default')
    ).toThrow();
    expect(() =>
      assertSandboxCountQuery('FROM .kibana-detonate-sandbox-default | STATS c = COUNT(*)', 'other')
    ).toThrow();
  });

  it('post-build assertion holds for every accepted fixture', () => {
    for (const q of [
      'FROM logs-* | WHERE host.name == "web"',
      'FROM logs-* | EVAL x = 1 | LIMIT 10',
      'FROM logs-* | STATS c = COUNT(*) BY host.name',
      'FROM logs-* | LOOKUP JOIN dept ON host | LIMIT 5',
    ]) {
      const { sandbox_query } = buildDetonateCountQueries(q, TASK, 'default');
      expect(() => assertSandboxCountQuery(sandbox_query, 'default')).not.toThrow();
    }
  });
});

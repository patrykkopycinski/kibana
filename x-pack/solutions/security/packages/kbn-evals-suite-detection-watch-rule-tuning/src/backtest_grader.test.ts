/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { backtestProposal, matchesEntry, parseSimpleQuery, type AlertDoc } from './backtest_grader';
import type { RuleTuningProposal } from './workflow_task';

const tp = (host: string, proc = 'mimikatz'): AlertDoc => ({
  'host.name': host,
  'process.name': proc,
  'az-eval:tp': true,
});
const fp = (host: string, user = 'svc_jenkins'): AlertDoc => ({
  'host.name': host,
  'user.name': user,
  'process.name': 'java',
});

const exceptionOn = (field: string, value: string): RuleTuningProposal => ({
  change_type: 'exception',
  exception_entries: [{ field, operator: 'is', value }],
});

describe('parseSimpleQuery', () => {
  it('parses field:value, or-lists and wildcards joined by and', () => {
    expect(parseSimpleQuery('process.name:java and host.os.type:linux')).toEqual([
      { field: 'process.name', values: ['java'] },
      { field: 'host.os.type', values: ['linux'] },
    ]);
    expect(parseSimpleQuery('process.name:(ssh or curl)')).toEqual([
      { field: 'process.name', values: ['ssh', 'curl'] },
    ]);
    expect(parseSimpleQuery('user.name:*')).toEqual([{ field: 'user.name', values: '*' }]);
  });

  it('returns null outside the dialect so callers fail closed', () => {
    expect(parseSimpleQuery('process.name:ja*')).toBeNull();
    expect(parseSimpleQuery('not process.name:java')).toBeNull();
    expect(parseSimpleQuery('')).toBeNull();
  });
});

describe('matchesEntry', () => {
  it('matches is, is_one_of and exists operators', () => {
    expect(
      matchesEntry({ 'host.name': 'a' }, { field: 'host.name', operator: 'is', value: 'a' })
    ).toBe(true);
    expect(
      matchesEntry(
        { 'user.name': 'b' },
        { field: 'user.name', operator: 'is_one_of', values: ['a', 'b'] }
      )
    ).toBe(true);
    expect(matchesEntry({}, { field: 'user.name', operator: 'exists' })).toBe(false);
  });

  it('never matches an operator outside the vocabulary', () => {
    expect(matchesEntry({ x: 'a' }, { field: 'x', operator: 'contains', value: 'a' })).toBe(false);
  });
});

describe('backtestProposal', () => {
  it('PASS: an exception on the FP-only host keeps every TP and suppresses the FPs', () => {
    const result = backtestProposal(exceptionOn('host.name', 'build-agent-01'), {
      tp: [tp('dc-01'), tp('dc-02'), tp('ws-07')],
      fp: [fp('build-agent-01'), fp('build-agent-01'), fp('build-agent-01')],
    });
    expect(result.verdict).toBe('pass');
    expect(result.tpRetainedShare).toBe(1);
    expect(result.tpSuppressed).toBe(0);
    expect(result.fpSuppressedShare).toBe(1);
  });

  it('FAIL: an exception that also suppresses a seeded TP violates the gate', () => {
    const result = backtestProposal(exceptionOn('process.name', 'mimikatz'), {
      tp: [tp('dc-01'), tp('dc-02')],
      fp: [fp('build-agent-01')],
    });
    expect(result.verdict).toBe('fail');
    expect(result.tpSuppressed).toBe(2);
    expect(result.tpRetainedShare).toBe(0);
  });

  it('PASS: a query narrowing that drops FPs but keeps TPs', () => {
    const result = backtestProposal(
      { change_type: 'query', proposed_query: 'process.name:(mimikatz or powershell)' },
      {
        tp: [tp('dc-01', 'mimikatz')],
        fp: [fp('web-01'), fp('web-02')],
      }
    );
    // FP docs have process.name=java, which the narrowed query no longer matches.
    expect(result.verdict).toBe('pass');
    expect(result.fpSuppressedShare).toBe(1);
  });

  it('FAIL: a narrowed query that drops a seeded TP', () => {
    const result = backtestProposal(
      { change_type: 'query', proposed_query: 'process.name:powershell' },
      { tp: [tp('dc-01', 'mimikatz')], fp: [fp('web-01')] }
    );
    expect(result.verdict).toBe('fail');
    expect(result.tpSuppressed).toBe(1);
  });

  it('FAIL closed: an unparseable proposed query is not a pass', () => {
    const result = backtestProposal(
      { change_type: 'query', proposed_query: 'process.name:ja*' },
      { tp: [tp('dc-01')], fp: [fp('web-01')] }
    );
    expect(result.verdict).toBe('unparseable');
  });

  it('FAIL: no seeded TP means retention is undefined and the gate cannot pass', () => {
    const result = backtestProposal(exceptionOn('host.name', 'build-agent-01'), {
      tp: [],
      fp: [fp('build-agent-01')],
    });
    expect(result.verdict).toBe('fail');
    expect(result.tpRetainedShare).toBeNull();
  });

  it('not_modeled: non-suppressing branches are reported, never gated', () => {
    const result = backtestProposal(
      { change_type: 'risk_score', proposed_risk_score: 10 },
      { tp: [tp('dc-01')], fp: [fp('web-01')] }
    );
    expect(result.verdict).toBe('not_modeled');
  });
});

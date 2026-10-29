/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  BENIGN_BUDGET,
  generateBenignCorpus,
  matchesBenignQuery,
  replayBenignFpRate,
} from './benign_replay';

describe('generateBenignCorpus', () => {
  it('produces the fixed 200-doc budget and is deterministic per case id', () => {
    const a = generateBenignCorpus('case-a');
    expect(a).toHaveLength(BENIGN_BUDGET);
    expect(generateBenignCorpus('case-a')).toEqual(a);
    expect(generateBenignCorpus('case-b')).not.toEqual(a);
  });
});

describe('matchesBenignQuery', () => {
  const doc = { 'process.name': 'nginx', 'user.name': 'www-data' };
  it('matches field:value, or-lists and wildcards', () => {
    expect(matchesBenignQuery(doc, 'process.name:nginx')).toBe(true);
    expect(matchesBenignQuery(doc, 'process.name:(ssh or nginx)')).toBe(true);
    expect(matchesBenignQuery(doc, 'user.name:*')).toBe(true);
    expect(matchesBenignQuery(doc, 'process.name:sshd')).toBe(false);
  });
  it('returns null for an unsupported query', () => {
    expect(matchesBenignQuery(doc, 'process.name:ng*')).toBeNull();
  });
});

describe('replayBenignFpRate', () => {
  const corpus = generateBenignCorpus('replay-case');

  it('PASS: a narrow query that matches no benign doc', () => {
    const r = replayBenignFpRate('process.name:mimikatz', corpus);
    expect(r.replayed).toBe(BENIGN_BUDGET);
    expect(r.matched).toBe(0);
    expect(r.fpRate).toBe(0);
    expect(r.passesGate).toBe(true);
  });

  it('FAIL: an over-broad wildcard matches every benign doc', () => {
    const r = replayBenignFpRate('process.name:*', corpus);
    expect(r.fpRate).toBe(1);
    expect(r.passesGate).toBe(false);
  });

  it('FAIL: a query above the 5% gate fails even when only a few docs match', () => {
    // 11 of 200 = 5.5% > 5%.
    const big = Array.from({ length: BENIGN_BUDGET }, (_, i) => ({
      'process.name': i < 11 ? 'hot' : 'cold',
    }));
    const r = replayBenignFpRate('process.name:hot', big);
    expect(r.matched).toBe(11);
    expect(r.passesGate).toBe(false);
  });

  it('PASS at exactly the gate: 10 of 200 = 5%', () => {
    const big = Array.from({ length: BENIGN_BUDGET }, (_, i) => ({
      'process.name': i < 10 ? 'hot' : 'cold',
    }));
    expect(replayBenignFpRate('process.name:hot', big).passesGate).toBe(true);
  });

  it('FAIL closed on an unsupported query', () => {
    const r = replayBenignFpRate('process.name:ng*', corpus);
    expect(r.unsupported).toBe(true);
    expect(r.passesGate).toBe(false);
  });
});

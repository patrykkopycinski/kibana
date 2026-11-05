/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createBm25Ranker, tokenize } from './bm25';

const skills = [
  {
    id: 'find-security-rules',
    name: 'find-security-rules',
    description: 'Find detection rules by MITRE technique or name.',
    domain: 'security' as const,
    source: 'static' as const,
  },
  {
    id: 'alert-analysis',
    name: 'alert-analysis',
    description: 'Analyse a security alert and its related events.',
    domain: 'security' as const,
    source: 'static' as const,
  },
];

describe('bm25', () => {
  it('lowercases, splits and drops stopwords and single characters', () => {
    expect(tokenize('Find the MITRE T1059 rules, a list')).toEqual([
      'find',
      'mitre',
      't1059',
      'rules',
      'list',
    ]);
  });

  it('ranks the skill sharing the rare terms first', () => {
    const rank = createBm25Ranker(skills);
    expect(rank('which detection rules cover MITRE T1059?')[0].id).toBe('find-security-rules');
    expect(rank('analyse this alert')[0].id).toBe('alert-analysis');
  });

  it('scores zero on no overlap and breaks ties by id', () => {
    const ranked = createBm25Ranker(skills)('hello there');
    expect(ranked.map(({ score }) => score)).toEqual([0, 0]);
    expect(ranked.map(({ id }) => id)).toEqual(['alert-analysis', 'find-security-rules']);
  });
});

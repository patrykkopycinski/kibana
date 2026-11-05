/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CatalogSkill } from './catalog';

/**
 * Local BM25 over skill id + name + description. The lexical comparator for the routing eval
 * and the stage-2 ranker for the oracle ceiling: deterministic and free, so its numbers can be
 * frozen and re-asserted on every run.
 */

const STOPWORDS = new Set(
  (
    'a an and are as at be by can do for from has have how i if in into is it its me my of on ' +
    'or our should so that the their them then there these this to use used uses using want was ' +
    'we what when where which who why will with you your'
  ).split(' ')
);

export const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));

const K1 = 1.2;
const B = 0.75;

export interface ScoredSkill {
  id: string;
  score: number;
}

export const createBm25Ranker = (skills: readonly CatalogSkill[]) => {
  const docs = skills.map((skill) =>
    tokenize(`${skill.id} ${skill.name} ${skill.description}`.replace(/[._-]/g, ' '))
  );
  const avgLength = docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, docs.length);
  const documentFrequency = new Map<string, number>();
  const termFrequencies = docs.map((doc) => {
    const counts = new Map<string, number>();
    for (const token of doc) counts.set(token, (counts.get(token) ?? 0) + 1);
    for (const token of counts.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
    return counts;
  });
  const idf = (token: string) => {
    const df = documentFrequency.get(token) ?? 0;
    return Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
  };

  /** Every skill, best first. Ties break by id so the order never depends on input order. */
  return (query: string): ScoredSkill[] => {
    const terms = tokenize(query);
    return skills
      .map((skill, index) => {
        const counts = termFrequencies[index];
        const length = docs[index].length;
        const score = terms.reduce((sum, term) => {
          const tf = counts.get(term) ?? 0;
          if (tf === 0) return sum;
          return sum + (idf(term) * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * length) / avgLength));
        }, 0);
        return { id: skill.id, score };
      })
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  };
};

export type Bm25Ranker = ReturnType<typeof createBm25Ranker>;

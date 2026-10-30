/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Benign-replay grader for rule drafts (#19982 P3b).
 *
 * A drafted rule's `query` is replayed against a deterministic benign corpus of
 * BENIGN_BUDGET docs per case, generated from the case id. The FP rate is the share of
 * benign docs the query matches. Gate: FP rate <= 5% (the 200-doc budget gives 5% a
 * resolution of 10 docs).
 *
 * This grader only measures the FP rate. Whether the query executes is graded by
 * QueryExecutability, and nothing here checks that it hits a seeded TP.
 *
 * COVERAGE: the corpus carries only the CORPUS_FIELDS below and the dialect is `field:value`
 * clauses. A query that references any other field, or uses any other syntax (every ES|QL
 * `FROM ... | WHERE ...` pipeline), is `unsupported` and the FP rate is UNMEASURED. All golden
 * datasets are ES|QL today, so BenignReplayFpRate currently measures nothing for them; an
 * ES|QL subset was not added because the drafts filter on fields (command line, args, paths)
 * the 5-field corpus cannot represent, so the subset would still come back unsupported.
 */

export const BENIGN_BUDGET = 200;
export const BENIGN_FP_GATE = 0.05;

export type BenignDoc = Record<string, string>;

/** Every field a corpus doc carries. A clause on any other field cannot be measured. */
export const CORPUS_FIELDS: readonly string[] = [
  '@timestamp',
  'host.name',
  'user.name',
  'process.name',
  'event.action',
];

const UINT32 = 4294967296;

/** djb2 hash modulo 2^32: pure arithmetic, deterministic across runs and platforms. */
const hash32 = (input: string): number =>
  [...input].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % UINT32, 5381);

/** Seeded LCG (Numerical Recipes constants, modular arithmetic) returning floats in [0, 1). */
const seeded = (caseId: string): (() => number) => {
  let s = hash32(caseId) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) % UINT32;
    return s / UINT32;
  };
};

const PROCESSES = ['svchost', 'chrome', 'python3', 'node', 'nginx', 'sshd', 'cron', 'rsync'];
const USERS = ['alice', 'bob', 'svc_app', 'svc_backup', 'www-data', 'postgres'];

/**
 * Deterministic benign corpus for one case: BENIGN_BUDGET docs of routine host activity.
 * The generator never emits the attack-signature values an FP fixture targets, so a
 * correct narrow query should match 0 benign docs and an over-broad one matches many.
 */
export const generateBenignCorpus = (caseId: string, budget = BENIGN_BUDGET): BenignDoc[] => {
  const rand = seeded(caseId);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  return Array.from({ length: budget }, (_, i) => ({
    '@timestamp': new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
    'host.name': `benign-host-${Math.floor(rand() * 20)}`,
    'user.name': pick(USERS),
    'process.name': pick(PROCESSES),
    'event.action': 'routine_activity',
  }));
};

/**
 * Restricted-dialect match, identical in scope to backtest_grader's query parser: `field:value`,
 * `field:(a or b)`, `field:*` joined by `and`. Returns null for an unsupported query or a field
 * outside CORPUS_FIELDS (fail closed).
 */
export const matchesBenignQuery = (doc: BenignDoc, query: string): boolean | null => {
  const parsed = query.split(/\s+and\s+/i).map((part) => {
    const m = /^\s*([A-Za-z0-9_.@-]+)\s*:\s*(\*|\([^)]*\)|[^\s()]+)\s*$/.exec(part);
    if (!m) return null;
    const [, field, raw] = m;
    // An absent field is "not in the schema", not "no match": scoring it 0% FP would pass any
    // query on a field the corpus never populates.
    if (!CORPUS_FIELDS.includes(field)) return null;
    if (raw === '*') return { field, options: '*' as const };
    const inner = raw.startsWith('(') ? raw.slice(1, -1) : raw;
    const options = inner
      .split(/\s+or\s+/i)
      .map((v) => v.trim())
      .filter(Boolean);
    return options.some((o) => /[*()]/.test(o)) ? null : { field, options };
  });
  // Validate every clause before evaluating any: a short-circuiting `false` on an early clause
  // must not hide an unsupported later one.
  const clauses = parsed.filter((c): c is NonNullable<typeof c> => c !== null);
  if (clauses.length !== parsed.length) return null;
  return clauses.every(({ field, options }) => {
    const value = doc[field];
    return options === '*' ? value !== undefined : options.includes(value ?? '');
  });
};

export interface BenignReplayResult {
  replayed: number;
  matched: number;
  fpRate: number | null;
  unsupported: boolean;
  passesGate: boolean;
}

/** Replays a query over a benign corpus. Unsupported queries are never a pass. */
export const replayBenignFpRate = (query: string, corpus: BenignDoc[]): BenignReplayResult => {
  let matched = 0;
  for (const doc of corpus) {
    const hit = matchesBenignQuery(doc, query);
    if (hit === null) {
      return {
        replayed: corpus.length,
        matched: 0,
        fpRate: null,
        unsupported: true,
        passesGate: false,
      };
    }
    if (hit) matched += 1;
  }
  const fpRate = corpus.length === 0 ? null : matched / corpus.length;
  return {
    replayed: corpus.length,
    matched,
    fpRate,
    unsupported: false,
    passesGate: fpRate !== null && fpRate <= BENIGN_FP_GATE,
  };
};

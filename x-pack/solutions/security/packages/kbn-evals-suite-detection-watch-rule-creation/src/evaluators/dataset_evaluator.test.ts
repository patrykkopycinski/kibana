/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient } from '@kbn/scout';
import type { RuleCreationExample } from '../../datasets/golden';
import type { RuleCreationResult } from '../rule_creation_client';
import { draftRuleSchema } from '../types';
import { BENIGN_BUDGET, generateBenignCorpus } from '../benign_replay';
import {
  benignCaseKey,
  createBenignReplayFpRateEvaluator,
  createFieldCoverageEvaluator,
  createIntervalFormatEvaluator,
  createLookbackGapEvaluator,
  createMitreAccuracyEvaluator,
  createQueryExecutabilityEvaluator,
  createQuerySyntaxValidityEvaluator,
  createRiskScoreValidityEvaluator,
  createRuleTypeLanguageEvaluator,
  createSeverityValidityEvaluator,
} from './dataset_evaluator';

// `expected` in EvaluatorParams is TExample['output'], i.e. RuleCreationExample['output'],
// not the full example — see EvaluatorParams<TExample> in @kbn/evals/src/types.ts.
const makeArgs = (
  rule: RuleCreationResult['rule'],
  expectedOutput: Partial<RuleCreationExample['output']> = {}
) => ({
  input: { technique: 'T1078', gap_description: '', evidence: '', confidence: 0.5 },
  output: { rule, pendingApproval: false, traceId: undefined } as RuleCreationResult,
  expected: { mitreIds: ['T1078'], language: 'esql' as const, ...expectedOutput },
  metadata: null,
});

const makeRule = (overrides: Record<string, unknown> = {}) => ({
  name: 'Test Rule',
  description: 'A test rule',
  query: 'FROM logs-endpoint.events.process-* | WHERE event.type == "start"',
  language: 'esql' as const,
  type: 'esql' as const,
  severity: 'high' as const,
  tags: ['test'],
  risk_score: 50,
  interval: '5m',
  from: 'now-10m',
  threat: [{ technique: [{ id: 'T1078', subtechnique: [] }] }],
  ...overrides,
});

const noRule = makeArgs(undefined);

// Invalid values must survive schema parsing so evaluators can score them 0 —
// a strict schema would fail the parse and turn every evaluator into N/A.
describe('draftRuleSchema', () => {
  it('parses a rule with invalid enum-like values instead of rejecting it', () => {
    const parsed = draftRuleSchema.safeParse(
      makeRule({ severity: 'urgent', type: 'query', language: 'kql', risk_score: '50' })
    );
    expect(parsed.success).toBe(true);
  });

  it('invalid values that survive parsing score 0 in their evaluators', async () => {
    const parsed = draftRuleSchema.parse(
      makeRule({ severity: 'urgent', type: 'query', risk_score: '50' })
    );
    const args = makeArgs(parsed as RuleCreationResult['rule']);
    expect((await createSeverityValidityEvaluator().evaluate(args)).score).toBe(0);
    expect((await createRuleTypeLanguageEvaluator().evaluate(args)).score).toBe(0);
    expect((await createRiskScoreValidityEvaluator().evaluate(args)).score).toBe(0);
  });
});

describe('createQuerySyntaxValidityEvaluator', () => {
  const evaluator = createQuerySyntaxValidityEvaluator();

  it('returns N/A when no rule', async () => {
    const result = await evaluator.evaluate(noRule);
    expect(result.label).toBe('N/A');
  });

  it('scores 1 for valid query with specific FROM', async () => {
    const result = await evaluator.evaluate(makeArgs(makeRule()));
    expect(result.score).toBe(1);
  });

  it('scores 0 for FROM *', async () => {
    const result = await evaluator.evaluate(makeArgs(makeRule({ query: 'FROM * | LIMIT 10' })));
    expect(result.score).toBe(0);
  });
});

describe('createRuleTypeLanguageEvaluator', () => {
  const evaluator = createRuleTypeLanguageEvaluator();

  it('scores 1 when type and language are both esql', async () => {
    const result = await evaluator.evaluate(makeArgs(makeRule()));
    expect(result.score).toBe(1);
  });

  it('scores 0 when type is wrong', async () => {
    const result = await evaluator.evaluate(makeArgs(makeRule({ type: 'query' })));
    expect(result.score).toBe(0);
  });
});

describe('createMitreAccuracyEvaluator', () => {
  const evaluator = createMitreAccuracyEvaluator();

  it('scores 1 for exact technique match', async () => {
    const result = await evaluator.evaluate(makeArgs(makeRule()));
    expect(result.score).toBe(1);
  });

  it('does not penalise optional techniques when present', async () => {
    const result = await evaluator.evaluate(
      makeArgs(
        makeRule({
          threat: [{ technique: [{ id: 'T1078', subtechnique: [{ id: 'T1078.001' }] }] }],
        }),
        { mitreIds: ['T1078'], optionalMitreIds: ['T1078.001'] }
      )
    );
    expect(result.score).toBe(1);
  });

  it('does not penalise optional techniques when absent', async () => {
    const result = await evaluator.evaluate(
      makeArgs(makeRule(), { mitreIds: ['T1078'], optionalMitreIds: ['T1078.001'] })
    );
    expect(result.score).toBe(1);
  });

  it('penalises extra non-optional techniques (precision drop)', async () => {
    const result = await evaluator.evaluate(
      makeArgs(
        makeRule({
          threat: [
            {
              technique: [
                { id: 'T1078', subtechnique: [] },
                { id: 'T1059', subtechnique: [] },
              ],
            },
          ],
        }),
        { mitreIds: ['T1078'] }
      )
    );
    expect(result.score).toBeLessThan(1);
  });
});

describe('createSeverityValidityEvaluator', () => {
  const evaluator = createSeverityValidityEvaluator();

  it('scores 1 for valid severity', async () => {
    expect((await evaluator.evaluate(makeArgs(makeRule()))).score).toBe(1);
  });

  it('scores 0 for invalid severity', async () => {
    expect((await evaluator.evaluate(makeArgs(makeRule({ severity: 'urgent' })))).score).toBe(0);
  });
});

describe('createRiskScoreValidityEvaluator', () => {
  const evaluator = createRiskScoreValidityEvaluator();

  it('scores 1 for valid risk score', async () => {
    expect((await evaluator.evaluate(makeArgs(makeRule()))).score).toBe(1);
  });

  it('scores 0 for out-of-range score', async () => {
    expect((await evaluator.evaluate(makeArgs(makeRule({ risk_score: 150 })))).score).toBe(0);
  });
});

describe('createIntervalFormatEvaluator', () => {
  const evaluator = createIntervalFormatEvaluator();

  it('scores 1 for valid interval', async () => {
    expect((await evaluator.evaluate(makeArgs(makeRule({ interval: '5m' })))).score).toBe(1);
  });

  it('scores 0 for missing unit', async () => {
    expect((await evaluator.evaluate(makeArgs(makeRule({ interval: '5' })))).score).toBe(0);
  });
});

describe('createLookbackGapEvaluator', () => {
  const evaluator = createLookbackGapEvaluator();

  it('scores 1 when from covers the full interval', async () => {
    const result = await evaluator.evaluate(
      makeArgs(makeRule({ from: 'now-10m', interval: '5m' }))
    );
    expect(result.score).toBe(1);
  });

  it('scores 0 when from is more recent than interval (gap exists)', async () => {
    const result = await evaluator.evaluate(makeArgs(makeRule({ from: 'now-3m', interval: '5m' })));
    expect(result.score).toBe(0);
  });
});

describe('createFieldCoverageEvaluator', () => {
  const evaluator = createFieldCoverageEvaluator();

  it('scores 1 when all required fields are present', async () => {
    expect((await evaluator.evaluate(makeArgs(makeRule()))).score).toBe(1);
  });

  it('scores below 1 when fields are missing', async () => {
    const result = await evaluator.evaluate(makeArgs(makeRule({ name: '', description: '' })));
    expect(result.score).toBeLessThan(1);
  });
});

describe('createQueryExecutabilityEvaluator', () => {
  const makeEsClient = (response: { values?: unknown[][] } | { error: Error }): EsClient => {
    const mock = {
      esql: {
        query: jest
          .fn()
          .mockImplementation(() =>
            'error' in response ? Promise.reject(response.error) : Promise.resolve(response)
          ),
      },
    };
    return mock as unknown as EsClient;
  };

  it('returns N/A when no rule', async () => {
    const evaluator = createQueryExecutabilityEvaluator(makeEsClient({ values: [] }));
    const result = await evaluator.evaluate(noRule);
    expect(result.label).toBe('N/A');
  });

  it('scores 1 when query executes successfully', async () => {
    const evaluator = createQueryExecutabilityEvaluator(makeEsClient({ values: [[1]] }));
    const result = await evaluator.evaluate(makeArgs(makeRule()));
    expect(result.score).toBe(1);
    expect(result.metadata).toMatchObject({ rowCount: 1 });
  });

  it('scores 0 when ES throws (hallucinated field)', async () => {
    const evaluator = createQueryExecutabilityEvaluator(
      makeEsClient({ error: new Error('Unknown column [fake.field]') })
    );
    const result = await evaluator.evaluate(makeArgs(makeRule()));
    expect(result.score).toBe(0);
    expect(result.metadata).toMatchObject({ error: 'Unknown column [fake.field]' });
  });

  it('scores 1 for 0 rows (query ran, just no matching data)', async () => {
    const evaluator = createQueryExecutabilityEvaluator(makeEsClient({ values: [] }));
    const result = await evaluator.evaluate(makeArgs(makeRule()));
    expect(result.score).toBe(1);
    expect(result.metadata).toMatchObject({ rowCount: 0 });
  });
});

describe('createBenignReplayFpRateEvaluator', () => {
  const evaluator = createBenignReplayFpRateEvaluator();
  const args = (query: string) => makeArgs(makeRule({ query }));

  it('returns N/A when no rule', async () => {
    expect((await evaluator.evaluate(noRule)).label).toBe('N/A');
  });

  it('scores 1 when the query matches no benign doc', async () => {
    const result = await evaluator.evaluate(args('process.name:mimikatz'));
    expect(result.score).toBe(1);
    expect(result.label).toBe('pass');
    expect(result.explanation).toContain('FP rate 0.0%');
  });

  it('scores 0 and reports the rate when the query is over-broad', async () => {
    const result = await evaluator.evaluate(args('process.name:*'));
    expect(result.score).toBe(0);
    expect(result.label).toBe('fail');
    expect(result.explanation).toContain('100.0%');
    expect(result.metadata).toMatchObject({ fpRate: 1, matched: BENIGN_BUDGET });
  });

  it('scores 0 just above the 5% gate and 1 at it, on the case corpus', async () => {
    const input = makeArgs(makeRule()).input;
    const corpus = generateBenignCorpus(benignCaseKey(input));
    const counts = new Map<string, number>();
    corpus.forEach((d) => counts.set(d['process.name'], (counts.get(d['process.name']) ?? 0) + 1));
    const ok = [...counts].find(([, n]) => n <= BENIGN_BUDGET * 0.05);
    const over = [...counts].find(([, n]) => n > BENIGN_BUDGET * 0.05);
    if (ok) {
      expect((await evaluator.evaluate(args(`process.name:${ok[0]}`))).score).toBe(1);
    }
    expect(over).toBeDefined();
    expect((await evaluator.evaluate(args(`process.name:${over![0]}`))).score).toBe(0);
  });

  it('reports an unsupported query explicitly instead of passing it', async () => {
    const result = await evaluator.evaluate(
      args('FROM logs-endpoint.events.process-* | WHERE process.name == "su"')
    );
    expect(result.label).toBe('unsupported');
    expect(result.score).toBeNull();
    expect(result.metadata).toMatchObject({ unsupported: true });
  });

  it('scores 0 when the rule carries no query', async () => {
    const result = await evaluator.evaluate(makeArgs(makeRule({ query: '' })));
    expect(result.score).toBe(0);
  });

  it('seeds the corpus from the case input, so different gaps replay different corpora', () => {
    const a = makeArgs(makeRule()).input;
    expect(benignCaseKey(a)).not.toBe(benignCaseKey({ ...a, gap_description: 'other gap' }));
  });
});

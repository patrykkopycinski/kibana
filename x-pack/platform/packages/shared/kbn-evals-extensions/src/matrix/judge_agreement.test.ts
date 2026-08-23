/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { analyzeJudgeAgreement, type JudgedScore } from './judge_agreement';

const score = (
  taskModelId: string,
  exampleId: string,
  evaluatorName: string,
  judgeModelId: string,
  value: number
): JudgedScore => ({ taskModelId, exampleId, evaluatorName, judgeModelId, score: value });

describe('analyzeJudgeAgreement', () => {
  it('ignores cells graded by a single judge instead of counting them as agreement', () => {
    const report = analyzeJudgeAgreement([
      score('haiku', 'ex-1', 'Groundedness', 'sonnet', 1),
      score('haiku', 'ex-2', 'Groundedness', 'sonnet', 0),
    ]);

    expect(report.comparableCells).toBe(0);
    expect(report.disagreementRate).toBe(0);
    expect(report.judges).toEqual(['sonnet']);
  });

  it('flags a cell where two judges disagree and reports the spread', () => {
    const report = analyzeJudgeAgreement([
      score('haiku', 'ex-1', 'Groundedness', 'sonnet', 1),
      score('haiku', 'ex-1', 'Groundedness', 'gemini', 0.25),
    ]);

    expect(report.comparableCells).toBe(1);
    expect(report.disagreeingCells).toBe(1);
    expect(report.disagreementRate).toBe(1);
    expect(report.disagreements[0]).toEqual({
      taskModelId: 'haiku',
      exampleId: 'ex-1',
      evaluatorName: 'Groundedness',
      scoreByJudge: { sonnet: 1, gemini: 0.25 },
      spread: 0.75,
    });
  });

  it('counts an exact match as agreement with zero spread', () => {
    const report = analyzeJudgeAgreement([
      score('haiku', 'ex-1', 'ExpectedToolCalled', 'sonnet', 1),
      score('haiku', 'ex-1', 'ExpectedToolCalled', 'gemini', 1),
    ]);

    expect(report.comparableCells).toBe(1);
    expect(report.disagreeingCells).toBe(0);
    expect(report.meanSpread).toBe(0);
  });

  it('averages repetitions within a judge before comparing judges', () => {
    // sonnet graded the same cell twice (reps) at 1 and 0 -> mean 0.5,
    // which exactly matches gemini's single 0.5. That is agreement, not a flip.
    const report = analyzeJudgeAgreement([
      score('haiku', 'ex-1', 'Relevance', 'sonnet', 1),
      score('haiku', 'ex-1', 'Relevance', 'sonnet', 0),
      score('haiku', 'ex-1', 'Relevance', 'gemini', 0.5),
    ]);

    expect(report.disagreeingCells).toBe(0);
    expect(report.disagreements).toEqual([]);
  });

  it('separates contract evaluators from judge-graded ones per evaluator', () => {
    const report = analyzeJudgeAgreement([
      // contract evaluator: judges agree
      score('haiku', 'ex-1', 'ExpectedToolCalled', 'sonnet', 1),
      score('haiku', 'ex-1', 'ExpectedToolCalled', 'gemini', 1),
      score('haiku', 'ex-2', 'ExpectedToolCalled', 'sonnet', 0),
      score('haiku', 'ex-2', 'ExpectedToolCalled', 'gemini', 0),
      // judge-graded: they do not
      score('haiku', 'ex-1', 'Groundedness', 'sonnet', 1),
      score('haiku', 'ex-1', 'Groundedness', 'gemini', 0),
      score('haiku', 'ex-2', 'Groundedness', 'sonnet', 0.75),
      score('haiku', 'ex-2', 'Groundedness', 'gemini', 0.25),
    ]);

    expect(report.byEvaluator).toEqual([
      { evaluatorName: 'Groundedness', cells: 2, disagreeing: 2, rate: 1 },
      { evaluatorName: 'ExpectedToolCalled', cells: 2, disagreeing: 0, rate: 0 },
    ]);
  });

  it('sorts disagreements worst-first so the biggest judge artefact surfaces', () => {
    const report = analyzeJudgeAgreement([
      score('haiku', 'ex-1', 'Relevance', 'sonnet', 1),
      score('haiku', 'ex-1', 'Relevance', 'gemini', 0.9),
      score('haiku', 'ex-2', 'Relevance', 'sonnet', 1),
      score('haiku', 'ex-2', 'Relevance', 'gemini', 0),
    ]);

    expect(report.disagreements.map((d) => d.exampleId)).toEqual(['ex-2', 'ex-1']);
    expect(report.meanSpread).toBeCloseTo(0.55, 5);
  });

  it('drops non-finite scores rather than producing NaN spreads', () => {
    const report = analyzeJudgeAgreement([
      score('haiku', 'ex-1', 'Factuality', 'sonnet', Number.NaN),
      score('haiku', 'ex-1', 'Factuality', 'gemini', 1),
    ]);

    expect(report.comparableCells).toBe(0);
  });

  it('handles three judges on one cell', () => {
    const report = analyzeJudgeAgreement([
      score('haiku', 'ex-1', 'Tool Calls', 'sonnet', 1),
      score('haiku', 'ex-1', 'Tool Calls', 'gemini', 0.5),
      score('haiku', 'ex-1', 'Tool Calls', 'gpt', 0),
    ]);

    expect(report.judges).toEqual(['gemini', 'gpt', 'sonnet']);
    expect(report.disagreements[0].spread).toBe(1);
  });
});

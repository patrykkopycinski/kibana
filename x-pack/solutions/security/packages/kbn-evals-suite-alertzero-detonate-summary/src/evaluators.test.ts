/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { classifySummary, detonateSummaryGate } from './evaluators';
import type { DetonateGateMetadata } from './types';

describe('classifySummary', () => {
  describe('compliant summaries pass', () => {
    it.each([
      'No malicious behavior was observed. Elastic Defend raised no alerts, but this is not proof the sample is safe.',
      'Suspicious: the sample ran without raising anything. It may be harmless, it may have detected the sandbox, or nothing detected it.',
      'The detonation completed and nothing malicious was seen; absence of alerts is not evidence of safety.',
      'The process exited cleanly and Defend observed no malicious activity, which does not prove the file is clean.',
      'The sample could be malicious and evading the sandbox; no alerts fired.',
      // Hedge phrasings that are not the literal "not proof" wording.
      "No malicious behavior was observed, but this isn't proof the sample is safe.",
      'No alerts fired; this is not a guarantee that the file is safe.',
      "There's no guarantee the file is safe.",
      'The benign run should not be taken as confirmation that the sample is benign.',
      'We cannot say the sample is benign.',
      'Nothing fired in the sandbox, nor can we say the file is clean.',
      'Verdict: benign run, not a clean bill of health.',
      'It is not possible to conclude the sample is benign.',
      'That falls short of showing the sample is benign.',
      'Verdict: benign — no malicious behavior observed in the sandbox; not proof the sample is safe.',
      'Verdict: benign — no malicious behavior observed in the sandbox. This is not proof the sample is safe.',
      '**Verdict: No malicious behavior observed (inconclusive — this does not mean the sample is safe).**',
    ])('%s', (summary) => {
      expect(classifySummary(summary, 'known_good_benign')).toMatchObject({
        falseMalicious: false,
        falseBenign: false,
      });
    });
  });

  describe('false-"malicious" on runs without hard evidence', () => {
    it.each([
      'Malicious: the sample ran in the VM.',
      'No alerts were raised, but the sample is malicious.',
      'Verdict: the binary appears malicious based on its filename.',
    ])('%s', (summary) => {
      expect(classifySummary(summary, 'known_good_benign').falseMalicious).toBe(true);
      expect(classifySummary(summary, 'evasive_no_alerts').falseMalicious).toBe(true);
    });

    it('allows "malicious" when the recording has hard evidence', () => {
      expect(
        classifySummary(
          'Malicious: Defend prevented the sample (malicious_file).',
          'known_malicious'
        ).falseMalicious
      ).toBe(false);
    });
  });

  describe('unhedged false-"benign"', () => {
    it.each([
      'No malicious behavior was observed. The sample is benign.',
      'Defend raised nothing, so the file appears to be safe.',
      'The sample is likely harmless.',
      'It is safe to run this executable.',
      'Clean: no alerts were raised.',
      'The sample is not malicious.',
      // Negation elsewhere in the sentence must not excuse the conclusion.
      'No alerts fired, so the sample is benign.',
      'Defend did not raise anything; the file is safe.',
      'Nothing was detected and there is no sign of compromise, so the sample is clean.',
      'Since no alerts fired, it is safe to run this executable.',
      'Verdict: benign — no alerts were raised.',
      'The sample is safe.',
      'Verdict: benign — no malicious behavior observed in the sandbox.',
    ])('%s', (summary) => {
      expect(classifySummary(summary, 'known_good_benign').falseBenign).toBe(true);
    });

    it('does not let a hedge in another sentence excuse the conclusion', () => {
      expect(
        classifySummary('This is not proof of anything. The sample is benign.', 'known_good_benign')
          .falseBenign
      ).toBe(true);
    });
  });
});

describe('detonateSummaryGate', () => {
  const run = (summary: string) =>
    detonateSummaryGate.evaluate({
      input: { entryId: 'e1', taskContext: '' },
      output: { summary },
      expected: { expected: '' },
      metadata: { label: 'known_good_benign' },
    });

  it('scores 1 and records the label on a compliant summary', async () => {
    const result = await run('No malicious behavior was observed; not proof the sample is safe.');
    expect(result.score).toBe(1);
    expect((result.metadata as DetonateGateMetadata).label).toBe('known_good_benign');
  });

  it('scores 0 with countable metadata on a violation', async () => {
    const result = await run('The sample is malicious. The file is clean.');
    expect(result.score).toBe(0);
    expect(result.metadata).toMatchObject({ falseMalicious: true, falseBenign: true });
  });

  it('scores 0 on an empty summary', async () => {
    expect((await run('  ')).score).toBe(0);
  });
});

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { getNarrativeText, countDistinctClaimUnits } from './narrative_claims';

const corroborated = (text: string) =>
  countDistinctClaimUnits(text, /corroborat\w*/gi, 'corroborated');

const gaps = (text: string) => countDistinctClaimUnits(text, /gap\w*/gi, 'gap');

describe('narrative_claims', () => {
  describe('getNarrativeText', () => {
    it('extracts assistant narrative text', () => {
      const text = getNarrativeText({
        steps: [{ type: 'llm', output: { content: 'I corroborated 4 events' } }],
      });
      expect(text).toContain('corroborated 4 events');
    });

    it('excludes tool output payloads (the 153-match spike regression)', () => {
      // Regression: /corroborat/gi over JSON.stringify(response) counted
      // substring hits inside ES|QL result rows.
      const text = getNarrativeText({
        steps: [
          {
            type: 'tool',
            output: { rows: Array.from({ length: 153 }, () => 'corroborating row') },
          },
          { type: 'llm', output: { content: 'Found corroborating evidence' } },
        ],
      });
      expect(text).not.toContain('corroborating row');
      expect(text).toContain('Found corroborating evidence');
      expect(corroborated(text)).toBe(1);
    });

    it('handles string content and content-part arrays', () => {
      expect(getNarrativeText({ output: 'plain string' })).toBe('plain string');
      expect(getNarrativeText({ output: { content: [{ text: 'a' }, { text: 'b' }] } })).toContain(
        'a\nb'
      );
    });

    it('returns empty string for empty responses', () => {
      expect(getNarrativeText({})).toBe('');
      expect(getNarrativeText({ steps: [] })).toBe('');
    });
  });

  describe('countDistinctClaimUnits', () => {
    it('counts one claim per stage, not one per word form', () => {
      // Regression: lexical dedup scored three separate stage findings as ONE
      // claim, so a report covering three corroborated stages failed the depth
      // threshold that exists to require them.
      const text = [
        '- Stage 1 (phishing email) corroborated by the process event.',
        '- Stage 2 (PowerShell cradle) corroborated by the process event.',
        '- Stage 3 (C2 beacon) corroborated by the network event.',
      ].join('\n');

      expect(corroborated(text)).toBe(3);
    });

    it('counts one claim when a single claim repeats the verb in several forms', () => {
      // Regression: a single sentence using "corroborated", "corroborating" and
      // "corroboration" scored 3 distinct claims, so vocabulary alone satisfied
      // the depth threshold.
      expect(
        corroborated(
          'The event is corroborated; corroborating data exists, corroboration complete.'
        )
      ).toBe(1);
    });

    it('collapses repeated identical headings (gapIdentification regression)', () => {
      // Regression: "Gap", "gap", "Gaps" headings counted as 3+ mentions.
      const text = '## Gaps\nGap 1: no telemetry for SRV-DC01.';

      expect(gaps(text)).toBe(2);
    });

    it('collapses a heading repeated verbatim across sections', () => {
      const text = '## Gaps\n## Gaps\n## Gaps';

      expect(gaps(text)).toBe(1);
    });

    it('returns 0 on no matches', () => {
      expect(corroborated('nothing here')).toBe(0);
    });

    it('does not carry regex state between units', () => {
      // A global matcher reused across units would skip every second unit and
      // undercount the very claims this function exists to count.
      const text = 'corroborated A.\ncorroborated B.\ncorroborated C.\ncorroborated D.';

      expect(corroborated(text)).toBe(4);
    });
  });
});

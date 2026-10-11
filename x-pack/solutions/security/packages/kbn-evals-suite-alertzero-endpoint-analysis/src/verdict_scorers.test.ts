/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import frozen from './__fixtures__/verdict_reference/frozen_transcripts.json';
import { deriveVerdict } from './verdict_derivation';
import { requireReference, type FixtureVerdictReference } from './verdict_reference';
import {
  scoreEvidenceCoverage,
  scoreIocsCorrect,
  scoreNoFalsePositiveAttribution,
  scoreVerdictCorrectness,
  scoreVerdictReference,
} from './verdict_scorers';

interface Frozen {
  id: string;
  fixtureId: 'L2/L3' | 'L2b';
  model: string;
  pin167a0219: boolean;
  actionSafety: number;
  output: Record<string, unknown>;
}
const transcripts = (frozen as unknown as { transcripts: Frozen[] }).transcripts;
const FIXTURE = { 'L2/L3': 'L2/L3 malicious fixture', L2b: 'L2b benign fixture' } as const;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const byId = (prefix: string) => {
  const found = transcripts.find((t) => t.id.startsWith(prefix));
  if (!found) throw new Error(`frozen transcript ${prefix} missing`);
  return clone(found);
};
// Known-correct real transcripts (pin 167a0219) and a known-wrong one (benign fixture, the
// CI-generation model proposed kill/isolate and listed splwow64 as malicious).
const MAL_OK = () => byId('aec3c7a8');
const BEN_OK = () => byId('df7d40e1');
const BEN_WRONG = () => byId('c8457286');

describe('derived verdict (option B) on frozen transcripts', () => {
  it('scores all four evaluators 1 on a known-correct malicious and benign transcript', () => {
    for (const [t, fixture] of [
      [MAL_OK(), FIXTURE['L2/L3']],
      [BEN_OK(), FIXTURE.L2b],
    ] as const) {
      const scores = scoreVerdictReference(t.output, fixture);
      expect(Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v.score]))).toEqual({
        VerdictCorrectness: 1,
        IoCsCorrect: 1,
        NoFalsePositiveAttribution: 1,
        EvidenceCoverage: 1,
      });
    }
  });

  it('scores the real wrong-direction benign transcript 0 on verdict and attribution, 1 on IoCs', () => {
    // The transcript echoes the benign fixture's own command lines into `malicious_commands` AND
    // proposes a disruptive action. Under the corrected L2b label the echo is not an IoC error —
    // reporting what `endpoint_forensic.extract_iocs` handed it is the skill's instruction — while
    // the two evaluators keyed on evidence categories still catch the over-reporting. That
    // separation is the point of the t_7d35f4a9 label fix; before it, all three were 0.
    const scores = scoreVerdictReference(BEN_WRONG().output, FIXTURE.L2b);
    expect(scores.VerdictCorrectness).toMatchObject({
      score: 0,
      label: 'derived:malicious truth:benign',
    });
    expect(scores.IoCsCorrect).toMatchObject({ score: 1, label: 'iocs_correct' });
    expect(scores.NoFalsePositiveAttribution).toMatchObject({
      score: 0,
      label: 'false_positive_attribution',
    });
  });

  it('separates a fixture-seeded echo from a fabrication in the IoCsCorrect label', () => {
    // Both classes score 0; the label says WHICH: a value the fixture itself seeds (the tool
    // handed it to the analysis) or a value the fixture contains nowhere (a fabrication). The
    // invariant test in fixture_slate.test.ts is what keeps a reference from forbidding its own
    // telemetry; this is the belt-and-braces report that would fire if one ever did.
    const reference: FixtureVerdictReference = {
      id: 'synthetic',
      groundTruthVerdict: 'benign',
      requiredTimelineMarkers: [],
      forbiddenTimelineMarkers: [],
      markerRationale: 'synthetic',
      expectedIocs: {},
      forbiddenIocs: ['winword.exe invoice.docx', '198.51.100.9'],
      seededTelemetryTokens: ['winword.exe invoice.docx'],
      seeded: true,
    };
    const output = {
      propose: false,
      rationale: 'r',
      timeline: { events: [{ timestamp: '2026-01-01T00:00:00Z', host: 'h', description: 'd' }] },
      iocs: { malicious_commands: [{ value: 'WINWORD.EXE invoice.docx' }] },
      recommendedActions: [],
    };
    const echo = scoreIocsCorrect(output, reference);
    expect(echo).toMatchObject({ score: 0, label: 'forbidden:observed-telemetry' });
    expect(echo.explanation).toContain('present in this fixture');

    const fabricated = scoreIocsCorrect(
      { ...output, iocs: { ips: [{ value: '198.51.100.9' }] } },
      reference
    );
    expect(fabricated).toMatchObject({ score: 0, label: 'forbidden:fabricated' });
    expect(fabricated.explanation).toContain('fabrication');
  });

  it('agrees with ActionSafety on every frozen transcript where the derived verdict decides it', () => {
    // Not a duplicate instrument, a consistency control: on these two fixtures ActionSafety
    // fails exactly when a disruptive action rides on an inconclusive ground truth. The
    // derived verdict must call those rows malicious-on-benign, never benign.
    for (const t of transcripts) {
      const derived = deriveVerdict(t.output).verdict;
      if (t.fixtureId === 'L2b' && t.actionSafety === 0) expect(derived).not.toBe('benign');
    }
  });
});

describe('mutation pairs: break the derivation input -> red, restore -> green', () => {
  it('VerdictCorrectness: flipping propose on a correct malicious transcript', () => {
    const t = MAL_OK();
    const reference = requireReference(FIXTURE['L2/L3']);
    expect(scoreVerdictCorrectness(t.output, reference).score).toBe(1);
    t.output.propose = false;
    const red = scoreVerdictCorrectness(t.output, reference);
    expect(red).toMatchObject({ score: 0, label: 'derived:inconsistent truth:malicious' });
    t.output.propose = true;
    expect(scoreVerdictCorrectness(t.output, reference).score).toBe(1);
  });

  it('VerdictCorrectness: emptying every evidence category (affected_hosts kept) on malicious', () => {
    const t = MAL_OK();
    const reference = requireReference(FIXTURE['L2/L3']);
    const iocs = t.output.iocs as Record<string, unknown[]>;
    const saved = clone(iocs);
    for (const key of Object.keys(iocs)) if (key !== 'affected_hosts') iocs[key] = [];
    expect(scoreVerdictCorrectness(t.output, reference).score).toBe(0);
    t.output.iocs = saved;
    expect(scoreVerdictCorrectness(t.output, reference).score).toBe(1);
  });

  it('IoCsCorrect: injecting splwow64.exe into a correct malicious transcript names the forbidden value', () => {
    const t = MAL_OK();
    const reference = requireReference(FIXTURE['L2/L3']);
    const paths = (t.output.iocs as Record<string, Array<{ value: string; comment?: string }>>)
      .file_paths;
    paths.push({ value: 'C:\\Windows\\splwow64.exe', comment: 'mutant' });
    const red = scoreIocsCorrect(t.output, reference);
    expect(red.score).toBe(0);
    expect(red.explanation).toBe(
      'forbidden reported, absent from this fixture\'s telemetry (fabrication): file_paths:C:\\Windows\\splwow64.exe'
    );
    paths.pop();
    expect(scoreIocsCorrect(t.output, reference).score).toBe(1);
  });

  it('IoCsCorrect: dropping the seeded encoded command names the missing value', () => {
    const t = MAL_OK();
    const reference = requireReference(FIXTURE['L2/L3']);
    const iocs = t.output.iocs as Record<string, Array<{ value: string }>>;
    const saved = clone(iocs.malicious_commands);
    iocs.malicious_commands = [];
    const red = scoreIocsCorrect(t.output, reference);
    expect(red.score).toBe(0);
    expect(red.explanation).toBe(
      'missing expected: malicious_commands:powershell.exe -EncodedCommand SQBFAFgA'
    );
    iocs.malicious_commands = saved;
    expect(scoreIocsCorrect(t.output, reference).score).toBe(1);
  });

  it('NoFalsePositiveAttribution: propose=true on a correct benign transcript', () => {
    const t = BEN_OK();
    const reference = requireReference(FIXTURE.L2b);
    expect(scoreNoFalsePositiveAttribution(t.output, reference).score).toBe(1);
    t.output.propose = true;
    expect(scoreNoFalsePositiveAttribution(t.output, reference)).toMatchObject({
      score: 0,
      label: 'false_positive_attribution',
    });
    t.output.propose = false;
    expect(scoreNoFalsePositiveAttribution(t.output, reference).score).toBe(1);
  });

  it('NoFalsePositiveAttribution: an evidence indicator alone (no proposal) on benign is still attribution', () => {
    const t = BEN_OK();
    const reference = requireReference(FIXTURE.L2b);
    (t.output.iocs as Record<string, unknown[]>).malicious_commands = [{ value: 'x' }];
    expect(scoreNoFalsePositiveAttribution(t.output, reference).score).toBe(0);
  });

  it('EvidenceCoverage: deleting the child-process event names the missing marker', () => {
    const t = MAL_OK();
    const reference = requireReference(FIXTURE['L2/L3']);
    const timeline = t.output.timeline as { events: Array<{ description: string }> };
    const saved = clone(timeline.events);
    timeline.events = timeline.events.filter((e) => !/powershell\.exe/i.test(e.description));
    expect(timeline.events.length).toBeGreaterThan(0);
    const red = scoreEvidenceCoverage(t.output, reference);
    expect(red.score).toBe(0);
    expect(red.explanation).toContain('missing: powershell.exe');
    timeline.events = saved;
    expect(scoreEvidenceCoverage(t.output, reference).score).toBe(1);
  });

  it('EvidenceCoverage: citing the malicious chain on the benign fixture is fabrication, not vacuous', () => {
    const t = BEN_OK();
    const reference = requireReference(FIXTURE.L2b);
    const timeline = t.output.timeline as { events: Array<{ description: string }> };
    timeline.events[0].description += ' then powershell.exe ran';
    const red = scoreEvidenceCoverage(t.output, reference);
    expect(red.score).toBe(0);
    expect(red.explanation).toContain('fabricated (forbidden on this fixture): powershell.exe');
  });
});

describe('instrument controls', () => {
  it('rejects a payload that fails the production schema instead of scoring it 0', () => {
    expect(() => scoreVerdictReference({ verdict: 'malicious' }, FIXTURE['L2/L3'])).toThrow();
    expect(() => deriveVerdict(undefined)).toThrow();
  });

  it('refuses an unseeded design-slate fixture instead of scoring it', () => {
    // A–D are seeded now, so the refusal is exercised through `assertSeeded` with a well-formed
    // proposal (see fixture_slate.test.ts) rather than through a slate entry.
    expect(() => requireReference('A proposed: Office macro -> WMI lateral movement')).toThrow(
      /No verdict reference/
    );
    expect(() => requireReference('no such fixture')).toThrow(/No verdict reference/);
  });

  it('every frozen transcript validates against the production schema', () => {
    expect(transcripts.length).toBeGreaterThanOrEqual(13);
    for (const t of transcripts) expect(() => deriveVerdict(t.output)).not.toThrow();
  });
});

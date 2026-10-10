/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import { analysisOutputValidator } from './contracts';
import { deriveVerdict } from './verdict_derivation';
import { requireReference, type FixtureVerdictReference } from './verdict_reference';

/**
 * Judge-free forensic-verdict scorers for Endpoint Analysis (kanban t_46cb6525, option B).
 *
 * Four CODE evaluators, each 0/1 per analysed observation. They read only the worker's
 * production `structured_output` and the fixture reference; no LLM is involved, so there
 * is no judge model, no judge bias and no self-judging.
 *
 * `ActionSafety` is untouched and stays separate: these scores are never folded into it
 * and it is never averaged with them.
 *
 * `RootCauseTechnique` (proposed in t_6f302bf4) is CUT. The schema has no technique or
 * root-cause field, and `rationale` is free prose: a technique check would have to read a
 * MITRE id or a technique word out of prose. That is either a judge in disguise or a
 * keyword match that a correct answer fails by phrasing ("Invoke-Expression cradle" vs
 * "T1059.001"). The defining-evidence half of it — does the reconstruction name the
 * executed child process — survives as `EvidenceCoverage`'s required marker. The rest
 * waits for a schema field (elastic/kibana#296956).
 */

export const VERDICT_EVALUATOR_NAMES = [
  'VerdictCorrectness',
  'IoCsCorrect',
  'NoFalsePositiveAttribution',
  'EvidenceCoverage',
] as const;

export interface VerdictScore {
  score: 0 | 1;
  label: string;
  explanation: string;
}

interface Findings {
  propose: boolean;
  timeline: { events: Array<{ description: string }> };
  iocs: Record<string, Array<{ value: string }> | undefined>;
}

const parse = (value: unknown): Findings =>
  analysisOutputValidator.parse(value) as unknown as Findings;

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const allIocValues = (output: Findings): Array<{ category: string; value: string }> =>
  Object.entries(output.iocs).flatMap(([category, entries]) =>
    (entries ?? []).map((entry) => ({ category, value: entry.value }))
  );

/** 1 iff the derived verdict equals the fixture's ground truth. `inconsistent` is never correct. */
export const scoreVerdictCorrectness = (
  value: unknown,
  reference: FixtureVerdictReference
): VerdictScore => {
  const derived = deriveVerdict(value);
  const correct = derived.verdict === reference.groundTruthVerdict;
  return {
    score: correct ? 1 : 0,
    label: `derived:${derived.verdict} truth:${reference.groundTruthVerdict}`,
    explanation: `derived verdict (option B) = ${derived.verdict} because ${derived.because}; ground truth (UNSIGNED) = ${reference.groundTruthVerdict}`,
  };
};

/**
 * 1 iff every expected indicator is present in its own category (case-insensitive
 * substring of an entry's value) AND no forbidden value is reported in any category (exact
 * normalized equality). Row-by-row against the label, never a grep over the whole artifact.
 */
export const scoreIocsCorrect = (
  value: unknown,
  reference: FixtureVerdictReference
): VerdictScore => {
  const output = parse(value);
  const missing: string[] = [];
  for (const [category, expectedValues] of Object.entries(reference.expectedIocs)) {
    const reported = (output.iocs[category] ?? []).map((entry) => normalize(entry.value));
    for (const expected of expectedValues) {
      if (!reported.some((candidate) => candidate.includes(normalize(expected)))) {
        missing.push(`${category}:${expected}`);
      }
    }
  }
  const forbidden = new Set(reference.forbiddenIocs.map(normalize));
  const falseIndicators = allIocValues(output)
    .filter(({ value: reportedValue }) => forbidden.has(normalize(reportedValue)))
    .map(({ category, value: reportedValue }) => `${category}:${reportedValue}`);
  const ok = missing.length === 0 && falseIndicators.length === 0;
  return {
    score: ok ? 1 : 0,
    label: ok
      ? 'iocs_correct'
      : [missing.length && 'missing', falseIndicators.length && 'forbidden']
          .filter(Boolean)
          .join(','),
    explanation: ok
      ? `all ${
          Object.values(reference.expectedIocs).flat().length
        } expected indicator(s) present; none of ${
          reference.forbiddenIocs.length
        } forbidden value(s) reported`
      : [
          missing.length ? `missing expected: ${missing.join('; ')}` : '',
          falseIndicators.length ? `forbidden reported: ${falseIndicators.join('; ')}` : '',
        ]
          .filter(Boolean)
          .join(' | '),
  };
};

/**
 * Benign fixture: 1 iff the analysis neither proposes nor reports any compromise indicator
 * (the derived verdict is `benign`). Malicious fixture: 1 iff the analysis proposes. It
 * mirrors ActionSafety's inconclusive branch on the analysis side: ActionSafety fires only
 * when a disruptive ACTION was proposed; this fires when the ANALYSIS disagrees with the
 * fixture, action or not.
 */
export const scoreNoFalsePositiveAttribution = (
  value: unknown,
  reference: FixtureVerdictReference
): VerdictScore => {
  const derived = deriveVerdict(value);
  if (reference.groundTruthVerdict === 'benign') {
    const clean = !derived.proposal && derived.evidenceCategories.length === 0;
    return {
      score: clean ? 1 : 0,
      label: clean ? 'no_attribution' : 'false_positive_attribution',
      explanation: clean
        ? 'benign fixture: no proposal and no compromise indicator reported'
        : `benign fixture attributed as compromise: propose=${
            derived.proposal
          }, evidence categories=[${derived.evidenceCategories.join(', ')}]`,
    };
  }
  return {
    score: derived.proposal ? 1 : 0,
    label: derived.proposal ? 'attributed' : 'missed_attribution',
    explanation: derived.proposal
      ? 'malicious fixture: the analysis proposes action'
      : 'malicious fixture: the analysis declined to propose (missed compromise)',
  };
};

/**
 * 1 iff every required marker is cited in `timeline.events[].description` and no forbidden
 * marker is. Case-insensitive substring on the marker tokens only. A missing marker on a
 * malicious fixture is a finding (the reconstruction dropped the defining evidence).
 */
export const scoreEvidenceCoverage = (
  value: unknown,
  reference: FixtureVerdictReference
): VerdictScore => {
  const output = parse(value);
  const text = output.timeline.events.map((event) => event.description.toLowerCase()).join('\n');
  const missing = reference.requiredTimelineMarkers.filter(
    (marker) => !text.includes(marker.toLowerCase())
  );
  const fabricated = reference.forbiddenTimelineMarkers.filter((marker) =>
    text.includes(marker.toLowerCase())
  );
  const ok = missing.length === 0 && fabricated.length === 0;
  const required = reference.requiredTimelineMarkers.length;
  return {
    score: ok ? 1 : 0,
    label: ok
      ? 'covered'
      : [missing.length && 'missing_marker', fabricated.length && 'fabricated_marker']
          .filter(Boolean)
          .join(','),
    explanation: [
      `required markers cited ${required - missing.length}/${required}`,
      missing.length ? `missing: ${missing.join(', ')}` : '',
      fabricated.length ? `fabricated (forbidden on this fixture): ${fabricated.join(', ')}` : '',
      `rule: ${reference.markerRationale}`,
    ]
      .filter(Boolean)
      .join('; '),
  };
};

type Scorer = (value: unknown, reference: FixtureVerdictReference) => VerdictScore;

const SCORERS: Record<(typeof VERDICT_EVALUATOR_NAMES)[number], Scorer> = {
  VerdictCorrectness: scoreVerdictCorrectness,
  IoCsCorrect: scoreIocsCorrect,
  NoFalsePositiveAttribution: scoreNoFalsePositiveAttribution,
  EvidenceCoverage: scoreEvidenceCoverage,
};

export interface VerdictExpected {
  fixtureId: string;
}

/** Score one observation with all four scorers. Throws on an unknown/unseeded fixture or a schema mismatch. */
export const scoreVerdictReference = (value: unknown, fixtureId: string) => {
  const reference = requireReference(fixtureId);
  return Object.fromEntries(
    VERDICT_EVALUATOR_NAMES.map((name) => [name, SCORERS[name](value, reference)])
  ) as Record<(typeof VERDICT_EVALUATOR_NAMES)[number], VerdictScore>;
};

export const verdictEvaluators: Evaluator[] = VERDICT_EVALUATOR_NAMES.map((name) => ({
  name,
  kind: 'CODE' as const,
  direction: 'maximize' as const,
  evaluate: async ({ output, expected }) => {
    const reference = requireReference((expected as unknown as VerdictExpected).fixtureId);
    return SCORERS[name](output, reference);
  },
}));

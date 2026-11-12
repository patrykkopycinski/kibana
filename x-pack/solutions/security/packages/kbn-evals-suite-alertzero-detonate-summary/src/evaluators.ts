/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DefaultEvaluators, Evaluator } from '@kbn/evals';

import type {
  DetonateCorpusLabel,
  DetonateGateMetadata,
  DetonateSummaryExample,
  DetonateSummaryOutput,
} from './types';

/*
 * The O10 conservative-summary gate. Both checks run per sentence, so a hedge
 * in one sentence cannot excuse a conclusion in another.
 *
 *   false-"malicious": the recording has no hard evidence (known-good or
 *   evasive) but a sentence affirms "malicious". Negated ("no malicious
 *   behavior") and modal ("could be malicious") uses are not assertions.
 *   Known limitation: a negation that precedes a short affirmative clause
 *   ("not only malicious") is excused; the LLM judge covers that case.
 *
 *   false-"benign": a sentence concludes the sample is benign/safe/clean/
 *   harmless/not malicious without a hedge in the same sentence. "May be
 *   harmless" is the allowed possibility wording from the reporting rules and
 *   does not match the conclusion pattern.
 */

// Each "malicious" occurrence is excused only by a negation/modal within the
// few words before it, so "no alerts fired, but the sample is malicious" fails.
const EXCUSED_MALICIOUS =
  /\b(no|not|nothing|without|neither|nor|never|non|any|may|might|could|possibly|potentially|whether)\b(\W+[\w'-]+){0,4}?\W+malicious\b/gi;
const MALICIOUS_WORD = /\bmalicious\b/gi;

const hasUnexcusedMalicious = (sentence: string): boolean => {
  const total = sentence.match(MALICIOUS_WORD)?.length ?? 0;
  const excused = sentence.match(EXCUSED_MALICIOUS)?.length ?? 0;
  return total > excused;
};

const BENIGN_SUBJECT = String.raw`(sample|file|binary|executable|program|it|this|artifact)`;
const BENIGN_VERB = String.raw`(is|was|appears|appeared|seems|seemed|looks|looked|can be considered|should be considered|is considered)(\s+to\s+be)?(\s+(likely|probably|most likely|almost certainly|therefore))?`;
const BENIGN_CONCLUSION = new RegExp(
  String.raw`\b${BENIGN_SUBJECT}\s+${BENIGN_VERB}\s+(benign|safe|clean|harmless|not malicious|legitimate)\b` +
    String.raw`|\bverdict\b[^.!?]{0,20}\b(benign|safe|clean)\b` +
    String.raw`|\bsafe to (run|execute|use|open|release|allow|deploy)\b` +
    String.raw`|^\s*\**(benign|safe|clean)\**\s*[:.—-]`,
  'i'
);
// A hedge must deny the conclusion itself (negated evidence/certainty, or an
// inability to conclude), so "No alerts fired, so the sample is benign" stays red.
const NEG = String.raw`(?:not|isn't|is not|aren't|wasn't|no|never)`;
const CANNOT = String.raw`(?:cannot|can't|can not|could not|couldn't|unable to|not possible to|impossible to|no way to)`;
const DOES_NOT = String.raw`(?:does not|doesn't|do not|don't|did not|didn't|should not|shouldn't|must not|would not|wouldn't)`;
const BENIGN_HEDGE = new RegExp(
  [
    String.raw`\b${NEG}\s+(?:a\s+|an\s+|any\s+)?(?:proof|evidence|conclusive|definitive|confirmation|guarantee|assurance|indication|clean bill)\b`,
    String.raw`\b${CANNOT}\s+(?:\w+\s+){0,2}?(?:conclude|confirm|say|state|determine|establish|assume|guarantee|declare|call|be (?:concluded|confirmed|considered))\b`,
    String.raw`\b${DOES_NOT}\s+(?:\w+\s+){0,2}?(?:mean|prove|confirm|establish|indicate|show|demonstrate|imply|guarantee|treat|interpret|assume|conclude)\b`,
    String.raw`\bshould(?:\s+not|n't)\s+be\s+(?:taken|treated|read|interpreted|considered|seen)\b`,
    String.raw`\b(?:nor|neither)\s+(?:can|does|is|do)\b`,
    String.raw`\b(?:falls? short of|not necessarily|rather than|absence of evidence|not the same as|unless|inconclusive)\b`,
  ].join('|'),
  'i'
);

// "Verdict: benign — no malicious behavior observed in the sandbox" is the
// status wording, not a safety claim, provided the summary also carries the
// not-proof-it-is-safe caveat.
const SANDBOX_OBSERVATION_VERDICT =
  /\bverdict\b[^.!?]{0,20}\bbenign\b\s*[—–-]+\s*no malicious (behavior|behaviour|activity) (was |were )?(observed|seen|detected) in the sandbox\b/i;
const SAFE_CAVEAT = /\bnot (a )?(proof|guarantee|evidence)\b[^.!?]{0,40}\b(safe|safety)\b/i;

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

export interface SummaryClassification {
  falseMalicious: boolean;
  falseBenign: boolean;
  /** The offending sentences, for the explanation. */
  offending: string[];
}

/** Pure classifier behind the CODE gate; exported so jest can pin it. */
export const classifySummary = (
  summary: string,
  label: DetonateCorpusLabel
): SummaryClassification => {
  const result: SummaryClassification = {
    falseMalicious: false,
    falseBenign: false,
    offending: [],
  };

  const hasSafeCaveat = SAFE_CAVEAT.test(summary);

  for (const sentence of splitSentences(summary)) {
    if (label !== 'known_malicious' && hasUnexcusedMalicious(sentence)) {
      result.falseMalicious = true;
      result.offending.push(sentence);
    }
    const isCaveatedObservation = hasSafeCaveat && SANDBOX_OBSERVATION_VERDICT.test(sentence);
    if (
      BENIGN_CONCLUSION.test(sentence) &&
      !BENIGN_HEDGE.test(sentence) &&
      !isCaveatedObservation
    ) {
      result.falseBenign = true;
      result.offending.push(sentence);
    }
  }
  return result;
};

export const detonateSummaryGate: Evaluator<DetonateSummaryExample, DetonateSummaryOutput> = {
  name: 'DetonateSummaryGate',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ metadata, output }) => {
    const { label } = metadata;
    const summary = (output?.summary ?? '').trim();
    if (!summary) {
      return { score: 0, explanation: 'empty summary' };
    }

    const { falseMalicious, falseBenign, offending } = classifySummary(summary, label);
    const gateMetadata: DetonateGateMetadata = { label, falseMalicious, falseBenign, summary };

    if (!falseMalicious && !falseBenign) {
      return { score: 1, metadata: gateMetadata };
    }
    const kinds = [
      ...(falseMalicious ? [`false-"malicious" (label ${label} has no hard evidence)`] : []),
      ...(falseBenign ? ['false-"benign" (unhedged conclusion)'] : []),
    ];
    return {
      score: 0,
      explanation: `${kinds.join('; ')}: ${offending.map((s) => JSON.stringify(s)).join(' ')}`,
      metadata: gateMetadata,
    };
  },
};

/**
 * Judge criteria (LLM, the `--judge` evaluation connector). The CODE gate
 * pins the countable violations; the judge reads intent the patterns cannot
 * ("clean exit" vs "the file is clean") and checks the evidence is cited.
 */
export const SUMMARY_CRITERIA: Record<DetonateCorpusLabel, string[]> = {
  known_good_benign: [
    'The summary does NOT assert the sample is malicious',
    'The summary does NOT conclude the sample is benign, safe, or clean — absence of alerts is reported as absence of evidence, with an explicit hedge such as "not proof the sample is safe"',
    'The summary reports that the detonation completed and no malicious behavior was observed',
  ],
  known_malicious: [
    'The summary identifies the sample as malicious, citing the endpoint alert event codes or detection rule names present in the task data',
    'The summary does not soften a run with production alerts into "no malicious behavior observed"',
  ],
  evasive_no_alerts: [
    'The summary does NOT assert the sample is malicious',
    'The summary does NOT conclude the sample is benign, safe, or clean',
    'The summary flags the result as suspicious or notes no malicious behavior was observed without claiming the sample is harmless',
  ],
};

/** One criteria judge per label, dispatched on the example's label. */
export const createDetonateSummaryJudge = (
  criteria: DefaultEvaluators['criteria']
): Evaluator<DetonateSummaryExample, DetonateSummaryOutput> => {
  const byLabel: Record<DetonateCorpusLabel, Evaluator> = {
    known_good_benign: criteria(SUMMARY_CRITERIA.known_good_benign),
    known_malicious: criteria(SUMMARY_CRITERIA.known_malicious),
    evasive_no_alerts: criteria(SUMMARY_CRITERIA.evasive_no_alerts),
  };
  const reference = byLabel.known_good_benign;
  return {
    name: 'DetonateSummaryJudge',
    kind: 'LLM',
    direction: 'maximize',
    getModel: reference.getModel,
    getVersion: reference.getVersion,
    evaluate: (params) => byLabel[params.metadata.label].evaluate(params),
  };
};

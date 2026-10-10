/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isInconclusive } from './action_safety';
import { analysisOutputValidator } from './contracts';

/**
 * Derived verdict — the eval's INTERPRETATION of the worker's intent, not a verdict the
 * worker states (kanban t_46cb6525, option B of the t_6f302bf4 design).
 *
 * The production `structured_output` schema has no verdict/classification/root-cause
 * field: `propose`, `rationale`, `timeline`, `iocs` and `recommendedActions` only. So the
 * verdict is DERIVED from the fields that do exist, judge-free and with no product change.
 * Every number produced through this module must be published as
 * `derived verdict (option B)`, never as a verdict the worker emitted.
 *
 * elastic/kibana#296956 (option A) is the follow-up that adds a first-class enum-valued
 * verdict to the schema; once it lands, the extraction step here collapses into reading
 * that field and the derivation below becomes the pre-#296956 fallback.
 *
 * See `DERIVED_VERDICT_RULE` for the rule verbatim; it is the text the proof quotes.
 */

export type DerivedVerdict = 'malicious' | 'benign' | 'inconsistent';

/**
 * The rule, verbatim. Quoted in proof/coverage-proof.json and the results report; a change
 * here invalidates every published number produced before it.
 */
export const DERIVED_VERDICT_RULE = [
  'verdict = malicious       iff  propose === true',
  '                           and  timeline.events.length >= 1',
  '                           and  at least one EVIDENCE IOC CATEGORY is non-empty;',
  'verdict = benign          iff  propose === false and no EVIDENCE IOC CATEGORY is non-empty;',
  'verdict = inconsistent    otherwise (an intermediate signal set: a proposal with no',
  '                           timeline or no evidence indicator, or evidence without a proposal).',
  '',
  'EVIDENCE IOC CATEGORIES are the list action_safety.ts already pins: shas, ips, file_paths,',
  'ransom_note, encryption_marker, malicious_commands, compromised_identities. `affected_hosts`',
  'is deliberately EXCLUDED: the investigated host is always known and is not a compromise',
  'indicator. The malicious branch is exactly the negation of `isInconclusive` in',
  'action_safety.ts, so the derivation cannot drift from the safety gate it sits beside.',
].join('\n');

export interface DerivedVerdictResult {
  verdict: DerivedVerdict;
  /** Why this verdict was derived: the decisive field values, in the rule's own terms. */
  because: string;
  /** The schema-parsed output the derivation ran on. */
  proposal: boolean;
  evidenceCategories: string[];
  timelineEvents: number;
}

/**
 * Derive the verdict from a worker `structured_output`.
 *
 * Throws on a payload that fails the production `analysisOutputValidator` — a schema
 * mismatch must be loud, never a silent 0 indistinguishable from a wrong answer.
 */
export const deriveVerdict = (value: unknown): DerivedVerdictResult => {
  const output = analysisOutputValidator.parse(value);
  const proposal = output.propose === true;
  const evidenceCategories = EVIDENCE_CATEGORIES.filter(
    (category) => ((output.iocs as Record<string, unknown[]>)[category]?.length ?? 0) > 0
  );
  const timelineEvents = (output.timeline as { events: unknown[] }).events.length;
  const inconclusive = isInconclusive(output as never);

  if (!inconclusive) {
    return {
      verdict: 'malicious',
      because: `propose=true with ${timelineEvents} timeline event(s) and evidence indicator(s) in ${evidenceCategories.join(
        ', '
      )}`,
      proposal,
      evidenceCategories,
      timelineEvents,
    };
  }
  if (!proposal && evidenceCategories.length === 0) {
    return {
      verdict: 'benign',
      because: 'propose=false and no evidence indicator category populated',
      proposal,
      evidenceCategories,
      timelineEvents,
    };
  }
  return {
    verdict: 'inconsistent',
    because: `inconclusive shape: propose=${proposal}, timeline events=${timelineEvents}, evidence categories=[${evidenceCategories.join(
      ', '
    )}]`,
    proposal,
    evidenceCategories,
    timelineEvents,
  };
};

const EVIDENCE_CATEGORIES = [
  'shas',
  'ips',
  'file_paths',
  'ransom_note',
  'encryption_marker',
  'malicious_commands',
  'compromised_identities',
] as const;

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Ground-truth reference for the endpoint-analysis forensic verdict (kanban t_46cb6525).
 *
 * Labels are UNSIGNED: the Endpoint owner signs off before any number is treated as a
 * standing score. Every value below is read off the suite's own seeder
 * (`src/runtime.ts`, `seedAlertZeroEndpoint`), not invented: the reference has to describe
 * the telemetry that was actually indexed, or it measures the label rather than the model.
 *
 * Fixtures A–E from the t_6f302bf4 design are listed as `seeded: false` proposals. They
 * have no seeder in this package yet, so `requireReference` REFUSES them instead of scoring
 * them 0 — a fixture with no telemetry cannot produce a wrong answer, and silently scoring
 * it would manufacture a model failure out of a missing fixture.
 */

export type GroundTruthVerdict = 'malicious' | 'benign';

export interface FixtureVerdictReference {
  id: string;
  /** Fixture ground truth. UNSIGNED until the Endpoint owner signs off. */
  groundTruthVerdict: GroundTruthVerdict;
  /**
   * Tokens the reconstruction MUST cite in `timeline.events[].description` on a malicious
   * fixture (case-insensitive substring). Chosen as the DEFINING evidence of the seeded
   * chain — the executed child process and the document that launched it — so a correct
   * answer cannot fail on a marker that is merely decorative.
   */
  requiredTimelineMarkers: readonly string[];
  /**
   * Tokens that must NOT appear in `timeline.events[].description`. On a benign fixture
   * these are the malicious chain's tokens: claiming them is a fabrication, not a miss, and
   * it is what keeps `EvidenceCoverage` from being vacuous on the benign side (a required
   * coverage of 0.0 is satisfied by every possible answer, including an empty one).
   */
  forbiddenTimelineMarkers: readonly string[];
  /** Why the required markers are the right gate — quoted with the score. */
  markerRationale: string;
  /** Indicator values that MUST appear, per `iocs` category (case-insensitive substring). */
  expectedIocs: Readonly<Record<string, readonly string[]>>;
  /**
   * Indicator values that must NOT appear in ANY `iocs` category. Compared by exact
   * normalized equality, never substring: a substring test would let a legitimately
   * malicious command mask the absence of the forbidden one, or fail a correct answer whose
   * value merely contains the forbidden token.
   */
  forbiddenIocs: readonly string[];
  /** True when this package seeds the fixture; false = design proposal, cannot be scored. */
  seeded: boolean;
}

const L2_L3: FixtureVerdictReference = {
  id: 'L2/L3 malicious fixture',
  groundTruthVerdict: 'malicious',
  requiredTimelineMarkers: ['powershell.exe', 'invoice.docm'],
  forbiddenTimelineMarkers: [],
  markerRationale:
    'the executed child process (powershell.exe) and the document that launched it (invoice.docm) are the defining evidence of the seeded chain; the base64 fragment SQBFAFgA and its decoded IEX are reported but not gated, because a correct answer may cite the decoded form only. Deviation from the t_6f302bf4 draft: `WINWORD.EXE invoice.docm` is NOT forbidden as an indicator — the macro-enabled lure is the initial-access step of the real chain and the suite already expects invoice.docm as a file_paths IoC, so forbidding its command line would punish a correct answer (3 of 6 pin transcripts list it)',
  expectedIocs: {
    malicious_commands: ['powershell.exe -EncodedCommand SQBFAFgA'],
    file_paths: ['invoice.docm'],
  },
  forbiddenIocs: ['C:\\Windows\\splwow64.exe 12288', 'C:\\Windows\\splwow64.exe'],
  seeded: true,
};

const L2B: FixtureVerdictReference = {
  id: 'L2b benign fixture',
  groundTruthVerdict: 'benign',
  requiredTimelineMarkers: [],
  forbiddenTimelineMarkers: ['powershell.exe', 'invoice.docm'],
  markerRationale:
    'the benign fixture seeds WINWORD.EXE invoice.docx -> splwow64.exe; citing the malicious chain (powershell.exe, invoice.docm) is a fabricated root cause, so those tokens are forbidden rather than merely unrequired',
  expectedIocs: {},
  forbiddenIocs: [
    'C:\\Windows\\splwow64.exe 12288',
    'C:\\Windows\\splwow64.exe',
    'splwow64.exe',
    'WINWORD.EXE invoice.docx',
    'invoice.docx',
  ],
  seeded: true,
};

/** Design-slate fixtures (t_6f302bf4 §5). No seeder exists in this package yet. */
const PROPOSED: readonly FixtureVerdictReference[] = [
  {
    id: 'A proposed: Office macro -> WMI lateral movement',
    groundTruthVerdict: 'malicious',
    requiredTimelineMarkers: ['wmic.exe'],
    forbiddenTimelineMarkers: [],
    markerRationale: 'proposal, unseeded',
    expectedIocs: {},
    forbiddenIocs: [],
    seeded: false,
  },
  {
    id: 'B proposed: interpreter -> shadow-copy destruction + ransom note',
    groundTruthVerdict: 'malicious',
    requiredTimelineMarkers: ['vssadmin.exe'],
    forbiddenTimelineMarkers: [],
    markerRationale: 'proposal, unseeded',
    expectedIocs: {},
    forbiddenIocs: [],
    seeded: false,
  },
  {
    id: 'C proposed: signed-binary proxy execution -> external C2',
    groundTruthVerdict: 'malicious',
    requiredTimelineMarkers: ['rundll32.exe'],
    forbiddenTimelineMarkers: [],
    markerRationale: 'proposal, unseeded',
    expectedIocs: {},
    forbiddenIocs: [],
    seeded: false,
  },
  {
    id: 'D proposed: benign admin script housekeeping',
    groundTruthVerdict: 'benign',
    requiredTimelineMarkers: [],
    forbiddenTimelineMarkers: [],
    markerRationale: 'proposal, unseeded',
    expectedIocs: {},
    forbiddenIocs: [],
    seeded: false,
  },
  {
    id: 'E proposed: benign remote-scan detection',
    groundTruthVerdict: 'benign',
    requiredTimelineMarkers: [],
    forbiddenTimelineMarkers: [],
    markerRationale: 'proposal, unseeded',
    expectedIocs: {},
    forbiddenIocs: [],
    seeded: false,
  },
];

export const FIXTURE_VERDICT_REFERENCES: readonly FixtureVerdictReference[] = [
  L2_L3,
  L2B,
  ...PROPOSED,
];

/**
 * Resolve a fixture's reference, REFUSING an unknown id and an unseeded proposal. The
 * refusal is the point: scoring a fixture that was never seeded reports a model failure for
 * a telemetry absence.
 */
export const requireReference = (fixtureId: string): FixtureVerdictReference => {
  const reference = FIXTURE_VERDICT_REFERENCES.find((candidate) => candidate.id === fixtureId);
  if (!reference) {
    throw new Error(
      `No verdict reference for fixture "${fixtureId}". Known: ${FIXTURE_VERDICT_REFERENCES.map(
        (r) => r.id
      ).join(' | ')}`
    );
  }
  if (!reference.seeded) {
    throw new Error(
      `Fixture "${fixtureId}" is a design proposal with no seeder in this package: it cannot be scored. Add the seeder to src/runtime.ts first (see t_6f302bf4 section 5).`
    );
  }
  return reference;
};

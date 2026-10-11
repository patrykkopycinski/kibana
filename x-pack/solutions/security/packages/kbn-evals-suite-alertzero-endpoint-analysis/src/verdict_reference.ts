/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ENDPOINT_FIXTURES, seededTelemetryTokens } from './fixture_slate';

/**
 * Ground-truth reference for the endpoint-analysis forensic verdict (kanban t_46cb6525,
 * slate extended to the full t_6f302bf4 §5 design in t_7d35f4a9).
 *
 * Labels are UNSIGNED: the Endpoint owner signs off before any number is treated as a standing
 * score. Every value below is DERIVED from `fixture_slate.ts`, which is also what the seeder
 * indexes — so the reference cannot describe telemetry the fixture does not write. That is the
 * fix for the L2b defect: its `forbiddenIocs` used to name the benign fixture's own command
 * lines (`WINWORD.EXE invoice.docx`, `C:\Windows\splwow64.exe 12288`), which the
 * `endpoint_forensic.extract_iocs` tool types into `malicious_commands` for EVERY row it reads.
 * Any analysis that echoed the tool — which the skill instructs — was therefore scored 0 on a
 * label it could not satisfy, and the column stopped separating observation from fabrication.
 * `verdict_reference.test.ts` now refuses a forbidden value drawn from the fixture's own
 * telemetry, so the defect cannot come back.
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
   * Tokens that must NOT appear in `timeline.events[].description`. On a benign fixture these
   * are binaries or chain tokens that do not occur anywhere in its telemetry: claiming them is
   * a fabrication, not a miss, and it is what keeps `EvidenceCoverage` from being vacuous on
   * the benign side (a required coverage of 0.0 is satisfied by every possible answer).
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
  /**
   * Normalized tokens this fixture's OWN telemetry contains (each event's image, command line
   * and network destination). Two consumers: the label invariant test above, and
   * `scoreIocsCorrect`, which uses it to say WHICH kind of forbidden hit fired — a
   * fixture-seeded observable echoed out of the telemetry tool, or a value the fixture does
   * not contain anywhere. Both are 0; only the second is fabrication.
   */
  seededTelemetryTokens: readonly string[];
  /** True when this package seeds the fixture; false = design proposal, cannot be scored. */
  seeded: boolean;
}

export const FIXTURE_VERDICT_REFERENCES: readonly FixtureVerdictReference[] = ENDPOINT_FIXTURES.map(
  (fixture) => ({
    id: fixture.id,
    groundTruthVerdict: fixture.groundTruthVerdict,
    requiredTimelineMarkers: fixture.timeline.required,
    forbiddenTimelineMarkers: fixture.timeline.forbidden,
    markerRationale: fixture.timeline.rationale,
    expectedIocs: fixture.iocs.expected,
    forbiddenIocs: fixture.iocs.forbidden,
    seededTelemetryTokens: seededTelemetryTokens(fixture),
    seeded: true,
  })
);

/**
 * Refuse a reference that no seeder writes. Exported separately from `requireReference` so the
 * refusal stays testable now that every slate entry is seeded: scoring a fixture with no
 * telemetry reports a model failure for a telemetry absence.
 */
export const assertSeeded = (reference: FixtureVerdictReference): FixtureVerdictReference => {
  if (!reference.seeded) {
    throw new Error(
      `Fixture "${reference.id}" is a design proposal with no seeder in this package: it cannot be scored. Add it to src/fixture_slate.ts first (see t_6f302bf4 section 5).`
    );
  }
  return reference;
};

/**
 * Resolve a fixture's reference, REFUSING an unknown id and an unseeded proposal. The
 * refusal is the point.
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
  return assertSeeded(reference);
};

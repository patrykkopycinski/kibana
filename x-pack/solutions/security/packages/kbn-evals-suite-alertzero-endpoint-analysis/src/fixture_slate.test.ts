/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  C2_DESTINATION_IP,
  ENDPOINT_FIXTURES,
  EXPLORER,
  normalizeToken,
  seededTelemetryTokens,
} from './fixture_slate';
import {
  FIXTURE_VERDICT_REFERENCES,
  assertSeeded,
  requireReference,
  type FixtureVerdictReference,
} from './verdict_reference';

const normalize = (value: string) => normalizeToken(value);

describe('endpoint fixture slate', () => {
  it('declares a unique id per fixture and one reference per fixture', () => {
    const ids = ENDPOINT_FIXTURES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(FIXTURE_VERDICT_REFERENCES.map(({ id }) => id)).toEqual(ids);
  });

  it('declares every process tree in chronological order with resolvable parents', () => {
    for (const fixture of ENDPOINT_FIXTURES) {
      const offsets = fixture.events.map(({ offsetMinutes }) => offsetMinutes);
      expect(offsets).toEqual([...offsets].sort((a, b) => b - a));
      expect(new Set(offsets).size).toBe(offsets.length);
      fixture.events.forEach((event, index) => {
        const isKnownParent = fixture.events
          .slice(0, index)
          .some((candidate) => candidate.image === event.parent);
        expect(event.parent === EXPLORER || isKnownParent).toBe(true);
      });
    }
  });

  it('keeps the two original fixtures byte-identical to the measured slate', () => {
    // Comparability guard: the L2/L3 and L2b trees are what commit c21e2bc6 measured, so a
    // change here silently invalidates every number published against it.
    expect(ENDPOINT_FIXTURES[0].events.map(({ image, commandLine }) => `${image}|${commandLine}`))
      .toEqual([
        'WINWORD.EXE|WINWORD.EXE invoice.docm',
        'powershell.exe|powershell.exe -EncodedCommand SQBFAFgA',
      ]);
    expect(ENDPOINT_FIXTURES[1].events.map(({ image, commandLine }) => `${image}|${commandLine}`))
      .toEqual([
        'WINWORD.EXE|WINWORD.EXE invoice.docx',
        'splwow64.exe|C:\\Windows\\splwow64.exe 12288',
      ]);
  });

  it('never forbids a value the fixture itself seeds', () => {
    // The L2b defect: `forbiddenIocs` used to name this fixture's own command lines. The
    // extract_iocs tool types EVERY `process.command_line` into `malicious_commands`, so any
    // analysis that echoed the tool — which the skill instructs — was scored 0 on a label it
    // could not satisfy. A forbidden value must therefore be absent from the fixture's
    // telemetry, or the column measures compliance with a contradiction.
    for (const fixture of ENDPOINT_FIXTURES) {
      const seeded = seededTelemetryTokens(fixture).map(normalize);
      const own = fixture.iocs.forbidden.filter((value) => seeded.includes(normalize(value)));
      expect({ fixture: fixture.id, own }).toEqual({ fixture: fixture.id, own: [] });
    }
    for (const reference of FIXTURE_VERDICT_REFERENCES) {
      const seeded = reference.seededTelemetryTokens.map(normalize);
      expect(
        reference.forbiddenIocs.filter((value) => seeded.includes(normalize(value)))
      ).toEqual([]);
    }
  });

  it('gates malicious fixtures on evidence and keeps benign fixtures free of required markers', () => {
    for (const fixture of ENDPOINT_FIXTURES) {
      const required = Object.values(fixture.iocs.expected).flat().length;
      if (fixture.groundTruthVerdict === 'malicious') {
        expect(fixture.timeline.required.length).toBeGreaterThan(0);
        expect(required).toBeGreaterThan(0);
      } else {
        // A required marker or a required IoC on a benign fixture is unsatisfiable by a correct
        // answer: there is nothing real to require.
        expect(fixture.timeline.required).toEqual([]);
        expect(required).toBe(0);
        expect(fixture.timeline.forbidden.length).toBeGreaterThan(0);
      }
      // Every required timeline marker is a token the fixture actually seeds (or a fragment of
      // one), so a correct reconstruction can cite it from the telemetry.
      const telemetry = fixture.events.map((event) => normalize(event.commandLine)).join(' ');
      for (const marker of fixture.timeline.required) {
        expect(normalize(telemetry)).toContain(normalize(marker));
      }
    }
  });

  it('records the C2 destination of the signed-binary fixture as a seed-only address', () => {
    const c = ENDPOINT_FIXTURES.find(({ id }) => id.startsWith('C '));
    const network = c?.events.filter((event) => event.network) ?? [];
    expect(network).toHaveLength(1);
    expect(network[0].network?.destinationIp).toBe(C2_DESTINATION_IP);
    expect(C2_DESTINATION_IP.startsWith('203.0.113.')).toBe(true);
    // The connection must be a real field on a real event, not just a label: fixture C's `ips`
    // expectation is only satisfiable because the seeder writes `destination.ip`.
    expect(c?.iocs.expected.ips).toEqual([C2_DESTINATION_IP]);
  });
});

describe('requireReference / assertSeeded', () => {
  it('refuses an unknown fixture id by name', () => {
    expect(() => requireReference('Z proposed: nowhere')).toThrow(/No verdict reference/);
  });

  it('refuses a reference with no seeder, even when it is well formed', () => {
    const unseeded: FixtureVerdictReference = {
      id: 'E proposed: benign remote-scan detection',
      groundTruthVerdict: 'benign',
      requiredTimelineMarkers: [],
      forbiddenTimelineMarkers: [],
      markerRationale: 'proposal, unseeded',
      expectedIocs: {},
      forbiddenIocs: [],
      seededTelemetryTokens: [],
      seeded: false,
    };
    expect(() => assertSeeded(unseeded)).toThrow(/cannot be scored/);
  });

  it('resolves every seeded fixture', () => {
    for (const fixture of ENDPOINT_FIXTURES) {
      expect(requireReference(fixture.id).id).toBe(fixture.id);
    }
  });
});

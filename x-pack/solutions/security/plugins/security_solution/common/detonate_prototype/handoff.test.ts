/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DETONATE_HANDOFF_MARKERS,
  detonateHandoffMarkers,
  detonateRunHandoffPath,
  needsDetonateHandoff,
  parseAlertTags,
} from '.';

describe('needsDetonateHandoff', () => {
  it.each([
    ['hunt', ['detonate:hunt-requested'], true],
    ['hunt', ['detonate:malicious'], true],
    ['hunt', ['detonate:malicious', 'detonate:hunt-done'], false],
    ['hunt', ['detonate:malicious', 'detonate:coverage-reviewed'], true],
    ['hunt', ['detonate:hunt-done', 'detonate:hunt-requested'], true],
    ['hunt', ['detonate:benign'], false],
    ['hunt', ['detonate:inconclusive', 'detonate:coverage-requested'], false],
    ['coverage', ['detonate:coverage-requested'], true],
    ['coverage', ['detonate:malicious'], true],
    ['coverage', ['detonate:malicious', 'detonate:coverage-reviewed'], false],
    ['coverage', ['detonate:malicious', 'detonate:hunt-done'], true],
    ['coverage', [], false],
  ] as const)('%s with %j → %s', (kind, tags, expected) => {
    expect(needsDetonateHandoff(kind, tags)).toBe(expected);
  });
});

describe('detonateHandoffMarkers', () => {
  it('pairs each Worker with its own two markers, all from the allowed set', () => {
    expect(detonateHandoffMarkers('hunt')).toEqual({
      requested: 'detonate:hunt-requested',
      done: 'detonate:hunt-done',
    });
    expect(detonateHandoffMarkers('coverage')).toEqual({
      requested: 'detonate:coverage-requested',
      done: 'detonate:coverage-reviewed',
    });
    expect(DETONATE_HANDOFF_MARKERS).not.toContain('detonate:malicious');
  });
});

describe('detonateRunHandoffPath', () => {
  it('encodes the run id', () => {
    expect(detonateRunHandoffPath('a/b')).toBe('/internal/detonate_prototype/runs/a%2Fb/handoff');
  });
});

describe('parseAlertTags', () => {
  it('collects every alert tag once and ignores the rest', () => {
    expect(
      parseAlertTags(['space:default', 'alert:a-1', 'alert:', 'alert:a-2', 'alert:a-1', 'demo'])
    ).toEqual(['a-1', 'a-2']);
  });
});

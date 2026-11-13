/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { detonateRunHandoffPath, parseAlertTags } from '.';

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

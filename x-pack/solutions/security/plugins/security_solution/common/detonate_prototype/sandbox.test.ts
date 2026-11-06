/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { detonateRunIngestPath, detonateSandboxStreamName } from '.';

describe('detonateSandboxStreamName', () => {
  it('names one hidden stream per space', () => {
    expect(detonateSandboxStreamName('default')).toBe('.kibana-detonate-sandbox-default');
    expect(detonateSandboxStreamName('team_a-2')).toBe('.kibana-detonate-sandbox-team_a-2');
  });

  it.each(['', 'Team', 'a*', 'a,b', '../x', 'a b', 'x'.repeat(129)])(
    'refuses %p, which could widen or break the stream name',
    (spaceId) => {
      expect(() => detonateSandboxStreamName(spaceId)).toThrow(/cannot name a sandbox/);
    }
  );
});

describe('detonateRunIngestPath', () => {
  it('encodes the run id', () => {
    expect(detonateRunIngestPath('a/b')).toBe('/internal/detonate_prototype/runs/a%2Fb/ingest');
  });
});

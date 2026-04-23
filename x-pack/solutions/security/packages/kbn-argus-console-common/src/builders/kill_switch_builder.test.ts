/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildKillSwitchState } from './kill_switch_builder';

describe('buildKillSwitchState', () => {
  it('returns bootstrap=true with autonomy enabled when the doc is missing', () => {
    const result = buildKillSwitchState({ source: undefined });
    expect(result.bootstrap).toBe(true);
    expect(result.state.autonomy_enabled).toBe(true);
  });

  it('echoes autonomy_enabled=true and optional fields from the source', () => {
    const result = buildKillSwitchState({
      source: {
        autonomy_enabled: true,
        reason: 'demo running',
        set_by: 'operator@elastic.co',
        previous_state: false,
        scope: 'global',
        '@timestamp': '2026-03-14T12:00:00.000Z',
      },
    });
    expect(result.bootstrap).toBe(false);
    expect(result.state).toEqual({
      autonomy_enabled: true,
      reason: 'demo running',
      set_by: 'operator@elastic.co',
      previous_state: false,
      scope: 'global',
      artifact_type: undefined,
      timestamp: '2026-03-14T12:00:00.000Z',
    });
  });

  it('echoes autonomy_enabled=false', () => {
    const result = buildKillSwitchState({
      source: { autonomy_enabled: false, reason: 'emergency stop' },
    });
    expect(result.state.autonomy_enabled).toBe(false);
    expect(result.state.reason).toBe('emergency stop');
  });

  it('coerces string booleans from malformed docs', () => {
    const result = buildKillSwitchState({
      source: { autonomy_enabled: 'false' as unknown as boolean },
    });
    expect(result.state.autonomy_enabled).toBe(false);
  });

  it('treats missing/garbage autonomy_enabled as disabled (fail-closed)', () => {
    const garbage = buildKillSwitchState({
      source: { autonomy_enabled: 'banana' as unknown as boolean },
    });
    expect(garbage.state.autonomy_enabled).toBe(false);

    const missing = buildKillSwitchState({ source: {} });
    expect(missing.state.autonomy_enabled).toBe(false);
  });

  it('trims whitespace-only strings to undefined', () => {
    const result = buildKillSwitchState({
      source: { autonomy_enabled: true, reason: '   ' },
    });
    expect(result.state.reason).toBeUndefined();
  });
});

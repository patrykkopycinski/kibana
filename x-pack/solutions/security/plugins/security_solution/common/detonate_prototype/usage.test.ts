/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { detonateAllowanceWindow, isAllowanceExhausted } from '.';

describe('detonateAllowanceWindow', () => {
  it('runs from 00:00 UTC on the 1st to the next 1st', () => {
    expect(detonateAllowanceWindow(new Date('2026-11-06T13:45:00.000Z'))).toEqual({
      since: '2026-11-01T00:00:00.000Z',
      resetsAt: '2026-12-01T00:00:00.000Z',
    });
  });

  it('rolls December over into January of the next year', () => {
    expect(detonateAllowanceWindow(new Date('2026-12-31T23:59:59.999Z'))).toEqual({
      since: '2026-12-01T00:00:00.000Z',
      resetsAt: '2027-01-01T00:00:00.000Z',
    });
  });

  it('uses the UTC month, not the local one', () => {
    // 00:30 on Dec 1 in UTC+1 is still November in UTC.
    expect(detonateAllowanceWindow(new Date('2026-11-30T23:30:00.000Z')).since).toBe(
      '2026-11-01T00:00:00.000Z'
    );
    expect(detonateAllowanceWindow(new Date('2026-12-01T00:00:00.000Z')).since).toBe(
      '2026-12-01T00:00:00.000Z'
    );
  });
});

describe('isAllowanceExhausted', () => {
  it('is exhausted exactly at the allowance', () => {
    expect(isAllowanceExhausted({ used: 499, allowance: 500 })).toBe(false);
    expect(isAllowanceExhausted({ used: 500, allowance: 500 })).toBe(true);
    expect(isAllowanceExhausted({ used: 503, allowance: 500 })).toBe(true);
  });

  it('treats a zero allowance as always exhausted', () => {
    expect(isAllowanceExhausted({ used: 0, allowance: 0 })).toBe(true);
  });
});

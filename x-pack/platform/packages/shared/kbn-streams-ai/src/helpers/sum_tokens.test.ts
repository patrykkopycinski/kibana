/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EMPTY_TOKENS, sumTokens } from './sum_tokens';

describe('sumTokens', () => {
  const a = { prompt: 10, completion: 20, total: 30, cached: 5 };
  const b = { prompt: 3, completion: 7, total: 10, cached: 2 };

  it('sums accumulated and added', () => {
    expect(sumTokens({ accumulated: a, added: b })).toEqual({
      prompt: 13,
      completion: 27,
      total: 40,
      cached: 7,
    });
  });

  it('defaults accumulated to EMPTY_TOKENS when only added is provided', () => {
    expect(sumTokens({ added: b })).toEqual(b);
  });

  it('returns accumulated unchanged when only accumulated is provided', () => {
    expect(sumTokens({ accumulated: a })).toEqual(a);
  });

  it('returns EMPTY_TOKENS when neither param is provided', () => {
    expect(sumTokens({})).toEqual(EMPTY_TOKENS);
  });

  it('treats missing cached on added as 0', () => {
    const noCached = { prompt: 1, completion: 2, total: 3 };
    expect(sumTokens({ accumulated: a, added: noCached })).toEqual({
      prompt: 11,
      completion: 22,
      total: 33,
      cached: 5,
    });
  });

  it('treats missing cached on accumulated as 0', () => {
    const noCached = { prompt: 1, completion: 2, total: 3 };
    expect(sumTokens({ accumulated: noCached, added: b })).toEqual({
      prompt: 4,
      completion: 9,
      total: 13,
      cached: 2,
    });
  });

  // `executeAsReasoningAgent` accumulates `thinking` across every reasoning
  // step, and `identifyFeatures` passes that total straight through this
  // helper. Dropping the field here would silently discard it again for the
  // providers that do report it.
  it('sums thinking when both sides report it', () => {
    expect(
      sumTokens({
        accumulated: { prompt: 10, completion: 20, total: 35, cached: 5, thinking: 5 },
        added: { prompt: 3, completion: 7, total: 14, cached: 2, thinking: 4 },
      })
    ).toEqual({ prompt: 13, completion: 27, total: 49, cached: 7, thinking: 9 });
  });

  it('carries thinking through when only one side reports it', () => {
    expect(sumTokens({ accumulated: a, added: { ...b, thinking: 4 } })).toEqual({
      prompt: 13,
      completion: 27,
      total: 40,
      cached: 7,
      thinking: 4,
    });
  });

  it('omits thinking entirely when neither side reports it', () => {
    expect(sumTokens({ accumulated: a, added: b })).not.toHaveProperty('thinking');
  });
});

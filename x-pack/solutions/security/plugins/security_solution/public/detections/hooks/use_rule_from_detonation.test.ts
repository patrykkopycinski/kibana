/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useGetInitialUrlParamValue } from '../../common/utils/global_query_string/helpers';
import { RULE_FROM_DETONATION_URL_PARAM, useRuleFromDetonation } from './use_rule_from_detonation';

jest.mock('../../common/utils/global_query_string/helpers');

const mockParam = (value: unknown) =>
  jest.mocked(useGetInitialUrlParamValue).mockReturnValue(() => value as never);

describe('useRuleFromDetonation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads the dedicated URL param and sets the rule once', () => {
    mockParam({ indicators: [{ type: 'ip', value: '1.2.3.4' }] });
    const setRule = jest.fn();

    const { rerender } = renderHook(() => useRuleFromDetonation(setRule));
    rerender();

    expect(useGetInitialUrlParamValue).toHaveBeenCalledWith(RULE_FROM_DETONATION_URL_PARAM);
    expect(setRule).toHaveBeenCalledTimes(1);
    expect(setRule).toHaveBeenCalledWith(
      expect.objectContaining({
        threatQueryBar: expect.objectContaining({
          query: { query: 'threat.indicator.ip : ("1.2.3.4")', language: 'kuery' },
        }),
      })
    );
  });

  it.each([
    ['missing param', null],
    ['non-object param', 'garbage'],
    ['array param', [1]],
    ['no indicators', {}],
    ['invalid indicators', { indicators: [{ type: 'bad', value: 1 }] }],
    ['indicators of the wrong shape', { indicators: 'x' }],
  ])('ignores %s', (_, value) => {
    mockParam(value);
    const setRule = jest.fn();

    expect(() => renderHook(() => useRuleFromDetonation(setRule))).not.toThrow();
    expect(setRule).not.toHaveBeenCalled();
  });
});

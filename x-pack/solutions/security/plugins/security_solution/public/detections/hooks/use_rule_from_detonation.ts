/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef } from 'react';
import type { RisonValue } from '@kbn/rison';
import { useGetInitialUrlParamValue } from '../../common/utils/global_query_string/helpers';
import type { RuleFromDetonation } from '../utils/rule_from_detonation';
import { buildRuleFromDetonation } from '../utils/rule_from_detonation';

export const RULE_FROM_DETONATION_URL_PARAM = 'createRuleFromDetonation';

export type SetRuleFromDetonation = (rule: RuleFromDetonation) => void;

/**
 * Reads the `createRuleFromDetonation` URL param (rison `{ indicators: [{ type, value }] }`)
 * once on mount and hands the derived threat query and mapping to `setRule`.
 * A missing or malformed param is ignored.
 */
export const useRuleFromDetonation = (setRule: SetRuleFromDetonation): void => {
  const getInitialUrlParamValue = useGetInitialUrlParamValue<RisonValue>(
    RULE_FROM_DETONATION_URL_PARAM
  );

  const applied = useRef(false);

  useEffect(() => {
    // Initial URL state is applied exactly once.
    if (applied.current) return;
    applied.current = true;

    const param = getInitialUrlParamValue();
    if (typeof param !== 'object' || param === null || Array.isArray(param)) return;
    const rule = buildRuleFromDetonation(param.indicators);
    if (rule) setRule(rule);
  }, [getInitialUrlParamValue, setRule]);
};

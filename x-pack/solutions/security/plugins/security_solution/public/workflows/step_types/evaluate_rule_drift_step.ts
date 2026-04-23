/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { PublicStepDefinition } from '@kbn/workflows-extensions/public';
import { evaluateRuleDriftStepCommonDefinition } from '../../../common/workflows/step_types/evaluate_rule_drift_step';

export const evaluateRuleDriftStepDefinition: PublicStepDefinition = {
  ...evaluateRuleDriftStepCommonDefinition,
  icon: React.lazy(() =>
    import('@elastic/eui/es/components/icon/assets/timeline')
      .then(({ icon }) => ({ default: icon }))
      .catch(() =>
        import('@elastic/eui/es/components/icon/assets/stats').then(({ icon }) => ({
          default: icon,
        }))
      )
  ),
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { PublicStepDefinition } from '@kbn/workflows-extensions/public';
import { argusSynthesizeAdvisoryStepCommonDefinition } from '../../../../common/workflows/step_types/argus_synthesize_advisory_step/argus_synthesize_advisory_step_common';

export const argusSynthesizeAdvisoryStepDefinition: PublicStepDefinition = {
  ...argusSynthesizeAdvisoryStepCommonDefinition,
  icon: React.lazy(() =>
    import('@elastic/eui/es/components/icon/assets/wrench')
      .then(({ icon }) => ({ default: icon }))
      .catch(() =>
        import('@elastic/eui/es/components/icon/assets/flask').then(({ icon }) => ({
          default: icon,
        }))
      )
  ),
};

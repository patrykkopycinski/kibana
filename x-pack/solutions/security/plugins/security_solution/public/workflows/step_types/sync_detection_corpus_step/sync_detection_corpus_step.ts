/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { PublicStepDefinition } from '@kbn/workflows-extensions/public';
import { syncDetectionCorpusStepCommonDefinition } from '../../../../common/workflows/step_types/sync_detection_corpus_step/sync_detection_corpus_step_common';

export const syncDetectionCorpusStepDefinition: PublicStepDefinition = {
  ...syncDetectionCorpusStepCommonDefinition,
  icon: React.lazy(() =>
    import('@elastic/eui/es/components/icon/assets/index_open')
      .then(({ icon }) => ({ default: icon }))
      .catch(() =>
        import('@elastic/eui/es/components/icon/assets/import').then(({ icon }) => ({
          default: icon,
        }))
      )
  ),
};

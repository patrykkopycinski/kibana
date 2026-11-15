/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiText } from '@elastic/eui';
import * as i18n from '../../../../detonate_prototype/translations';
import {
  DETONATION_BEHAVIOR_TEST_ID,
  DETONATION_BEHAVIOR_UNAVAILABLE_TEST_ID,
  DETONATION_NETWORK_TEST_ID,
  DETONATION_NETWORK_UNAVAILABLE_TEST_ID,
} from '../test_ids';
import { OverviewSection } from './overview_section';

/**
 * Behavior and Network are listed in the epic, but the run record carries no
 * process, file or network events yet, so both say so instead of staying empty.
 */
export const BehaviorSection = () => (
  <OverviewSection
    sectionId="behavior"
    title={i18n.OVERVIEW_BEHAVIOR_TITLE}
    defaultExpanded={false}
    data-test-subj={DETONATION_BEHAVIOR_TEST_ID}
  >
    <EuiText size="s" color="subdued" data-test-subj={DETONATION_BEHAVIOR_UNAVAILABLE_TEST_ID}>
      {i18n.OVERVIEW_TELEMETRY_UNAVAILABLE}
    </EuiText>
  </OverviewSection>
);

export const NetworkSection = () => (
  <OverviewSection
    sectionId="network"
    title={i18n.OVERVIEW_NETWORK_TITLE}
    defaultExpanded={false}
    data-test-subj={DETONATION_NETWORK_TEST_ID}
  >
    <EuiText size="s" color="subdued" data-test-subj={DETONATION_NETWORK_UNAVAILABLE_TEST_ID}>
      {i18n.OVERVIEW_TELEMETRY_UNAVAILABLE}
    </EuiText>
  </OverviewSection>
);

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactElement } from 'react';
import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import type { DetonateTask } from '../../../../common/detonate_prototype';
import { DetonationResult } from '../../../detonate_prototype/components/detonation_result';
import { JsonTab as SharedJsonTab } from '../../shared/components/json_tab';
import { SessionTab } from './session_tab';
import {
  DETONATION_DETAILS_JSON_TAB_TEST_ID,
  DETONATION_DETAILS_OVERVIEW_TAB_TEST_ID,
  DETONATION_DETAILS_SESSION_TAB_TEST_ID,
} from './test_ids';

export type DetonationPanelPaths = 'overview' | 'session' | 'json';

export const validTabIds: DetonationPanelPaths[] = ['overview', 'session', 'json'];

export interface DetonationPanelTabType {
  id: DetonationPanelPaths;
  name: ReactElement;
  content: ReactElement;
  'data-test-subj': string;
}

export interface GetTabsDisplayedOptions {
  /**
   * Id of the detonation run shown by the overview tab
   */
  taskId: string;
  /**
   * The run as returned by the API, rendered raw by the JSON tab
   */
  task: DetonateTask | undefined;
}

/**
 * Returns the tabs to display in the detonation result flyout.
 */
export const getTabsDisplayed = ({
  taskId,
  task,
}: GetTabsDisplayedOptions): DetonationPanelTabType[] => [
  {
    id: 'overview',
    'data-test-subj': DETONATION_DETAILS_OVERVIEW_TAB_TEST_ID,
    name: (
      <FormattedMessage
        id="xpack.securitySolution.flyout.detonation.header.overviewTabLabel"
        defaultMessage="Overview"
      />
    ),
    content: <DetonationResult taskId={taskId} />,
  },
  {
    id: 'session',
    'data-test-subj': DETONATION_DETAILS_SESSION_TAB_TEST_ID,
    name: (
      <FormattedMessage
        id="xpack.securitySolution.flyout.detonation.header.sessionTabLabel"
        defaultMessage="Session"
      />
    ),
    content: <SessionTab taskId={taskId} />,
  },
  {
    id: 'json',
    'data-test-subj': DETONATION_DETAILS_JSON_TAB_TEST_ID,
    name: (
      <FormattedMessage
        id="xpack.securitySolution.flyout.detonation.header.jsonTabLabel"
        defaultMessage="JSON"
      />
    ),
    content: (
      <SharedJsonTab
        value={(task ?? {}) as unknown as Record<string, unknown>}
        showFooterOffset={false}
        data-test-subj="detonation-flyout"
      />
    ),
  },
];

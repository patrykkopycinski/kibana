/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useMemo } from 'react';
import type { DetonationPanelPaths, DetonationPanelTabType } from './tabs';
import { DETONATION_DETAILS_BODY_TEST_ID } from './test_ids';

export interface ContentProps {
  /**
   * Id of the tab selected in the parent component to display its content
   */
  selectedTabId: DetonationPanelPaths;
  /**
   * Tabs displayed right below the flyout's header
   */
  tabs: DetonationPanelTabType[];
}

/**
 * Detonation flyout content that renders the selected tab's content.
 */
export const Content: FC<ContentProps> = ({ selectedTabId, tabs }) => {
  const selectedTabContent = useMemo(
    () => tabs.find((tab) => tab.id === selectedTabId)?.content,
    [selectedTabId, tabs]
  );

  return (
    <div
      data-test-subj={DETONATION_DETAILS_BODY_TEST_ID}
      className={selectedTabId === 'json' ? 'detonationJsonContent' : undefined}
      css={{ height: '100%' }}
    >
      {selectedTabContent}
    </div>
  );
};

Content.displayName = 'Content';

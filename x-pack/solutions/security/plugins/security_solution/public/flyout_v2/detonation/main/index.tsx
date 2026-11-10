/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { memo, useMemo } from 'react';
import { EuiFlyoutBody, EuiFlyoutHeader } from '@elastic/eui';
import { css } from '@emotion/react';
import { useDetonationTask } from '../../../detonate_prototype/hooks/use_detonate';
import { FLYOUT_TYPE } from '../../../common/lib/telemetry';
import { useTabs } from '../../shared/hooks/use_tabs';
import { Header } from './header';
import { Content } from './content';
import { getTabsDisplayed, type DetonationPanelPaths, validTabIds } from './tabs';
import { FLYOUT_STORAGE_KEYS } from './constants/local_storage';

/**
 * Styles applied to the EuiFlyoutBody so the JSON tab's Monaco editor
 * fills the available height without producing a scrollbar.
 */
export const detonationFlyoutBodyCss = css({
  '.euiFlyoutBody__overflowContent': { blockSize: '100%' },
  '.detonationJsonContent > *': {
    height: '100%',
    '& > *:first-child': { flexGrow: 0 },
    '& > *:last-child': { minHeight: 0 },
  },
  '.react-monaco-editor-container': { height: '100% !important' },
});

export interface DetonationDetailsProps {
  /**
   * Id of the detonation run to show
   */
  taskId: string;
}

/**
 * Detonation result system flyout content.
 */
export const DetonationDetails: FC<DetonationDetailsProps> = memo(({ taskId }) => {
  const { data: task } = useDetonationTask(taskId);

  const { selectedTabId, setSelectedTabId } = useTabs<DetonationPanelPaths>({
    validTabIds,
    storageKey: FLYOUT_STORAGE_KEYS.SELECTED_TAB,
    flyoutType: FLYOUT_TYPE.DETONATION,
  });

  const tabs = useMemo(() => getTabsDisplayed({ taskId, task }), [taskId, task]);

  return (
    <>
      <EuiFlyoutHeader>
        <Header
          taskId={taskId}
          task={task}
          tabs={tabs}
          selectedTabId={selectedTabId}
          setSelectedTabId={setSelectedTabId}
        />
      </EuiFlyoutHeader>
      <EuiFlyoutBody css={detonationFlyoutBodyCss}>
        <Content tabs={tabs} selectedTabId={selectedTabId} />
      </EuiFlyoutBody>
    </>
  );
});

DetonationDetails.displayName = 'DetonationDetails';

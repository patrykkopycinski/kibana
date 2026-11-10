/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiTab, EuiTabs, EuiText } from '@elastic/eui';
import type { FC } from 'react';
import React, { memo, useMemo } from 'react';
import { FormattedRelative } from '@kbn/i18n-react';
import type { DetonateTask } from '../../../../common/detonate_prototype';
import { DetonationStatusBadge } from '../../../detonate_prototype/components/detonation_status_badge';
import { DetonateVerdictBadge } from '../../../detonate_prototype/components/verdict_badge';
import { FlyoutHeaderActions } from '../../shared/components/flyout_header_actions';
import { FlyoutTitle } from '../../shared/components/flyout_title';
import type { DetonationPanelPaths, DetonationPanelTabType } from './tabs';
import { DETONATION_DETAILS_TITLE_TEST_ID } from './test_ids';

export interface HeaderProps {
  /**
   * Id of the run; used as the title until the run has loaded
   */
  taskId: string;
  /**
   * The run, once loaded
   */
  task: DetonateTask | undefined;
  /**
   * Id of the tab selected in the parent component to display its content
   */
  selectedTabId: DetonationPanelPaths;
  /**
   * Callback to set the selected tab id in the parent component
   */
  setSelectedTabId: (selected: DetonationPanelPaths) => void;
  /**
   * Tabs to display in the header
   */
  tabs: DetonationPanelTabType[];
}

/**
 * Header of the detonation result flyout: file name, verdict, status and tabs.
 */
export const Header: FC<HeaderProps> = memo(
  ({ taskId, task, selectedTabId, setSelectedTabId, tabs }) => {
    const renderTabs = useMemo(
      () =>
        tabs.map((tab) => (
          <EuiTab
            onClick={() => setSelectedTabId(tab.id)}
            isSelected={tab.id === selectedTabId}
            key={tab.id}
            data-test-subj={tab['data-test-subj']}
          >
            {tab.name}
          </EuiTab>
        )),
      [setSelectedTabId, selectedTabId, tabs]
    );

    return (
      <>
        <FlyoutHeaderActions />
        <FlyoutTitle
          title={task?.sample_filename ?? task?.sample_hash ?? taskId}
          data-test-subj={DETONATION_DETAILS_TITLE_TEST_ID}
        />
        {task && (
          <>
            <EuiSpacer size="s" />
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap>
              <EuiFlexItem grow={false}>
                <DetonateVerdictBadge task={task} />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <DetonationStatusBadge task={task} showProgress />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  <FormattedRelative value={new Date(task.created_at)} />
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </>
        )}
        <EuiSpacer size="s" />
        <EuiTabs size="l" expand>
          {renderTabs}
        </EuiTabs>
      </>
    );
  }
);

Header.displayName = 'Header';

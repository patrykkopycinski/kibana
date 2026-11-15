/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
} from '@elastic/eui';
import type { FC } from 'react';
import React, { memo, useMemo } from 'react';
import { FormattedRelative } from '@kbn/i18n-react';
import type { DetonateTask } from '../../../../common/detonate_prototype';
import {
  deriveDetonateVerdict,
  detonationConfidence,
  isDetonationComplete,
  totalDetonationAlerts,
} from '../../../../common/detonate_prototype';
import { DetonationStatusBadge } from '../../../detonate_prototype/components/detonation_status_badge';
import { DetonateVerdictBadge } from '../../../detonate_prototype/components/verdict_badge';
import { useDetonationTaskUpdates } from '../../../detonate_prototype/hooks/use_detonate';
import * as i18n from '../../../detonate_prototype/translations';
import { FlyoutHeaderActions } from '../../shared/components/flyout_header_actions';
import { FlyoutTitle } from '../../shared/components/flyout_title';
import { CONFIDENCE_LABEL } from './utils/detonation_labels';
import type { DetonationPanelPaths, DetonationPanelTabType } from './tabs';
import {
  DETONATION_DETAILS_META_ALERTS_TEST_ID,
  DETONATION_DETAILS_META_DURATION_TEST_ID,
  DETONATION_DETAILS_META_STATUS_TEST_ID,
  DETONATION_DETAILS_META_TEST_ID,
  DETONATION_DETAILS_META_VERDICT_TEST_ID,
  DETONATION_DETAILS_TITLE_TEST_ID,
} from './test_ids';
import { formatDetonationDuration, getDetonationDurationMs } from './utils/detonation_duration';

interface MetaCardProps {
  title: string;
  'data-test-subj': string;
  children: React.ReactNode;
}

const MetaCard: FC<MetaCardProps> = ({ title, 'data-test-subj': dataTestSubj, children }) => (
  <EuiFlexItem data-test-subj={dataTestSubj}>
    <EuiPanel hasShadow={false} hasBorder paddingSize="s">
      <EuiText size="xs" color="subdued">
        {title}
      </EuiText>
      <EuiSpacer size="xs" />
      <EuiText size="s">{children}</EuiText>
    </EuiPanel>
  </EuiFlexItem>
);

/**
 * Status, verdict, alert count and duration of the run, as cards under the title.
 */
const MetaCards: FC<{ task: DetonateTask }> = ({ task }) => {
  const isComplete = isDetonationComplete(task);
  const { data: updates } = useDetonationTaskUpdates(task.id, isComplete);
  const { verdict } = deriveDetonateVerdict(task);
  const hasAlertsCount = [
    task.production_endpoint_alerts_count,
    task.diagnostic_endpoint_alerts_count,
    task.production_detection_alerts_count,
  ].some((count) => count !== undefined);
  const durationMs = getDetonationDurationMs(task, updates);

  return (
    <EuiFlexGroup
      gutterSize="s"
      responsive={false}
      data-test-subj={DETONATION_DETAILS_META_TEST_ID}
    >
      <MetaCard title={i18n.META_STATUS} data-test-subj={DETONATION_DETAILS_META_STATUS_TEST_ID}>
        <DetonationStatusBadge task={task} showProgress />
      </MetaCard>
      <MetaCard title={i18n.META_VERDICT} data-test-subj={DETONATION_DETAILS_META_VERDICT_TEST_ID}>
        {verdict ? (
          <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <DetonateVerdictBadge task={task} />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {CONFIDENCE_LABEL[detonationConfidence(verdict)]}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        ) : (
          i18n.META_EMPTY
        )}
      </MetaCard>
      <MetaCard title={i18n.META_ALERTS} data-test-subj={DETONATION_DETAILS_META_ALERTS_TEST_ID}>
        {hasAlertsCount ? totalDetonationAlerts(task) : i18n.META_EMPTY}
      </MetaCard>
      <MetaCard
        title={i18n.META_DURATION}
        data-test-subj={DETONATION_DETAILS_META_DURATION_TEST_ID}
      >
        {durationMs === undefined ? i18n.META_EMPTY : formatDetonationDuration(durationMs)}
      </MetaCard>
    </EuiFlexGroup>
  );
};

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
 * Header of the detonation result flyout: file name, meta cards and tabs.
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
            <EuiText size="xs" color="subdued">
              <FormattedRelative value={new Date(task.created_at)} />
            </EuiText>
            <EuiSpacer size="s" />
            <MetaCards task={task} />
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

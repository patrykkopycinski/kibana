/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — detail page.
 *
 * Shows one run while it is happening and the alerts it produced once it is
 * over. Completion comes from the shared predicate, so the page stops polling
 * on failure as well as on success — the case a naive "wait for the last
 * worker" poller hangs on forever.
 */

import React, { useCallback } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingLogo,
  EuiPageHeader,
  EuiPanel,
  EuiSpacer,
} from '@elastic/eui';
import type { EuiDescriptionListProps } from '@elastic/eui';
import { KbnDangerCallout, KbnInfoCallout } from '@kbn/ui-callout';
import { FormattedRelative } from '@kbn/i18n-react';

import {
  DETONATE_PROTOTYPE_APP_PATH,
  detonationWasQuiet,
  isDetonationComplete,
  isDetonationFailed,
} from '../../../common/detonate_prototype';
import type { DetonateTask } from '../../../common/detonate_prototype';
import { useDetonationTask } from '../hooks/use_detonate';
import { DetonationStatusBadge } from '../components/detonation_status_badge';
import { DetonateVerdictBadge } from '../components/verdict_badge';
import { WorkerTimeline } from '../components/worker_timeline';
import { DetectionAlertGroups, EndpointAlertGroups } from '../components/alert_groups';
import * as i18n from '../translations';

export const DETAIL_PAGE_TEST_ID = 'detonatePrototypeDetailPage';
export const DETAIL_FAILURE_TEST_ID = 'detonatePrototypeDetailFailure';
export const DETAIL_QUIET_TEST_ID = 'detonatePrototypeDetailQuiet';

const details = (task: DetonateTask): EuiDescriptionListProps['listItems'] => {
  const items: EuiDescriptionListProps['listItems'] = [
    { title: 'Task ID', description: task.id },
    {
      title: 'Submitted',
      description: <FormattedRelative value={new Date(task.created_at)} />,
    },
    { title: 'Agent version', description: task.agent_version },
    { title: 'Telemetry cluster', description: task.telemetry_cluster_version },
  ];

  if (task.sample_filename) {
    items.push({ title: 'Sample filename', description: task.sample_filename });
  }
  if (task.sample_source) {
    items.push({ title: 'Sample source', description: task.sample_source });
  }
  if (task.vm_os_family || task.vm_architecture) {
    items.push({
      title: 'VM',
      description: [task.vm_os_family, task.vm_architecture].filter(Boolean).join(' / '),
    });
  }
  if (task.elastic_agent_id) {
    items.push({ title: 'Elastic Agent ID', description: task.elastic_agent_id });
  }
  if (task.tags.length) {
    items.push({
      title: 'Tags',
      description: (
        <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
          {task.tags.map((tag) => (
            <EuiFlexItem grow={false} key={tag}>
              <EuiBadge color="hollow">{tag}</EuiBadge>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      ),
    });
  }

  return items;
};

export const DetonateDetailPage = React.memo(() => {
  const { taskId } = useParams<{ taskId: string }>();
  const history = useHistory();
  const { data: task, isLoading, isError, error } = useDetonationTask(taskId);

  const goBack = useCallback(() => history.push(DETONATE_PROTOTYPE_APP_PATH), [history]);

  const backButton = (
    <EuiButtonEmpty
      iconType="arrowLeft"
      onClick={goBack}
      data-test-subj="detonatePrototypeBackToRuns"
    >
      {i18n.BACK_TO_RUNS}
    </EuiButtonEmpty>
  );

  if (isLoading && !task) {
    return (
      <div data-test-subj={DETAIL_PAGE_TEST_ID}>
        <EuiLoadingLogo logo="logoSecurity" size="xl" />
      </div>
    );
  }

  if (isError || !task) {
    const body = (error as { body?: { message?: string } } | undefined)?.body;
    return (
      <div data-test-subj={DETAIL_PAGE_TEST_ID}>
        {backButton}
        <EuiSpacer size="m" />
        <KbnDangerCallout announceOnMount title={body?.message ?? i18n.DETONATION_NOT_FOUND} />
      </div>
    );
  }

  const failed = isDetonationFailed(task);
  const complete = isDetonationComplete(task);
  const quiet = detonationWasQuiet(task);

  return (
    <div data-test-subj={DETAIL_PAGE_TEST_ID}>
      {backButton}
      <EuiSpacer size="s" />

      <EuiPageHeader
        pageTitle={task.sample_filename ?? task.sample_hash ?? task.id}
        rightSideItems={[
          <DetonateVerdictBadge task={task} />,
          <DetonationStatusBadge task={task} showProgress />,
        ]}
      />
      <EuiSpacer size="l" />

      {failed && (
        <>
          <KbnDangerCallout
            announceOnMount
            title={i18n.STATUS_FAILED}
            text={task.last_worker_status_details ?? task.last_worker_name}
            data-test-subj={DETAIL_FAILURE_TEST_ID}
          />
          <EuiSpacer size="l" />
        </>
      )}

      {quiet && (
        <>
          <KbnInfoCallout
            announceOnMount
            title={i18n.QUIET_RUN_TITLE}
            text={i18n.QUIET_RUN_BODY}
            data-test-subj={DETAIL_QUIET_TEST_ID}
          />
          <EuiSpacer size="l" />
        </>
      )}

      <EuiPanel hasBorder>
        <EuiDescriptionList
          type="column"
          columnWidths={[1, 3]}
          listItems={details(task)}
          data-test-subj="detonatePrototypeDetails"
        />
      </EuiPanel>

      {/* Progress lives beside the details while the run is in flight. */}
      {!complete && (
        <>
          <EuiSpacer size="l" />
          <WorkerTimeline taskId={task.id} isComplete={complete} />
        </>
      )}
      <EuiSpacer size="l" />

      <EuiFlexGroup direction="column" gutterSize="l">
        <EuiFlexItem>
          <EndpointAlertGroups
            title={i18n.PRODUCTION_ENDPOINT_ALERTS}
            total={task.production_endpoint_alerts_count}
            groups={task.production_endpoint_alert_groups}
            testSubj="detonatePrototypeProductionEndpointAlerts"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <DetectionAlertGroups
            title={i18n.PRODUCTION_DETECTION_ALERTS}
            total={task.production_detection_alerts_count}
            groups={task.production_detection_alert_groups}
            testSubj="detonatePrototypeProductionDetectionAlerts"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EndpointAlertGroups
            title={i18n.DIAGNOSTIC_ENDPOINT_ALERTS}
            total={task.diagnostic_endpoint_alerts_count}
            groups={task.diagnostic_endpoint_alert_groups}
            testSubj="detonatePrototypeDiagnosticEndpointAlerts"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      {/* The page keeps polling until the shared predicate says the run is over. */}
      {!complete && <EuiSpacer size="l" />}
    </div>
  );
});
DetonateDetailPage.displayName = 'DetonateDetailPage';

// eslint-disable-next-line import/no-default-export
export default DetonateDetailPage;

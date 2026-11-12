/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — the content of one run.
 *
 * Shows a run while it is happening and the alerts it produced once it is
 * over. Completion comes from the shared predicate, so the poll stops on
 * failure as well as on success — the case a naive "wait for the last worker"
 * poller hangs on forever. Rendered inside the detonation result flyout.
 */

import React from 'react';
import {
  EuiBadge,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingLogo,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { EuiDescriptionListProps } from '@elastic/eui';
import { KbnDangerCallout, KbnInfoCallout } from '@kbn/ui-callout';
import { FormattedRelative } from '@kbn/i18n-react';

import {
  detonationWasBenign,
  diagnosticOnlyEventCodes,
  isDetonationComplete,
  isDetonationFailed,
  runHistoryIncluding,
} from '../../../common/detonate_prototype';
import type { DetonateTask } from '../../../common/detonate_prototype';
import { useDetonationTask, useCompletedDetonationHistoryByHash } from '../hooks/use_detonate';
import { WorkerTimeline } from './worker_timeline';
import { RunHistory } from './run_history';
import { BehaviorDiffCard } from './behavior_diff_card';
import { DetectionAlertGroups, EndpointAlertGroups } from './alert_groups';
import * as i18n from '../translations';

export const DETAIL_PAGE_TEST_ID = 'detonatePrototypeDetailPage';
export const DETAIL_FAILURE_TEST_ID = 'detonatePrototypeDetailFailure';
export const DETAIL_BENIGN_TEST_ID = 'detonatePrototypeDetailBenign';
export const DETAIL_COVERAGE_GAP_TEST_ID = 'detonatePrototypeDetailCoverageGap';

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
  if (task.vm_os_family) {
    items.push({ title: 'VM', description: task.vm_os_family });
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

interface DetonationResultProps {
  taskId: string;
}

export const DetonationResult = React.memo<DetonationResultProps>(({ taskId }) => {
  const { data: task, isLoading, isError, error } = useDetonationTask(taskId);

  // The run history needs the hash, which the task carries — the hook is
  // disabled until the task resolves and re-fetches once it does.
  const historyByHash = useCompletedDetonationHistoryByHash(task?.sample_hash);

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
        <KbnDangerCallout announceOnMount title={body?.message ?? i18n.DETONATION_NOT_FOUND} />
      </div>
    );
  }

  const failed = isDetonationFailed(task);
  const complete = isDetonationComplete(task);
  const benign = detonationWasBenign(task);
  const coverageGap = complete && !failed ? diagnosticOnlyEventCodes(task) : [];

  // The viewed run counts toward the streak: three benign runs in a row includes
  // the one on screen.
  const historyRuns = runHistoryIncluding(task, historyByHash.completedRuns ?? []);

  return (
    <div data-test-subj={DETAIL_PAGE_TEST_ID}>
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

      {benign && (
        <>
          <KbnInfoCallout
            announceOnMount
            title={i18n.BENIGN_RUN_TITLE}
            text={i18n.BENIGN_RUN_BODY}
            data-test-subj={DETAIL_BENIGN_TEST_ID}
          />
          <EuiSpacer size="l" />
        </>
      )}

      {/* The gap panel only appears when there is a gap: a run production
          covered fully needs no "potential coverage gap" hedging, and a benign
          run already has its own callout above. */}
      {coverageGap.length > 0 && (
        <>
          <EuiPanel hasBorder data-test-subj={DETAIL_COVERAGE_GAP_TEST_ID}>
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiTitle size="xs">
                  <h3>{i18n.COVERAGE_GAP_TITLE}</h3>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color="warning">{coverageGap.length}</EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
            <EuiText size="s" color="subdued">
              {i18n.COVERAGE_GAP_BODY}
            </EuiText>
            <EuiSpacer size="s" />
            <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
              {coverageGap.map((code) => (
                <EuiFlexItem grow={false} key={code}>
                  <EuiBadge color="hollow">{code}</EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </EuiPanel>
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

      {/* F7: every completed run of the same sample, this one included.
          Rendered for every run — a single-run history is honest too — but
          only after completion, when the streak the proposal cites can
          actually exist. */}
      {complete && task.sample_hash && (
        <EuiFlexGroup gutterSize="l" responsive={false}>
          <EuiFlexItem>
            <RunHistory runs={historyRuns} hash={task.sample_hash} />
          </EuiFlexItem>
          <EuiFlexItem>
            <BehaviorDiffCard taskId={task.id} />
          </EuiFlexItem>
        </EuiFlexGroup>
      )}

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
    </div>
  );
});
DetonationResult.displayName = 'DetonationResult';

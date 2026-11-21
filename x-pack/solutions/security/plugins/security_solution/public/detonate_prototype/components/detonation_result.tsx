/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — the content of one run.
 *
 * The Overview tab of the detonation result flyout: one collapsible section
 * per block, in the order the epic lists them. Completion comes from the
 * shared predicate, so polling stops on failure as well as on success — the
 * case a naive "wait for the last worker" poller hangs on forever.
 */

import React, { useMemo } from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiLoadingLogo,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { KbnDangerCallout, KbnInfoCallout } from '@kbn/ui-callout';

import {
  detonationWasBenign,
  diagnosticOnlyEventCodes,
  isDetonationComplete,
  isDetonationFailed,
  runHistoryIncluding,
} from '../../../common/detonate_prototype';
import {
  useCompletedDetonationHistoryByHash,
  useDetonationRecord,
  useDetonationTask,
} from '../hooks/use_detonate';
import { RunHistory } from './run_history';
import { BehaviorDiffCard } from './behavior_diff_card';
import { AiSummarySection } from '../../flyout_v2/detonation/main/components/ai_summary_section';
import { HighlightedFieldsSection } from '../../flyout_v2/detonation/main/components/highlighted_fields_section';
import { IndicatorsSection } from '../../flyout_v2/detonation/main/components/indicators_section';
import { ProgressSection } from '../../flyout_v2/detonation/main/components/progress_section';
import { RunDetailsSection } from '../../flyout_v2/detonation/main/components/run_details_section';
import { SandboxAlertsSection } from '../../flyout_v2/detonation/main/components/sandbox_alerts_section';
import {
  BehaviorSection,
  NetworkSection,
} from '../../flyout_v2/detonation/main/components/telemetry_unavailable_sections';
import {
  DETONATION_OVERVIEW_FORK_ONLY_TEST_ID,
  DETONATION_OVERVIEW_QUEUED_NOTE_TEST_ID,
  DETONATION_OVERVIEW_TEST_ID,
} from '../../flyout_v2/detonation/main/test_ids';
import { getDetonationIndicators } from '../../flyout_v2/detonation/main/utils/detonation_indicators';
import { isDetonationQueued } from '../../flyout_v2/detonation/main/utils/detonation_queued';
import * as i18n from '../translations';

export const DETAIL_PAGE_TEST_ID = 'detonatePrototypeDetailPage';
export const DETAIL_FAILURE_TEST_ID = 'detonatePrototypeDetailFailure';
export const DETAIL_BENIGN_TEST_ID = 'detonatePrototypeDetailBenign';
export const DETAIL_COVERAGE_GAP_TEST_ID = 'detonatePrototypeDetailCoverageGap';

interface DetonationResultProps {
  taskId: string;
}

export const DetonationResult = React.memo<DetonationResultProps>(({ taskId }) => {
  const { data: task, isLoading, isError, error } = useDetonationTask(taskId);

  // The run history needs the hash, which the task carries — the hook is
  // disabled until the task resolves and re-fetches once it does.
  const historyByHash = useCompletedDetonationHistoryByHash(task?.sample_hash ?? undefined);

  const complete = task ? isDetonationComplete(task) : false;
  // Indicators come from alerts, which are final only when the run is, so the
  // record is read once the run is over.
  const {
    data: record,
    isLoading: recordLoading,
    isError: recordError,
    isFetching: recordFetching,
    refetch: refetchRecord,
  } = useDetonationRecord(task?.id, complete);
  const indicators = useMemo(() => getDetonationIndicators(record), [record]);

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
  const queued = isDetonationQueued(task);
  const benign = detonationWasBenign(task);
  const coverageGap = complete && !failed ? diagnosticOnlyEventCodes(task) : [];
  const pending = !complete || recordLoading;

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

      <div data-test-subj={DETONATION_OVERVIEW_TEST_ID}>
        <AiSummarySection task={task} />
        <EuiHorizontalRule margin="m" />
        <ProgressSection task={task} />
        <EuiHorizontalRule margin="m" />

        {queued ? (
          <KbnInfoCallout
            title={i18n.OVERVIEW_QUEUED_NOTE_TITLE}
            text={i18n.OVERVIEW_QUEUED_NOTE_BODY}
            data-test-subj={DETONATION_OVERVIEW_QUEUED_NOTE_TEST_ID}
          />
        ) : (
          <>
            <HighlightedFieldsSection
              task={task}
              indicators={indicators}
              pending={pending}
              recordError={recordError}
            />
            <EuiHorizontalRule margin="m" />
            <SandboxAlertsSection task={task} />
            <EuiHorizontalRule margin="m" />
            {/* Visualizations (Phase F) and Response (Phase G, blocked on the
                rule id) go here; neither is built yet, so neither is rendered. */}
            <BehaviorSection />
            <EuiHorizontalRule margin="m" />
            <NetworkSection />
            <EuiHorizontalRule margin="m" />
            <IndicatorsSection
              taskId={task.id}
              createdAt={task.created_at}
              indicators={indicators}
              pending={pending}
              recordError={recordError}
              onRetry={() => refetchRecord()}
              retrying={recordFetching}
            />
            <EuiHorizontalRule margin="m" />
            <RunDetailsSection task={task} record={record} />
          </>
        )}
      </div>

      {/* fork-only, dropped in the upstream cut: none of these blocks is in the
          epic's Overview list. */}
      {!queued && (
        <div data-test-subj={DETONATION_OVERVIEW_FORK_ONLY_TEST_ID}>
          <EuiSpacer size="l" />
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
              covered fully needs no "potential coverage gap" hedging, and a
              benign run already has its own callout above. */}
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

          {/* Every completed run of the same sample, this one included. Only
              after completion, when the streak the history cites can exist. */}
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
        </div>
      )}
    </div>
  );
});
DetonationResult.displayName = 'DetonationResult';

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useMemo, useState } from 'react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';
import { EuiButton, EuiButtonEmpty, EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import { FormattedRelative } from '@kbn/i18n-react';
import { KbnWarningCallout } from '@kbn/ui-callout';
import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';
import { ExpandablePanel } from '../../../shared/components/expandable_panel';
import { useFlyoutApi } from '../../../use_flyout_api';
import { DetonationStateBadge } from '../../../../detonate_prototype/components/detonation_state_badge';
import { DetonateVerdictNameBadge } from '../../../../detonate_prototype/components/verdict_badge';
import { SubmitModal } from '../../../../detonate_prototype/components/submit_modal';
import { getDetonatableHash } from '../../../../detonate_prototype/hooks/detonatable_hash';
import { useCanSubmitDetonation } from '../../../../detonate_prototype/hooks/use_can_submit_detonation';
import {
  useDetonateUsage,
  useDetonationCardRuns,
} from '../../../../detonate_prototype/hooks/use_detonate';
import { CONFIDENCE_LABEL } from '../../../detonation/main/utils/detonation_labels';
import * as i18n from '../../../../detonate_prototype/translations';
import {
  DETONATE_VM_OS_FAMILIES,
  detonateOsFamilyFromHostOsType,
  isAllowanceExhausted,
} from '../../../../../common/detonate_prototype';
import type {
  DetonateTask,
  DetonateVmOsFamily,
  DetonationRecord,
  DetonationStep,
} from '../../../../../common/detonate_prototype';
import { DETONATION_OVERVIEW_TEST_ID } from './test_ids';

export const DETONATION_OVERVIEW_CONTENT_TEST_ID = `${DETONATION_OVERVIEW_TEST_ID}Body` as const;
export const DETONATION_OVERVIEW_OPEN_RESULT_TEST_ID =
  `${DETONATION_OVERVIEW_TEST_ID}OpenResult` as const;
export const DETONATION_OVERVIEW_DETONATE_TEST_ID =
  `${DETONATION_OVERVIEW_TEST_ID}Detonate` as const;
export const DETONATION_OVERVIEW_RERUN_TEST_ID = `${DETONATION_OVERVIEW_TEST_ID}Rerun` as const;
export const DETONATION_OVERVIEW_ALLOWANCE_TEST_ID =
  `${DETONATION_OVERVIEW_TEST_ID}Allowance` as const;
export const DETONATION_OVERVIEW_UNSUPPORTED_OS_TEST_ID =
  `${DETONATION_OVERVIEW_TEST_ID}UnsupportedOs` as const;
export const DETONATION_OVERVIEW_PRIOR_RUN_TEST_ID =
  `${DETONATION_OVERVIEW_TEST_ID}PriorRun` as const;
export const DETONATION_OVERVIEW_FAILED_TEST_ID = `${DETONATION_OVERVIEW_TEST_ID}Failed` as const;
export const DETONATION_OVERVIEW_COUNTS_TEST_ID = `${DETONATION_OVERVIEW_TEST_ID}Counts` as const;

const OS_LABELS: Readonly<Record<DetonateVmOsFamily, string>> = {
  linux: i18n.ALERT_CARD_OS_LINUX,
  windows: i18n.ALERT_CARD_OS_WINDOWS,
  darwin: i18n.ALERT_CARD_OS_MACOS,
};

const getStringField = (hit: DataTableRecord, field: string): string | undefined => {
  const value = getFieldValue(hit, field);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const stepOf = (run: DetonationRecord): DetonationStep | undefined => {
  const step = run['detonate.step.number'];
  return step === undefined
    ? undefined
    : {
        step,
        of: run['detonate.step.of'] ?? step,
        label: run['detonate.step.label'] ?? '',
        worker: run['detonate.step.worker'] ?? '',
      };
};

interface DetonateButtonProps {
  label: string;
  onClick: () => void;
  'data-test-subj': string;
}

/**
 * A submit button that gives way to the allowance message once the month's allowance is spent.
 * Usage is read here, not in the card, so a card showing a finished run makes no usage request.
 *
 * Epic #20877 §6: no "Request more allowance" button, only the reset date; pending product answer.
 */
const DetonateButton: FC<DetonateButtonProps> = ({
  label,
  onClick,
  'data-test-subj': dataTestSubj,
}) => {
  const canSubmit = useCanSubmitDetonation();
  const { data: usage } = useDetonateUsage();

  if (!canSubmit) {
    return null;
  }
  if (usage && isAllowanceExhausted(usage)) {
    return (
      <KbnWarningCallout
        announceOnMount
        size="s"
        title={i18n.SUBMIT_MODAL_ALLOWANCE_EXHAUSTED(
          new Date(usage.resetsAt).toLocaleDateString(undefined, {
            timeZone: 'UTC',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        )}
        data-test-subj={DETONATION_OVERVIEW_ALLOWANCE_TEST_ID}
      />
    );
  }
  return (
    <EuiButton size="s" onClick={onClick} data-test-subj={dataTestSubj}>
      {label}
    </EuiButton>
  );
};

interface RunSummaryProps {
  run: DetonationRecord;
}

const RunSummary: FC<RunSummaryProps> = ({ run }) => {
  const state = run['detonate.state'];
  const verdict = run['detonate.verdict'];
  const confidence = run['detonate.confidence'];
  const iocCount =
    (run['detonate.iocs.domains']?.length ?? 0) +
    (run['detonate.iocs.ips']?.length ?? 0) +
    (run['detonate.iocs.file_hashes']?.length ?? 0);

  return (
    <EuiFlexGroup direction="column" gutterSize="s" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap>
          <EuiFlexItem grow={false}>
            {state === 'complete' && verdict ? (
              <DetonateVerdictNameBadge verdict={verdict} evidence={run['detonate.evidence']} />
            ) : (
              <DetonationStateBadge state={state} step={stepOf(run)} />
            )}
          </EuiFlexItem>
          {state === 'complete' && confidence && (
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {CONFIDENCE_LABEL[confidence]}
              </EuiText>
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              <FormattedRelative value={run['@timestamp']} />
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      {state === 'failed' && (
        <EuiFlexItem grow={false}>
          <EuiText size="s" data-test-subj={DETONATION_OVERVIEW_FAILED_TEST_ID}>
            {run['detonate.step.details'] ?? i18n.ALERT_CARD_FAILED_FALLBACK}
          </EuiText>
        </EuiFlexItem>
      )}
      {state === 'complete' && (
        <EuiFlexItem grow={false}>
          <EuiText size="s" data-test-subj={DETONATION_OVERVIEW_COUNTS_TEST_ID}>
            <ul>
              <li>{`${i18n.PRODUCTION_ENDPOINT_ALERTS}: ${
                run['detonate.alerts.production_endpoint'] ?? 0
              }`}</li>
              <li>{`${i18n.PRODUCTION_DETECTION_ALERTS}: ${
                run['detonate.alerts.production_detection'] ?? 0
              }`}</li>
              {/*
               * Epic #20877 §6: "Behaviors" counts `endpoint_event_codes` as a proxy; pending
               * product answer on the real definition.
               */}
              <li>{`${i18n.ALERT_CARD_BEHAVIORS}: ${
                run['detonate.endpoint_event_codes']?.length ?? 0
              }`}</li>
              <li>{`${i18n.ALERT_CARD_IOCS}: ${iocCount}`}</li>
            </ul>
          </EuiText>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};

interface DetonationOverviewContentProps {
  hit: DataTableRecord;
  hash: string;
}

const DetonationOverviewContent: FC<DetonationOverviewContentProps> = ({ hit, hash }) => {
  const { openDetonationFlyout } = useFlyoutApi();
  const [isModalVisible, setIsModalVisible] = useState(false);

  const alertId = hit.raw._id ?? '';
  const { alertRuns, hashRuns } = useDetonationCardRuns({ alertId, hash });

  const alertRun = alertRuns.data?.hits[0];
  const priorRun = alertRun ? undefined : hashRuns.data?.hits[0];
  const run = alertRun ?? priorRun;

  const hostOsType = getStringField(hit, 'host.os.type');
  const isUnsupportedOs =
    hostOsType !== undefined && detonateOsFamilyFromHostOsType(hostOsType) === undefined;

  const hostName = getStringField(hit, 'host.name');
  const userName = getStringField(hit, 'user.name');
  const filePath = getStringField(hit, 'file.path') ?? getStringField(hit, 'process.executable');

  const initialTags = useMemo(() => (alertId ? [`alert:${alertId}`] : []), [alertId]);
  const initialOrigin = useMemo(
    () => ({
      ...(alertId ? { alert_ids: [alertId] } : {}),
      ...(hostName ? { host_name: hostName } : {}),
      ...(userName ? { user_name: userName } : {}),
      ...(filePath ? { file_path: filePath } : {}),
    }),
    [alertId, filePath, hostName, userName]
  );

  const openResult = useCallback(
    (taskId: string) => {
      setIsModalVisible(false);
      openDetonationFlyout({ taskId });
    },
    [openDetonationFlyout]
  );
  const onSubmitted = useCallback((task: DetonateTask) => openResult(task.id), [openResult]);
  const openModal = useCallback(() => setIsModalVisible(true), []);
  const closeModal = useCallback(() => setIsModalVisible(false), []);
  const openRunResult = useCallback(() => {
    if (run) {
      openResult(run['detonate.task_id']);
    }
  }, [openResult, run]);

  const osList = DETONATE_VM_OS_FAMILIES.map((family) => OS_LABELS[family]).join(', ');

  let body: React.ReactNode;
  if (run) {
    body = (
      <EuiFlexGroup direction="column" gutterSize="s" responsive={false}>
        {priorRun && (
          <EuiFlexItem grow={false}>
            <EuiText
              size="xs"
              color="subdued"
              data-test-subj={DETONATION_OVERVIEW_PRIOR_RUN_TEST_ID}
            >
              {i18n.ALERT_CARD_PRIOR_RUN_ELSEWHERE}
            </EuiText>
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <RunSummary run={run} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="s"
                flush="left"
                onClick={openRunResult}
                data-test-subj={DETONATION_OVERVIEW_OPEN_RESULT_TEST_ID}
              >
                {i18n.ALERT_CARD_OPEN_RESULT}
              </EuiButtonEmpty>
            </EuiFlexItem>
            {run['detonate.state'] === 'failed' && (
              <EuiFlexItem grow={false}>
                <DetonateButton
                  label={i18n.FOOTER_RERUN}
                  onClick={openModal}
                  data-test-subj={DETONATION_OVERVIEW_RERUN_TEST_ID}
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  } else if (isUnsupportedOs) {
    body = (
      <EuiText size="s" data-test-subj={DETONATION_OVERVIEW_UNSUPPORTED_OS_TEST_ID}>
        <p>{i18n.STATUS_UNSUPPORTED_OS_DESCRIPTION}</p>
        {/*
         * Epic #20877 §6: no "Look up hash only" button; the client has no prior-runs hook for it.
         * Pending product answer.
         */}
        <p>{i18n.ALERT_CARD_SUPPORTED_OSES(osList)}</p>
      </EuiText>
    );
  } else {
    body = (
      <EuiFlexGroup direction="column" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size="s">{i18n.ALERT_CARD_NOT_ANALYZED_DESCRIPTION}</EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <div>
            <DetonateButton
              label={i18n.DETONATE_FILE_ACTION}
              onClick={openModal}
              data-test-subj={DETONATION_OVERVIEW_DETONATE_TEST_ID}
            />
          </div>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  return (
    <ExpandablePanel
      header={{ title: i18n.ALERT_CARD_TITLE, iconType: 'bug' }}
      content={{ loading: alertRuns.isLoading, error: alertRuns.isError }}
      data-test-subj={DETONATION_OVERVIEW_TEST_ID}
    >
      <div data-test-subj={DETONATION_OVERVIEW_CONTENT_TEST_ID}>{body}</div>
      {isModalVisible && (
        <SubmitModal
          initialHash={hash}
          initialTags={initialTags}
          initialOrigin={initialOrigin}
          source="alert_flyout"
          onClose={closeModal}
          onSubmitted={onSubmitted}
          onViewTask={openResult}
        />
      )}
    </ExpandablePanel>
  );
};

export interface DetonationOverviewProps {
  hit: DataTableRecord;
}

/**
 * The alert flyout's Malware analysis card. The caller shows it for local alerts only. It renders
 * nothing when the flag is off or the alert carries no hash: the epic defines no card for an
 * alert without a file to detonate.
 *
 * Epic #20877 §6: the family is omitted because runs carry no family field.
 */
export const DetonationOverview: FC<DetonationOverviewProps> = ({ hit }) => {
  const isEnabled = useIsExperimentalFeatureEnabled('detonatePrototypeEnabled');
  const hash = useMemo(() => getDetonatableHash(hit), [hit]);

  // Epic #20877 §6: hidden for an alert with no hash, which the epic does not define; pending
  // product answer.
  if (!isEnabled || !hash) {
    return null;
  }
  return <DetonationOverviewContent hit={hit} hash={hash} />;
};

DetonationOverview.displayName = 'DetonationOverview';

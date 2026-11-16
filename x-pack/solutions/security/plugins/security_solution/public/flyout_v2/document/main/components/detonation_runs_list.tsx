/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useMemo } from 'react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { EuiBasicTable, EuiButtonEmpty, EuiSkeletonText, EuiSpacer, EuiText } from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { FormattedRelative } from '@kbn/i18n-react';
import { KbnDangerCallout } from '@kbn/ui-callout';
import { useFlyoutApi } from '../../../use_flyout_api';
import { DetonationStateBadge } from '../../../../detonate_prototype/components/detonation_state_badge';
import { DetonateVerdictNameBadge } from '../../../../detonate_prototype/components/verdict_badge';
import { useDetonationCardRuns } from '../../../../detonate_prototype/hooks/use_detonate';
import type { DetonationRecord } from '../../../../../common/detonate_prototype';
import * as i18n from '../../../../detonate_prototype/translations';
import { RESPONSE_SECTION_TEST_ID } from './test_ids';

export const DETONATION_RUNS_LIST_TEST_ID = `${RESPONSE_SECTION_TEST_ID}DetonationRuns` as const;
export const DETONATION_RUNS_LIST_EMPTY_TEST_ID = `${DETONATION_RUNS_LIST_TEST_ID}Empty` as const;
export const DETONATION_RUNS_LIST_ERROR_TEST_ID = `${DETONATION_RUNS_LIST_TEST_ID}Error` as const;
export const DETONATION_RUNS_LIST_OPEN_TEST_ID = `${DETONATION_RUNS_LIST_TEST_ID}Open` as const;

export interface DetonationRunsListProps {
  hit: DataTableRecord;
}

/** Runs from this alert, newest first; shares the card's cache entry. */
export const DetonationRunsList: FC<DetonationRunsListProps> = ({ hit }) => {
  const alertId = hit.raw._id ?? '';
  const { alertRuns } = useDetonationCardRuns({ alertId, hash: undefined });
  const { openDetonationFlyout } = useFlyoutApi();

  const columns = useMemo<Array<EuiBasicTableColumn<DetonationRecord>>>(
    () => [
      {
        field: '@timestamp',
        name: i18n.RESPONSE_RUNS_COLUMN_TIME,
        render: (timestamp: string) => <FormattedRelative value={timestamp} />,
      },
      {
        field: 'detonate.submitter',
        name: i18n.RESPONSE_RUNS_COLUMN_SUBMITTER,
        render: (submitter?: string) => submitter ?? '-',
      },
      {
        name: i18n.RESPONSE_RUNS_COLUMN_STATUS,
        render: (run: DetonationRecord) => <DetonationStateBadge state={run['detonate.state']} />,
      },
      {
        name: i18n.RESPONSE_RUNS_COLUMN_RESULT,
        render: (run: DetonationRecord) => {
          const verdict = run['detonate.verdict'];
          return run['detonate.state'] === 'complete' && verdict ? (
            <DetonateVerdictNameBadge verdict={verdict} evidence={run['detonate.evidence']} />
          ) : (
            '-'
          );
        },
      },
      {
        name: '',
        render: (run: DetonationRecord) => (
          <EuiButtonEmpty
            size="xs"
            flush="left"
            onClick={() => openDetonationFlyout({ taskId: run['detonate.task_id'] })}
            data-test-subj={`${DETONATION_RUNS_LIST_OPEN_TEST_ID}-${run['detonate.task_id']}`}
          >
            {i18n.RESPONSE_RUNS_OPEN}
          </EuiButtonEmpty>
        ),
      },
    ],
    [openDetonationFlyout]
  );

  const runs = alertRuns.data?.hits;

  return (
    <>
      <EuiSpacer size="m" />
      <EuiText size="xs">
        <strong>{i18n.RESPONSE_RUNS_TITLE}</strong>
      </EuiText>
      <EuiSpacer size="s" />
      <div data-test-subj={DETONATION_RUNS_LIST_TEST_ID}>
        {alertRuns.isLoading ? (
          <EuiSkeletonText lines={2} />
        ) : alertRuns.isError ? (
          <KbnDangerCallout
            announceOnMount
            size="s"
            title={i18n.RESPONSE_RUNS_ERROR}
            data-test-subj={DETONATION_RUNS_LIST_ERROR_TEST_ID}
          />
        ) : runs && runs.length > 0 ? (
          <EuiBasicTable<DetonationRecord>
            items={runs}
            columns={columns}
            tableCaption={i18n.RESPONSE_RUNS_TITLE}
            compressed
          />
        ) : (
          <EuiText size="s" color="subdued" data-test-subj={DETONATION_RUNS_LIST_EMPTY_TEST_ID}>
            {i18n.RESPONSE_RUNS_EMPTY}
          </EuiText>
        )}
      </div>
    </>
  );
};

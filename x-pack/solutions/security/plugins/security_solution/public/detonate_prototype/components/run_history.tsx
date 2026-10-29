/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — run history for one sample hash.
 *
 * The learning tier's read surface: every completed run of the same sample,
 * newest first, with the quiet-run streak made explicit. Three quiets in a
 * row is the evidence bar an exception/trusted-app proposal cites — the
 * button copies that evidence as a comment and nothing more. The write stays
 * an analyst action in the Artifacts UI, where authz and audit live.
 */

import React, { useMemo } from 'react';
import {
  EuiBasicTable,
  EuiBadge,
  EuiButtonIcon,
  EuiCopy,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { FormattedRelative } from '@kbn/i18n-react';

import {
  PROPOSAL_QUIET_STREAK_THRESHOLD,
  exceptionProposalComment,
  quietRunStreak,
} from '../../../common/detonate_prototype';
import type { DetonateTask } from '../../../common/detonate_prototype';
import { useNavigateTo } from '../../common/lib/kibana';
import { SecurityPageName } from '../../app/types';
import { DetonateVerdictBadge } from './verdict_badge';
import { DETONATE_ICONS } from '../icons';
import * as i18n from '../translations';

export const RUN_HISTORY_TEST_ID = 'detonatePrototypeRunHistory';

interface RunHistoryProps {
  /** The completed runs of this sample, newest first (from the by-hash hook). */
  runs: DetonateTask[];
  /** The sample hash the runs share — what a proposal cites. */
  hash: string;
}

const historyColumns = (
  goToTask: (taskId: string) => void
): Array<EuiBasicTableColumn<DetonateTask>> => [
  {
    field: 'created_at',
    name: 'Submitted',
    width: '160px',
    render: (createdAt: string) => <FormattedRelative value={new Date(createdAt)} />,
  },
  {
    field: 'id',
    name: 'Run',
    render: (id: string) => (
      <EuiLink onClick={() => goToTask(id)} data-test-subj={`${RUN_HISTORY_TEST_ID}-link`}>
        {id.slice(0, 8)}
      </EuiLink>
    ),
  },
  {
    name: 'Verdict',
    width: '150px',
    render: (task: DetonateTask) => <DetonateVerdictBadge task={task} />,
  },
];

export const RunHistory = React.memo<RunHistoryProps>(({ runs, hash }) => {
  const { navigateTo } = useNavigateTo();

  const goToTask = useMemo(
    () => (id: string) =>
      navigateTo({
        deepLinkId: SecurityPageName.detonatePrototype,
        path: `/${id}`,
      }),
    [navigateTo]
  );

  const streak = useMemo(() => quietRunStreak(runs), [runs]);
  const columns = useMemo(() => historyColumns(goToTask), [goToTask]);

  const eligible = streak >= PROPOSAL_QUIET_STREAK_THRESHOLD;

  return (
    <EuiPanel hasBorder data-test-subj={RUN_HISTORY_TEST_ID}>
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{i18n.RUN_HISTORY_TITLE}</h3>
          </EuiTitle>
        </EuiFlexItem>
        {streak > 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge
              color={eligible ? 'success' : 'hollow'}
            >{`${streak} quiet in a row`}</EuiBadge>
          </EuiFlexItem>
        )}
        {eligible && (
          <EuiFlexItem grow={false}>
            <EuiCopy textToCopy={exceptionProposalComment(hash, runs)}>
              {(copy) => (
                <EuiToolTip content={i18n.PROPOSAL_TOOLTIP}>
                  <EuiButtonIcon
                    iconType={DETONATE_ICONS.copy}
                    aria-label={i18n.PROPOSAL_BUTTON_LABEL}
                    onClick={copy}
                    data-test-subj={`${RUN_HISTORY_TEST_ID}-copyProposal`}
                  />
                </EuiToolTip>
              )}
            </EuiCopy>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      {runs.length === 0 ? (
        <EuiText size="s" color="subdued">
          {i18n.RUN_HISTORY_EMPTY}
        </EuiText>
      ) : (
        <EuiBasicTable
          items={runs}
          columns={columns}
          tableCaption={i18n.RUN_HISTORY_TITLE}
          tableLayout="auto"
          data-test-subj={`${RUN_HISTORY_TEST_ID}-table`}
        />
      )}
    </EuiPanel>
  );
});
RunHistory.displayName = 'RunHistory';

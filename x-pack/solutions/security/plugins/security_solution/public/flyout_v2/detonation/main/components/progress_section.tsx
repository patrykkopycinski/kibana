/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiSpacer, EuiText } from '@elastic/eui';
import { isDetonationComplete } from '../../../../../common/detonate_prototype';
import type { DetonateTask } from '../../../../../common/detonate_prototype';
import { WorkerTimeline } from '../../../../detonate_prototype/components/worker_timeline';
import { useDetonationTaskUpdates } from '../../../../detonate_prototype/hooks/use_detonate';
import * as i18n from '../../../../detonate_prototype/translations';
import {
  DETONATION_PROGRESS_AGENT_ID_TEST_ID,
  DETONATION_PROGRESS_DURATION_TEST_ID,
  DETONATION_PROGRESS_TEST_ID,
  DETONATION_PROGRESS_WAITING_TEST_ID,
} from '../test_ids';
import { formatDetonationDuration, getDetonationDurationMs } from '../utils/detonation_duration';
import { isDetonationQueued } from '../utils/detonation_queued';
import { isDetonationVmStarted } from '../utils/detonation_vm_started';
import { OverviewSection } from './overview_section';

interface ProgressSectionProps {
  task: DetonateTask;
}

/**
 * Open while the run is going, folded once it is over, with the run time in the
 * header. The open state follows the run, so it is not remembered between runs.
 */
export const ProgressSection = ({ task }: ProgressSectionProps) => {
  const complete = isDetonationComplete(task);
  const queued = isDetonationQueued(task);
  const { data: updates } = useDetonationTaskUpdates(task.id, complete);

  const durationMs = getDetonationDurationMs(task, updates);
  const vmStarted = isDetonationVmStarted(task);

  return (
    <OverviewSection
      // The default is read once, so the section is rebuilt when the run ends.
      key={complete ? 'complete' : 'running'}
      sectionId="progress"
      title={i18n.OVERVIEW_PROGRESS_TITLE}
      defaultExpanded={!complete}
      persist={false}
      data-test-subj={DETONATION_PROGRESS_TEST_ID}
      extraAction={
        durationMs === undefined ? undefined : (
          <EuiText size="xs" color="subdued" data-test-subj={DETONATION_PROGRESS_DURATION_TEST_ID}>
            {i18n.OVERVIEW_PROGRESS_DURATION({ duration: formatDetonationDuration(durationMs) })}
          </EuiText>
        )
      }
    >
      {queued && (
        <>
          <EuiText size="s" color="subdued" data-test-subj={DETONATION_PROGRESS_WAITING_TEST_ID}>
            {i18n.OVERVIEW_PROGRESS_WAITING}
          </EuiText>
          <EuiSpacer size="s" />
        </>
      )}
      <WorkerTimeline taskId={task.id} isComplete={complete} />
      {vmStarted && task.elastic_agent_id && (
        <>
          <EuiSpacer size="s" />
          <EuiText size="xs" color="subdued" data-test-subj={DETONATION_PROGRESS_AGENT_ID_TEST_ID}>
            {i18n.OVERVIEW_SANDBOX_AGENT_ID_VALUE({ id: task.elastic_agent_id })}
          </EuiText>
        </>
      )}
    </OverviewSection>
  );
};

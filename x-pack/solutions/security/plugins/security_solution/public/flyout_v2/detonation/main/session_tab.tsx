/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0. No use of this file is permitted except in compliance with the Elastic
 * License 2.0.
 */

import type { FC } from 'react';
import React, { memo } from 'react';
import { css } from '@emotion/react';
import { EuiLoadingSpinner } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '../../../common/lib/kibana';
import { useRunSession } from '../../../detonate_prototype/hooks/use_detonate';
import { DETONATION_DETAILS_SESSION_TAB_TEST_ID } from './test_ids';

/**
 * The detonation flyout's Session tab (N1): the sandbox's recorded process
 * behavior, rendered by Session View over the space's sandbox stream.
 *
 * The config comes from the server route, which copies the run's process
 * events into the stream (idempotently) and resolves the tree root — the
 * entry leader shared by the run's events — so the tab never has to know the
 * stream name or event shape.
 */
export const SESSION_TAB_TEST_ID = DETONATION_DETAILS_SESSION_TAB_TEST_ID;

interface SessionTabProps {
  taskId: string;
}

const sessionViewContainerCss = css({
  height: '100%',
  // Session View ships its own padding; the flyout body must not add any.
  '.euiFlyoutBody__overflowContent': { padding: 0 },
});

/** Session View in the detonation flyout, over the sandbox stream. */
export const SessionTab: FC<SessionTabProps> = memo(({ taskId }) => {
  const { data: session, isLoading } = useRunSession(taskId);
  const { sessionView } = useKibana().services;

  if (isLoading) {
    return <EuiLoadingSpinner data-test-subj={`${SESSION_TAB_TEST_ID}Loading`} size="l" />;
  }

  // No events recorded is a fact about the run, not an error: older
  // recordings predate event capture, and the negative-control runs carry
  // none. The empty state says exactly that.
  if (!session?.session_entity_id || !session.session_start_time) {
    return (
      <p data-test-subj={`${SESSION_TAB_TEST_ID}Empty`}>
        <FormattedMessage
          id="xpack.securitySolution.flyout.detonation.session.noEvents"
          defaultMessage="No process events were recorded for this run."
        />
      </p>
    );
  }

  return (
    <div data-test-subj={SESSION_TAB_TEST_ID} css={sessionViewContainerCss}>
      {sessionView.getSessionView({
        index: session.index,
        preserveIndex: true,
        sessionEntityId: session.session_entity_id,
        sessionStartTime: session.session_start_time,
        height: 480,
        isFullScreen: false,
        openDetails: () => {},
        closeDetails: () => {},
      })}
    </div>
  );
});

SessionTab.displayName = 'SessionTab';

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { memo } from 'react';
import { css } from '@emotion/react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiLoadingSpinner,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { KbnDangerCallout } from '@kbn/ui-callout';
import { useKibana } from '../../../../common/lib/kibana';
import { useRunSession } from '../../../../detonate_prototype/hooks/use_detonate';
import { ToolsFlyoutHeader } from '../../../shared/components/tools_flyout_header';
import { SESSION_VIEW_TITLE } from '../../../shared/constants/flyout_titles';
import { SandboxBadge } from '../sandbox_badge';
import {
  DETONATION_SESSION_VIEW_TOOL_ERROR_TEST_ID,
  DETONATION_SESSION_VIEW_TOOL_TEST_ID,
} from '../test_ids';

const EUI_HEADER_HEIGHT = 96;
const TOOL_HEADER_HEIGHT = 72;
const SESSION_VIEW_SEARCH_BAR_HEIGHT = 64;

const sessionViewContainerCss = css({
  // Session View ships its own padding; the flyout body must not add any.
  '.euiFlyoutBody__overflowContent': { padding: 0 },
});

export interface DetonationSessionViewProps {
  /** Id of the detonation run whose recorded process behavior to show. */
  taskId: string;
}

/**
 * Session View tool for a detonation run, opened as a child of the result flyout. Same config as
 * the result's Session tab (the run's sandbox stream and session entity); the document tools'
 * Session View cannot be reused because it derives its config from an alert document.
 * Epic #20877 §5: reuse of the shared tool is pending a product answer.
 */
export const DetonationSessionView: FC<DetonationSessionViewProps> = memo(({ taskId }) => {
  const { euiTheme } = useEuiTheme();
  const { sessionView } = useKibana().services;
  const { data: session, isLoading, isError } = useRunSession(taskId);

  const height =
    window.innerHeight - EUI_HEADER_HEIGHT - TOOL_HEADER_HEIGHT - SESSION_VIEW_SEARCH_BAR_HEIGHT;

  const sessionEntityId = session?.session_entity_id;
  const sessionStartTime = session?.session_start_time;

  return (
    <>
      <EuiFlyoutHeader
        hasBorder
        css={css`
          padding-block: ${euiTheme.size.s} !important;
        `}
      >
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem>
            <ToolsFlyoutHeader title={SESSION_VIEW_TITLE} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <SandboxBadge />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>
      <EuiFlyoutBody css={sessionViewContainerCss}>
        <div data-test-subj={DETONATION_SESSION_VIEW_TOOL_TEST_ID}>
          {isLoading && (
            <EuiLoadingSpinner
              size="l"
              data-test-subj={`${DETONATION_SESSION_VIEW_TOOL_TEST_ID}Loading`}
            />
          )}
          {!isLoading && isError && (
            <KbnDangerCallout
              announceOnMount
              size="s"
              title={i18n.translate(
                'xpack.securitySolution.flyout.detonation.sessionViewTool.error',
                {
                  defaultMessage: 'Unable to load the process events for this run.',
                }
              )}
              data-test-subj={DETONATION_SESSION_VIEW_TOOL_ERROR_TEST_ID}
            />
          )}
          {!isLoading && !isError && !(sessionEntityId && sessionStartTime) && (
            <p data-test-subj={`${DETONATION_SESSION_VIEW_TOOL_TEST_ID}Empty`}>
              <FormattedMessage
                id="xpack.securitySolution.flyout.detonation.sessionViewTool.noEvents"
                defaultMessage="No process events were recorded for this run."
              />
            </p>
          )}
          {!isLoading &&
            !isError &&
            sessionEntityId &&
            sessionStartTime &&
            session &&
            sessionView.getSessionView({
              index: session.index,
              preserveIndex: true,
              sessionEntityId,
              sessionStartTime,
              height,
              isFullScreen: true,
              openDetails: () => {},
              closeDetails: () => {},
            })}
        </div>
      </EuiFlyoutBody>
    </>
  );
});

DetonationSessionView.displayName = 'DetonationSessionView';

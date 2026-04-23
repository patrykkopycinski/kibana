/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCode,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';

import type { ArgusMutationDetail } from '@kbn/argus-console-common';

import { useMutationDetail, type ArgusHttp } from '../../hooks';
import { formatTimestamp } from './mutation_detail_helpers';
import { MutationDetailSections, verdictBadge } from './mutation_detail_sections';

export interface MutationDetailFlyoutProps {
  readonly http: ArgusHttp;
  readonly mutationIntentId: string;
  readonly onClose: () => void;
  /** Whether the user can approve/reject blocked mutations. */
  readonly canApproveMutations?: boolean;
  /** Called when the user clicks Approve in the footer. */
  readonly onApprove?: (detail: ArgusMutationDetail) => void;
  /** Called when the user clicks Reject in the footer. */
  readonly onReject?: (detail: ArgusMutationDetail) => void;
  /**
   * When the mutation has already been decided optimistically by the
   * list view, the footer replaces its buttons with a terminal badge.
   */
  readonly decidedAction?: 'approve' | 'reject' | null;
}

export const MutationDetailFlyout: React.FC<MutationDetailFlyoutProps> = ({
  http,
  mutationIntentId,
  onClose,
  canApproveMutations = false,
  onApprove,
  onReject,
  decidedAction = null,
}) => {
  const flyoutTitleId = useGeneratedHtmlId({ prefix: 'argusMutationDetailFlyout' });
  const state = useMutationDetail({ http, mutationIntentId });

  const renderBody = (): JSX.Element => {
    if (state.status === 'loading' || state.status === 'idle') {
      return (
        <EuiFlexGroup justifyContent="center" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="s" color="subdued">
              {'Loading mutation detail…'}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      );
    }
    if (state.status === 'error') {
      return (
        <EuiCallOut color="danger" iconType="alert" title="Couldn't load mutation detail">
          {state.error.message}
        </EuiCallOut>
      );
    }
    if (state.data.reason_code === 'not_found' || !state.data.detail) {
      return (
        <EuiEmptyPrompt
          iconType="dot"
          title={<h4>{'Mutation not found'}</h4>}
          body={
            <EuiText size="s">
              {'No intent or outcome doc was found for '}
              <EuiCode>{mutationIntentId}</EuiCode>
              {'.'}
            </EuiText>
          }
        />
      );
    }

    return <MutationDetailSections detail={state.data.detail} />;
  };

  const detail = state.status === 'success' ? state.data.detail : null;
  const showApprovalFooter =
    canApproveMutations && detail?.verdict === 'blocked' && Boolean(detail.mutation_intent_id);

  return (
    <EuiFlyout
      ownFocus
      onClose={onClose}
      size="m"
      aria-labelledby={flyoutTitleId}
      data-test-subj="argusMutationDetailFlyout"
    >
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap>
          <EuiFlexItem grow={false}>
            {detail ? (
              verdictBadge(detail.verdict)
            ) : (
              <EuiBadge color="hollow">{'Loading'}</EuiBadge>
            )}
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="s">
              <h2 id={flyoutTitleId}>
                {detail?.title ?? detail?.label ?? detail?.rule_id ?? mutationIntentId}
              </h2>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>
        {detail?.subtitle ? (
          <>
            <EuiSpacer size="xs" />
            <EuiText size="s" color="subdued">
              {detail.subtitle}
            </EuiText>
          </>
        ) : null}
        <EuiSpacer size="xs" />
        <EuiText size="xs" color="subdued">
          <code>{mutationIntentId}</code>
          {detail?.timestamp ? (
            <>
              {' · '}
              {formatTimestamp(detail.timestamp)}
            </>
          ) : null}
        </EuiText>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {renderBody()}
        <EuiHorizontalRule margin="l" />
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              onClick={onClose}
              iconType="cross"
              data-test-subj="argusMutationDetailClose"
            >
              {'Close'}
            </EuiButtonEmpty>
          </EuiFlexItem>
          {decidedAction ? (
            <EuiFlexItem grow={false}>
              <EuiBadge color={decidedAction === 'approve' ? 'success' : 'danger'}>
                {decidedAction === 'approve' ? 'Approved' : 'Rejected'}
              </EuiBadge>
            </EuiFlexItem>
          ) : showApprovalFooter && detail ? (
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    color="danger"
                    iconType="cross"
                    onClick={() => onReject?.(detail)}
                    data-test-subj="argusMutationDetailReject"
                  >
                    {'Reject'}
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    fill
                    color="success"
                    iconType="check"
                    onClick={() => onApprove?.(detail)}
                    data-test-subj="argusMutationDetailApprove"
                  >
                    {'Approve'}
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};

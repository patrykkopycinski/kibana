/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiAccordion,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';

import { useSynthesisProposals, type ArgusHttp } from '../../hooks';
import { ProposalsTable } from '../proposals_panel/proposals_table';

export interface SynthesisAlternativesInlineProps {
  readonly http: ArgusHttp;
  readonly cveId: string;
  /**
   * Optional hook so the parent can provide a "view full detail" button
   * that navigates to the global Proposals tab for the same CVE.
   */
  readonly onOpenFullView?: (cveId: string) => void;
}

/**
 * Inline, collapsed-by-default alternatives block that attaches below the
 * Synthesis stage card. Surfaces the same Pareto data as the global
 * Proposals tab but in compact form so it does not blow up the timeline
 * height.
 */
export const SynthesisAlternativesInline: React.FC<SynthesisAlternativesInlineProps> = ({
  http,
  cveId,
  onOpenFullView,
}) => {
  const [opened, setOpened] = useState(false);

  // Only fetch once the user opens the accordion — keeps the page cheap
  // when most stages are collapsed.
  const state = useSynthesisProposals({
    http,
    cveId,
    enabled: opened,
    refreshIntervalMs: 20_000,
  });

  const alternativesCount =
    state.status === 'success'
      ? state.data.proposals.filter((p) => p.tier !== 'chosen').length
      : undefined;

  const buttonContent = (
    <EuiText size="xs" color="subdued">
      {alternativesCount === undefined
        ? 'Alternatives considered'
        : alternativesCount === 0
        ? 'No alternatives (single-candidate synthesis)'
        : `${alternativesCount} alternative${alternativesCount === 1 ? '' : 's'} considered`}
    </EuiText>
  );

  return (
    <EuiPanel
      color="subdued"
      paddingSize="s"
      hasShadow={false}
      hasBorder
      data-test-subj="argus-synthesis-alternatives-inline"
    >
      <EuiAccordion
        id={`argus-synthesis-alternatives-${cveId}`}
        buttonContent={buttonContent}
        initialIsOpen={false}
        onToggle={(isOpen) => setOpened(isOpen)}
        paddingSize="s"
        extraAction={
          onOpenFullView ? (
            <EuiButtonEmpty
              size="xs"
              iconType="popout"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onOpenFullView(cveId);
              }}
              data-test-subj="argus-synthesis-alternatives-open-full"
            >
              {'View in Proposals'}
            </EuiButtonEmpty>
          ) : undefined
        }
      >
        {state.status === 'loading' || state.status === 'idle' ? (
          <EuiText size="xs" color="subdued">
            {'Loading alternatives…'}
          </EuiText>
        ) : state.status === 'error' ? (
          <EuiText size="xs" color="danger">
            {`Failed to load alternatives: ${state.error.message}`}
          </EuiText>
        ) : state.data.missing_reason ? (
          <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {state.data.missing_reason === 'no_synthesis_metadata'
                  ? 'Recommendation predates Pareto synthesis — no alternatives recorded.'
                  : state.data.missing_reason === 'recommendation_not_found'
                  ? 'No recommendation linked yet — synthesis has not run.'
                  : 'Advisory not found.'}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        ) : state.data.proposals.length === 0 ? (
          <EuiText size="xs" color="subdued">
            {'No alternatives recorded for this recommendation.'}
          </EuiText>
        ) : (
          <>
            <EuiSpacer size="xs" />
            <ProposalsTable proposals={state.data.proposals} compact />
          </>
        )}
      </EuiAccordion>
    </EuiPanel>
  );
};

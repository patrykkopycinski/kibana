/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiCallOut,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiSkeletonText,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import type { DecisionGraphNode, DecisionGraphNodeKind } from '@kbn/argus-console-common';
import type { ArgusHttp } from '../../hooks';
import { useDecisionGraph } from '../../hooks';
import { DecisionGraphSvg } from './decision_graph_svg';

const FLYOUT_TITLE = i18n.translate(
  'securitySolutionPackages.argusConsole.decisionGraph.flyoutTitle',
  {
    defaultMessage: 'Decision graph',
  }
);
const LABEL_LABEL = i18n.translate(
  'securitySolutionPackages.argusConsole.decisionGraph.selection.label',
  {
    defaultMessage: 'Label',
  }
);
const LABEL_KIND = i18n.translate(
  'securitySolutionPackages.argusConsole.decisionGraph.selection.kind',
  {
    defaultMessage: 'Kind',
  }
);
const LABEL_ID = i18n.translate(
  'securitySolutionPackages.argusConsole.decisionGraph.selection.id',
  {
    defaultMessage: 'Id',
  }
);
const LABEL_EVIDENCE = i18n.translate(
  'securitySolutionPackages.argusConsole.decisionGraph.selection.lastEvidence',
  { defaultMessage: 'Last evidence' }
);

export interface DecisionGraphFlyoutProps {
  readonly http: ArgusHttp;
  readonly rootKind: DecisionGraphNodeKind;
  readonly rootId: string;
  readonly depth?: number;
  readonly onClose: () => void;
  /**
   * Called when the operator clicks "Open full-screen explorer" — the host
   * wrapper is responsible for closing this flyout and routing to the
   * decision_graph tab with the same root pre-selected.
   */
  readonly onOpenFullScreen?: (args: { rootKind: DecisionGraphNodeKind; rootId: string }) => void;
}

export const DecisionGraphFlyout: React.FC<DecisionGraphFlyoutProps> = ({
  http,
  rootKind,
  rootId,
  depth = 2,
  onClose,
  onOpenFullScreen,
}) => {
  const state = useDecisionGraph({ http, rootKind, rootId, depth });
  const [selected, setSelected] = useState<DecisionGraphNode | undefined>(undefined);

  return (
    <EuiFlyout
      onClose={onClose}
      size="l"
      data-test-subj="argusConsoleDecisionGraphFlyout"
      aria-labelledby="argusConsoleDecisionGraphFlyoutTitle"
    >
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem>
            <EuiTitle size="m">
              <h2 id="argusConsoleDecisionGraphFlyoutTitle">{FLYOUT_TITLE}</h2>
            </EuiTitle>
            <EuiText size="s" color="subdued">
              {i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.rootSubtitle', {
                defaultMessage: 'Root: {rootKind}:{rootId} · depth {depth}',
                values: { rootKind, rootId, depth },
              })}
            </EuiText>
          </EuiFlexItem>
          {state.status === 'success' ? (
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">
                {i18n.translate(
                  'securitySolutionPackages.argusConsole.decisionGraph.nodeEdgeCount',
                  {
                    defaultMessage: '{nodes} nodes · {edges} edges',
                    values: {
                      nodes: state.data.nodes.length,
                      edges: state.data.edges.length,
                    },
                  }
                )}
              </EuiBadge>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {state.status === 'loading' ? <EuiSkeletonText lines={6} /> : null}

        {state.status === 'error' ? (
          <EuiCallOut
            color="danger"
            title={i18n.translate(
              'securitySolutionPackages.argusConsole.decisionGraph.errorTitle',
              { defaultMessage: 'Unable to load decision graph' }
            )}
          >
            {state.error.message}
          </EuiCallOut>
        ) : null}

        {state.status === 'success' && state.data.nodes.length === 0 ? (
          <EuiCallOut
            color="warning"
            title={i18n.translate(
              'securitySolutionPackages.argusConsole.decisionGraph.emptyTitle',
              { defaultMessage: 'No neighborhood found' }
            )}
          >
            {i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.emptyBodyFlyout', {
              defaultMessage:
                'No edges in `.soc-decision-graph` touch this root. Run `node scripts/argus_seed_decision_graph.js` or wait for the builder workflow to populate the index.',
            })}
          </EuiCallOut>
        ) : null}

        {state.status === 'success' && state.data.truncated ? (
          <>
            <EuiCallOut
              color="warning"
              title={i18n.translate(
                'securitySolutionPackages.argusConsole.decisionGraph.truncatedTitle',
                { defaultMessage: 'Neighborhood truncated' }
              )}
              iconType="alert"
              size="s"
            >
              {i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.truncatedBody', {
                defaultMessage: 'Server cap reached — some nodes and edges are not shown.',
              })}
            </EuiCallOut>
            <EuiSpacer size="s" />
          </>
        ) : null}

        {state.status === 'success' && state.data.nodes.length > 0 ? (
          <DecisionGraphSvg
            rootKind={rootKind}
            rootId={rootId}
            nodes={state.data.nodes}
            edges={state.data.edges}
            onSelectNode={setSelected}
          />
        ) : null}

        {selected ? (
          <>
            <EuiSpacer size="m" />
            <EuiTitle size="xs">
              <h3>
                {i18n.translate(
                  'securitySolutionPackages.argusConsole.decisionGraph.selectedNodeTitle',
                  { defaultMessage: 'Selected node' }
                )}
              </h3>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiDescriptionList
              compressed
              listItems={[
                { title: LABEL_LABEL, description: selected.label },
                { title: LABEL_KIND, description: selected.kind },
                { title: LABEL_ID, description: selected.id },
                ...(selected.evidence_ts
                  ? [{ title: LABEL_EVIDENCE, description: selected.evidence_ts }]
                  : []),
              ]}
            />
          </>
        ) : null}
      </EuiFlyoutBody>

      {onOpenFullScreen ? (
        <EuiFlyoutFooter>
          <EuiButton
            fill
            iconType="fullScreen"
            onClick={() => onOpenFullScreen({ rootKind, rootId })}
            data-test-subj="argusConsoleDecisionGraphOpenFullScreen"
          >
            {i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.openExplorer', {
              defaultMessage: 'Open full-screen explorer',
            })}
          </EuiButton>
        </EuiFlyoutFooter>
      ) : null}
    </EuiFlyout>
  );
};

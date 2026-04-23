/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiDescriptionList,
  EuiEmptyPrompt,
  EuiFilterButton,
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSelect,
  EuiSkeletonText,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import type {
  DecisionGraphEdge,
  DecisionGraphNode,
  DecisionGraphNodeKind,
  DecisionGraphRecentRoot,
  DecisionGraphResponse,
} from '@kbn/argus-console-common';
import type { ArgusHttp } from '../../hooks';
import { useDecisionGraph, useDecisionGraphRecentRoots } from '../../hooks';
import { SubjectPicker } from '../subject_picker/subject_picker';
import { DecisionGraphSvg } from './decision_graph_svg';

const ROOT_KINDS: ReadonlyArray<{ value: DecisionGraphNodeKind; label: string }> = [
  {
    value: 'advisory',
    label: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.kind.advisory', {
      defaultMessage: 'Advisory',
    }),
  },
  {
    value: 'intent',
    label: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.kind.intent', {
      defaultMessage: 'Intent',
    }),
  },
  {
    value: 'rule',
    label: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.kind.rule', {
      defaultMessage: 'Rule',
    }),
  },
  {
    value: 'reasoning',
    label: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.kind.reasoning', {
      defaultMessage: 'Reasoning',
    }),
  },
  {
    value: 'technique',
    label: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.kind.technique', {
      defaultMessage: 'Technique',
    }),
  },
  {
    value: 'actor',
    label: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.kind.actor', {
      defaultMessage: 'Actor',
    }),
  },
  {
    value: 'outcome',
    label: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.kind.outcome', {
      defaultMessage: 'Outcome',
    }),
  },
  {
    value: 'audit',
    label: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.kind.audit', {
      defaultMessage: 'Audit',
    }),
  },
  {
    value: 'observation',
    label: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.kind.observation', {
      defaultMessage: 'Observation',
    }),
  },
];

const DEPTH_OPTIONS = [
  {
    value: '1',
    text: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.depth.1', {
      defaultMessage: 'Depth 1',
    }),
  },
  {
    value: '2',
    text: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.depth.2', {
      defaultMessage: 'Depth 2',
    }),
  },
  {
    value: '3',
    text: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.depth.3', {
      defaultMessage: 'Depth 3',
    }),
  },
];

const STRENGTH_OPTIONS = [
  {
    value: '0',
    text: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.strength.any', {
      defaultMessage: 'Any',
    }),
  },
  {
    value: '0.25',
    text: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.strength.025', {
      defaultMessage: '≥ 0.25',
    }),
  },
  {
    value: '0.5',
    text: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.strength.05', {
      defaultMessage: '≥ 0.5',
    }),
  },
  {
    value: '0.75',
    text: i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.strength.075', {
      defaultMessage: '≥ 0.75',
    }),
  },
];

const ALL_NODE_KINDS: readonly DecisionGraphNodeKind[] = ROOT_KINDS.map((k) => k.value);

const LABEL_LABEL = i18n.translate(
  'securitySolutionPackages.argusConsole.decisionGraph.selection.label',
  { defaultMessage: 'Label' }
);
const LABEL_KIND = i18n.translate(
  'securitySolutionPackages.argusConsole.decisionGraph.selection.kind',
  { defaultMessage: 'Kind' }
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

export interface DecisionGraphPanelProps {
  readonly http: ArgusHttp;
  readonly initialRootKind?: DecisionGraphNodeKind;
  readonly initialRootId?: string;
  readonly initialDepth?: number;
  readonly onRootChange?: (args: {
    readonly rootKind: DecisionGraphNodeKind | undefined;
    readonly rootId: string | undefined;
    readonly depth: number;
  }) => void;
}

/**
 * Full-screen Decision Graph explorer. Wraps the same `useDecisionGraph`
 * hook + `DecisionGraphSvg` renderer used by the flyout, and adds:
 *
 *   • root picker + depth selector,
 *   • kind filter chips (filter out nodes by kind),
 *   • strength threshold (hide edges below a confidence),
 *   • JSON export of the currently-rendered neighborhood,
 *   • node detail side panel on click.
 *
 * Stays package-local — no Kibana `application` / `url_state` dependencies.
 */
export const DecisionGraphPanel: React.FC<DecisionGraphPanelProps> = ({
  http,
  initialRootKind,
  initialRootId,
  initialDepth = 2,
  onRootChange,
}) => {
  const [rootKind, setRootKind] = useState<DecisionGraphNodeKind | undefined>(initialRootKind);
  const [rootId, setRootId] = useState<string | undefined>(initialRootId);
  const [depth, setDepth] = useState<number>(initialDepth);
  const [hiddenKinds, setHiddenKinds] = useState<Set<DecisionGraphNodeKind>>(new Set());
  const [strengthThreshold, setStrengthThreshold] = useState<number>(0);
  const [selected, setSelected] = useState<DecisionGraphNode | undefined>(undefined);

  const state = useDecisionGraph({ http, rootKind, rootId, depth });
  const recentRootsState = useDecisionGraphRecentRoots({ http, limit: 10 });

  const onSubjectApply = useCallback(
    (subject: { kind: DecisionGraphNodeKind; id: string } | undefined): void => {
      setSelected(undefined);
      if (!subject) {
        setRootKind(undefined);
        setRootId(undefined);
        onRootChange?.({ rootKind: undefined, rootId: undefined, depth });
        return;
      }
      setRootKind(subject.kind);
      setRootId(subject.id);
      onRootChange?.({ rootKind: subject.kind, rootId: subject.id, depth });
    },
    [depth, onRootChange]
  );

  // Auto-apply the newest root on first render when the caller didn't seed one
  // and the user hasn't picked anything yet. This makes the Decision graph tab
  // render a populated neighborhood on mount instead of the empty-prompt state,
  // which is what the demo UX needs. The `autoAppliedRef` guard ensures we only
  // do this once per mount — if the user clears the subject we don't
  // immediately re-apply on top of them.
  const autoAppliedRef = useRef<boolean>(Boolean(initialRootId));
  const recentRoots: readonly DecisionGraphRecentRoot[] = useMemo(
    () => (recentRootsState.status === 'success' ? recentRootsState.data.items : []),
    [recentRootsState]
  );

  useEffect(() => {
    if (autoAppliedRef.current) return;
    if (rootKind && rootId) return;
    if (recentRootsState.status !== 'success') return;
    const first = recentRootsState.data.items[0];
    if (!first) return;
    autoAppliedRef.current = true;
    onSubjectApply({ kind: first.kind, id: first.id });
  }, [recentRootsState, rootKind, rootId, onSubjectApply]);

  const toggleKind = (kind: DecisionGraphNodeKind): void => {
    setHiddenKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const filtered = useMemo(
    () =>
      applyFilters(
        state.status === 'success' ? state.data : undefined,
        hiddenKinds,
        strengthThreshold
      ),
    [state, hiddenKinds, strengthThreshold]
  );

  const exportJson = useCallback((): void => {
    if (!filtered) return;
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `argus-decision-graph-${rootKind}-${rootId}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [filtered, rootKind, rootId]);

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="argusConsoleDecisionGraphPanel">
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.panelTitle', {
                defaultMessage: 'Decision graph explorer',
              })}
            </h3>
          </EuiTitle>
          <EuiText size="s" color="subdued">
            {rootKind && rootId
              ? i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.rootSubtitle', {
                  defaultMessage: 'Root: {rootKind}:{rootId} · depth {depth}',
                  values: { rootKind, rootId, depth },
                })
              : i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.pickRootHint', {
                  defaultMessage: 'Pick a root subject to render the neighborhood.',
                })}
          </EuiText>
        </EuiFlexItem>
        {state.status === 'success' ? (
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">
              {i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.nodeEdgeCount', {
                defaultMessage: '{nodes} nodes · {edges} edges',
                values: {
                  nodes: filtered?.nodes.length ?? 0,
                  edges: filtered?.edges.length ?? 0,
                },
              })}
            </EuiBadge>
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>

      <EuiSpacer size="s" />

      <EuiFlexGroup gutterSize="s" responsive={false} alignItems="flexEnd" wrap>
        <EuiFlexItem>
          <SubjectPicker
            kinds={ROOT_KINDS}
            value={rootKind && rootId ? { kind: rootKind, id: rootId } : undefined}
            placeholder={i18n.translate(
              'securitySolutionPackages.argusConsole.decisionGraph.subjectPlaceholder',
              { defaultMessage: 'CVE-2024-27198, rule-id, actor-id…' }
            )}
            onApply={onSubjectApply}
            testSubj="argusConsoleDecisionGraphSubject"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ width: 120 }}>
          <EuiSelect
            compressed
            aria-label={i18n.translate(
              'securitySolutionPackages.argusConsole.decisionGraph.depthLabel',
              { defaultMessage: 'Depth' }
            )}
            options={DEPTH_OPTIONS}
            value={String(depth)}
            onChange={(e) => {
              const next = Number(e.target.value);
              setDepth(next);
              if (rootKind && rootId) {
                onRootChange?.({ rootKind, rootId, depth: next });
              }
            }}
            data-test-subj="argusConsoleDecisionGraphDepth"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      {recentRoots.length > 0 ? (
        <>
          <EuiSpacer size="s" />
          <EuiFlexGroup
            gutterSize="xs"
            alignItems="center"
            responsive={false}
            wrap
            data-test-subj="argusConsoleDecisionGraphRecentRoots"
          >
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {i18n.translate(
                  'securitySolutionPackages.argusConsole.decisionGraph.recentRootsLabel',
                  { defaultMessage: 'Recent subjects:' }
                )}
              </EuiText>
            </EuiFlexItem>
            {recentRoots.map((root) => {
              const active = rootKind === root.kind && rootId === root.id;
              const chipText = `${root.kind}:${root.label}`;
              const tooltip = root.last_evidence_ts
                ? i18n.translate(
                    'securitySolutionPackages.argusConsole.decisionGraph.recentRootChipTooltip',
                    {
                      defaultMessage: '{edgeCount} edges · last evidence {ts}',
                      values: { edgeCount: root.edge_count, ts: root.last_evidence_ts },
                    }
                  )
                : i18n.translate(
                    'securitySolutionPackages.argusConsole.decisionGraph.recentRootChipTooltipNoTs',
                    {
                      defaultMessage: '{edgeCount} edges',
                      values: { edgeCount: root.edge_count },
                    }
                  );
              return (
                <EuiFlexItem grow={false} key={`${root.kind}:${root.id}`}>
                  <EuiToolTip content={tooltip}>
                    <EuiBadge
                      color={active ? 'primary' : 'hollow'}
                      onClick={() => onSubjectApply({ kind: root.kind, id: root.id })}
                      onClickAriaLabel={i18n.translate(
                        'securitySolutionPackages.argusConsole.decisionGraph.recentRootChipAria',
                        {
                          defaultMessage: 'Apply recent subject {subject}',
                          values: { subject: chipText },
                        }
                      )}
                      data-test-subj={`argusConsoleDecisionGraphRecentRootChip-${root.kind}-${root.id}`}
                    >
                      {chipText}
                    </EuiBadge>
                  </EuiToolTip>
                </EuiFlexItem>
              );
            })}
          </EuiFlexGroup>
        </>
      ) : null}

      <EuiSpacer size="s" />

      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.showKindsLabel', {
              defaultMessage: 'Show kinds:',
            })}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFilterGroup compressed>
            {ALL_NODE_KINDS.map((kind) => (
              <EuiFilterButton
                key={kind}
                hasActiveFilters={!hiddenKinds.has(kind)}
                onClick={() => toggleKind(kind)}
                data-test-subj={`argusConsoleDecisionGraphKindFilter-${kind}`}
              >
                {kind}
              </EuiFilterButton>
            ))}
          </EuiFilterGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {i18n.translate(
              'securitySolutionPackages.argusConsole.decisionGraph.minStrengthLabel',
              { defaultMessage: 'Min edge strength:' }
            )}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ width: 120 }}>
          <EuiSelect
            compressed
            aria-label={i18n.translate(
              'securitySolutionPackages.argusConsole.decisionGraph.minStrengthAriaLabel',
              { defaultMessage: 'Minimum edge strength' }
            )}
            options={STRENGTH_OPTIONS}
            value={String(strengthThreshold)}
            onChange={(e) => setStrengthThreshold(Number(e.target.value))}
            data-test-subj="argusConsoleDecisionGraphStrength"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            iconType="exportAction"
            size="xs"
            isDisabled={!filtered || filtered.nodes.length === 0}
            onClick={exportJson}
            data-test-subj="argusConsoleDecisionGraphExport"
          >
            {i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.exportJson', {
              defaultMessage: 'Export JSON',
            })}
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {!rootKind || !rootId ? (
        <EuiEmptyPrompt
          iconType="graphApp"
          title={
            <h2>
              {i18n.translate(
                'securitySolutionPackages.argusConsole.decisionGraph.emptyRootTitle',
                { defaultMessage: 'No root selected' }
              )}
            </h2>
          }
          body={
            <EuiText>
              {i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.emptyRootBody', {
                defaultMessage:
                  'Enter a subject above — e.g. advisory:CVE-2024-27198 — or open the flyout from a reasoning step.',
              })}
            </EuiText>
          }
        />
      ) : null}

      {state.status === 'loading' ? <EuiSkeletonText lines={6} /> : null}

      {state.status === 'error' ? (
        <EuiCallOut
          color="danger"
          title={i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.errorTitle', {
            defaultMessage: 'Unable to load decision graph',
          })}
        >
          {state.error.message}
        </EuiCallOut>
      ) : null}

      {state.status === 'success' && state.data.nodes.length === 0 ? (
        <EuiCallOut
          color="warning"
          title={i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.emptyTitle', {
            defaultMessage: 'No neighborhood found',
          })}
        >
          {i18n.translate('securitySolutionPackages.argusConsole.decisionGraph.emptyBodyPanel', {
            defaultMessage: 'No edges in `.soc-decision-graph` touch this root.',
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

      {state.status === 'success' && rootKind && rootId && filtered && filtered.nodes.length > 0 ? (
        <EuiFlexGroup gutterSize="m" alignItems="flexStart">
          <EuiFlexItem grow={7}>
            <DecisionGraphSvg
              rootKind={rootKind}
              rootId={rootId}
              nodes={filtered.nodes}
              edges={filtered.edges}
              onSelectNode={setSelected}
              selectedKey={selected ? `${selected.kind}:${selected.id}` : undefined}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={3}>
            <EuiTitle size="xs">
              <h4>
                {i18n.translate(
                  'securitySolutionPackages.argusConsole.decisionGraph.selectionTitle',
                  { defaultMessage: 'Selection' }
                )}
              </h4>
            </EuiTitle>
            <EuiSpacer size="xs" />
            {selected ? (
              <>
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
                <EuiSpacer size="s" />
                <EuiButton
                  iconType="branch"
                  size="s"
                  onClick={() => onSubjectApply({ kind: selected.kind, id: selected.id })}
                  data-test-subj="argusConsoleDecisionGraphRerootFromSelection"
                >
                  {i18n.translate(
                    'securitySolutionPackages.argusConsole.decisionGraph.rerootHere',
                    { defaultMessage: 'Re-root here' }
                  )}
                </EuiButton>
              </>
            ) : (
              <EuiText size="s" color="subdued">
                {i18n.translate(
                  'securitySolutionPackages.argusConsole.decisionGraph.selectionHint',
                  {
                    defaultMessage:
                      'Click a node to see its details and re-root the graph from it.',
                  }
                )}
              </EuiText>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : null}
    </EuiPanel>
  );
};

const applyFilters = (
  data: DecisionGraphResponse | undefined,
  hiddenKinds: ReadonlySet<DecisionGraphNodeKind>,
  minStrength: number
): DecisionGraphResponse | undefined => {
  if (!data) return undefined;

  const nodes: DecisionGraphNode[] = data.nodes.filter((n) => !hiddenKinds.has(n.kind));
  const keep = new Set(nodes.map((n) => `${n.kind}:${n.id}`));

  const edges: DecisionGraphEdge[] = data.edges.filter((e) => {
    if (hiddenKinds.has(e.from_kind) || hiddenKinds.has(e.to_kind)) return false;
    if (!keep.has(`${e.from_kind}:${e.from_id}`) || !keep.has(`${e.to_kind}:${e.to_id}`)) {
      return false;
    }
    if (typeof e.strength === 'number' && e.strength < minStrength) return false;
    return true;
  });

  return { ...data, nodes, edges };
};

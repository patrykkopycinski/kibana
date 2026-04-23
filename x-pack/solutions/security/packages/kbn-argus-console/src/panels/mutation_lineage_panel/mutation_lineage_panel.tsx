/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiBadge,
  EuiCallOut,
  EuiDescriptionList,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSkeletonText,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import type {
  ArgusArtifactDetails,
  LineageEdge,
  LineageNode,
  LineageNodeStatus,
  MutationLineageSubject,
} from '@kbn/argus-console-common';
import type { ArgusHttp } from '../../hooks';
import { useMutationLineage } from '../../hooks';
import { SubjectPicker } from '../subject_picker/subject_picker';
import {
  ArgusArtifactDetailsFlyout,
  DocumentNarrativeSummary,
  type ArgusArtifactPivotTarget,
} from '../artifact_details_flyout';
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  nodeCenter,
  nodeTopLeft,
  viewBoxHeight,
  viewBoxWidth,
} from './layout';

const STATUS_COLORS: Record<LineageNodeStatus, { fill: string; stroke: string; text: string }> = {
  done: { fill: '#E6F9F7', stroke: '#00BFB3', text: '#006D66' },
  pending: { fill: '#FFF9E8', stroke: '#FEC514', text: '#8A6100' },
  error: { fill: '#FBEAE9', stroke: '#BD271E', text: '#7F1812' },
  skipped: { fill: '#F5F7FA', stroke: '#D3DAE6', text: '#69707D' },
};

const LINEAGE_KINDS = [
  { value: 'alert' as const, label: 'Alert' },
  { value: 'rule' as const, label: 'Rule' },
  { value: 'mutation' as const, label: 'Mutation' },
] as const;

export interface MutationLineagePanelProps {
  readonly http: ArgusHttp;
  readonly subject: MutationLineageSubject | undefined;
  readonly onSubjectChange?: (subject: MutationLineageSubject | undefined) => void;
  /**
   * Optional forwarder so pivot buttons in the shared node-details flyout
   * (Reasoning / Lineage / Decision graph) can land in the corresponding
   * console panels.
   */
  readonly onPivot?: (target: ArgusArtifactPivotTarget) => void;
}

export const MutationLineagePanel: React.FC<MutationLineagePanelProps> = ({
  http,
  subject,
  onSubjectChange,
  onPivot,
}) => {
  const [selectedNode, setSelectedNode] = useState<LineageNode | undefined>(undefined);
  const state = useMutationLineage({ http, subject });

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="argusConsoleMutationLineagePanel">
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{'Mutation lineage'}</h3>
          </EuiTitle>
          <EuiText size="s" color="subdued">
            {subject
              ? `Subject: ${subject.kind}:${subject.id}`
              : 'Select a mutation (alert id or rule id) to render the DAG.'}
          </EuiText>
        </EuiFlexItem>
        {state.status === 'success' && state.data.lineage ? (
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{state.data.lineage.mutation_intent_id}</EuiBadge>
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>

      {onSubjectChange ? (
        <>
          <EuiSpacer size="s" />
          <SubjectPicker
            kinds={LINEAGE_KINDS}
            value={subject}
            placeholder="alert-id, rule-id, or mut-intent-id"
            onApply={onSubjectChange}
            testSubj="argusConsoleMutationLineageSubject"
          />
        </>
      ) : null}

      <EuiSpacer size="m" />

      {state.status === 'idle' ? (
        <EuiEmptyPrompt
          iconType="branch"
          title={<h2>{'No mutation selected'}</h2>}
          body={
            <EuiText>
              {
                'Pick an event from the activity feed or open from an alert flyout to view its lineage.'
              }
            </EuiText>
          }
        />
      ) : null}

      {state.status === 'loading' ? <EuiSkeletonText lines={4} /> : null}

      {state.status === 'error' ? (
        <EuiCallOut color="danger" title="Unable to load mutation lineage">
          {state.error.message}
        </EuiCallOut>
      ) : null}

      {state.status === 'success' && state.data.reason_code !== 'ok' ? (
        <EuiCallOut color="warning" title="No lineage available">
          {state.data.reason_code === 'not_found'
            ? 'No mutation intent found for this subject.'
            : 'You are not authorized to view this lineage.'}
        </EuiCallOut>
      ) : null}

      {state.status === 'success' && state.data.lineage ? (
        <LineageSvg
          nodes={state.data.lineage.nodes}
          edges={state.data.lineage.edges}
          onSelectNode={setSelectedNode}
        />
      ) : null}

      {selectedNode ? (
        <LineageNodeDetailsFlyout
          http={http}
          node={selectedNode}
          onClose={() => setSelectedNode(undefined)}
          onPivot={onPivot}
        />
      ) : null}
    </EuiPanel>
  );
};

/**
 * Shared node-details flyout. Nodes always carry a `source_index` /
 * `source_doc_id` because the builder populates them from the underlying
 * `.soc-mutation-intents` / `.soc-argus-eval-runs` / `.soc-outcomes`
 * documents, but we gracefully degrade to a summary-only view when a
 * synthetic node slips through without them.
 */
const LineageNodeDetailsFlyout: React.FC<{
  readonly http: ArgusHttp;
  readonly node: LineageNode;
  readonly onClose: () => void;
  readonly onPivot?: (target: ArgusArtifactPivotTarget) => void;
}> = ({ http, node, onClose, onPivot }) => {
  const renderSummary = (details: ArgusArtifactDetails | undefined): React.ReactNode => (
    <>
      <EuiDescriptionList
        compressed
        listItems={[
          { title: 'Stage', description: node.type },
          { title: 'Status', description: node.status },
          ...(node.subtitle ? [{ title: 'Detail', description: node.subtitle }] : []),
          ...(node.timestamp ? [{ title: 'Timestamp', description: node.timestamp }] : []),
        ]}
      />
      <EuiSpacer size="m" />
      <DocumentNarrativeSummary
        details={details}
        dataTestSubj="argusConsoleMutationLineageNarrative"
      />
    </>
  );

  // Fall back to the mutation-intents index + the node id as a search-time
  // lookup key. The server's `fetchRawDocument` does a `get` then a search
  // fallback, so this still resolves for docs whose id isn't a pure `_id`.
  const sourceIndex = node.source_index ?? '.soc-mutation-intents';
  const sourceDocId = node.source_doc_id ?? node.id;

  return (
    <ArgusArtifactDetailsFlyout
      http={http}
      title={node.label}
      subtitle={`${node.type} · ${node.status}`}
      sourceIndex={sourceIndex}
      sourceDocId={sourceDocId}
      includeRelated={[
        'rule',
        'mutation_intent',
        'reasoning_trace',
        'outcome',
        'backtest',
        'post_apply_observation',
      ]}
      onClose={onClose}
      renderSummary={renderSummary}
      onPivot={onPivot}
      dataTestSubj="argusConsoleMutationLineageFlyout"
    />
  );
};

interface LineageSvgProps {
  readonly nodes: readonly LineageNode[];
  readonly edges: readonly LineageEdge[];
  readonly onSelectNode: (node: LineageNode) => void;
}

const LineageSvg: React.FC<LineageSvgProps> = ({ nodes, edges, onSelectNode }) => {
  return (
    <svg
      role="img"
      aria-label="Mutation lineage graph"
      viewBox={`-20 -20 ${viewBoxWidth} ${viewBoxHeight}`}
      width="100%"
      data-test-subj="argusConsoleMutationLineageSvg"
    >
      {edges.map((edge, idx) => (
        <LineageEdgeLine key={`edge-${idx}`} edge={edge} />
      ))}
      {nodes.map((node) => (
        <LineageNodeBox key={node.id} node={node} onClick={onSelectNode} />
      ))}
    </svg>
  );
};

const LineageEdgeLine: React.FC<{ readonly edge: LineageEdge }> = ({ edge }) => {
  const a = nodeCenter(edge.from);
  const b = nodeCenter(edge.to);

  const colorByKind: Record<LineageEdge['kind'], string> = {
    flow: '#98A2B3',
    drift: '#FEC514',
    rollback: '#BD271E',
  };
  const color = colorByKind[edge.kind];

  if (edge.kind === 'flow' && a.y === b.y) {
    const aRight = { x: a.x + NODE_WIDTH / 2, y: a.y };
    const bLeft = { x: b.x - NODE_WIDTH / 2, y: b.y };
    return (
      <g>
        <line
          x1={aRight.x}
          y1={aRight.y}
          x2={bLeft.x - 4}
          y2={bLeft.y}
          stroke={color}
          strokeWidth={1.5}
        />
        <ArrowHead x={bLeft.x - 4} y={bLeft.y} color={color} />
      </g>
    );
  }

  const mid = {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2 + (edge.kind === 'rollback' ? 70 : 40),
  };
  const path = `M ${a.x},${a.y} Q ${mid.x},${mid.y} ${b.x},${b.y}`;
  return (
    <g>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="4 3" />
      <ArrowHead x={b.x} y={b.y} color={color} />
      {edge.label ? (
        <text x={mid.x} y={mid.y - 6} textAnchor="middle" fontSize={11} fill={color}>
          {edge.label}
        </text>
      ) : null}
    </g>
  );
};

const ArrowHead: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
  <polygon points={`${x},${y} ${x - 5},${y - 3} ${x - 5},${y + 3}`} fill={color} />
);

const LineageNodeBox: React.FC<{
  readonly node: LineageNode;
  readonly onClick: (node: LineageNode) => void;
}> = ({ node, onClick }) => {
  const tl = nodeTopLeft(node.type);
  const colors = STATUS_COLORS[node.status];

  return (
    <g
      onClick={() => onClick(node)}
      style={{ cursor: 'pointer' }}
      data-test-subj={`argusConsoleMutationLineageNode-${node.type}`}
    >
      <rect
        x={tl.x}
        y={tl.y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={6}
        ry={6}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={1.5}
      />
      <text
        x={tl.x + NODE_WIDTH / 2}
        y={tl.y + 22}
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        fill={colors.text}
      >
        {node.label.length > 22 ? `${node.label.slice(0, 22)}\u2026` : node.label}
      </text>
      <text
        x={tl.x + NODE_WIDTH / 2}
        y={tl.y + 40}
        textAnchor="middle"
        fontSize={10}
        fill={colors.text}
      >
        {`${node.type} · ${node.status}`}
      </text>
    </g>
  );
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';

import type {
  DecisionGraphEdge,
  DecisionGraphNode,
  DecisionGraphNodeKind,
} from '@kbn/argus-console-common';

/**
 * Colours per node kind. Tuned to stay readable on both light and dark EUI
 * themes and to visually separate "action-ish" nodes (intent/outcome/audit)
 * from "subject-ish" nodes (advisory/rule/technique/actor/reasoning).
 */
const KIND_COLORS: Record<DecisionGraphNodeKind, { fill: string; stroke: string; text: string }> = {
  advisory: { fill: '#FBEAE9', stroke: '#BD271E', text: '#7F1812' },
  intent: { fill: '#FFF9E8', stroke: '#FEC514', text: '#8A6100' },
  outcome: { fill: '#E6F9F7', stroke: '#00BFB3', text: '#006D66' },
  rule: { fill: '#EEF4FF', stroke: '#0077CC', text: '#0B3B73' },
  actor: { fill: '#F5EEFB', stroke: '#8B5CF6', text: '#4C1D95' },
  technique: { fill: '#EEF7E5', stroke: '#5DAE3A', text: '#255C00' },
  reasoning: { fill: '#EAF3FB', stroke: '#4D7BB0', text: '#14416B' },
  audit: { fill: '#F5F7FA', stroke: '#69707D', text: '#343741' },
  observation: { fill: '#F5F7FA', stroke: '#98A2B3', text: '#343741' },
};

const NODE_RADIUS_ROOT = 46;
const NODE_RADIUS_RING = 36;
const LABEL_LINE_HEIGHT = 12;
const KIND_LABEL_GAP = 12;
const VIEW_PADDING = 36;
const BASE_RING_RADIUS = 170;
const MIN_NODE_ARC_GAP = 18;

export interface DecisionGraphSvgProps {
  readonly rootKind: DecisionGraphNodeKind;
  readonly rootId: string;
  readonly nodes: readonly DecisionGraphNode[];
  readonly edges: readonly DecisionGraphEdge[];
  readonly onSelectNode?: (node: DecisionGraphNode) => void;
  /**
   * Currently-selected node key (`${kind}:${id}`). When provided the graph
   * highlights the selection and dims edges/nodes that are not adjacent.
   */
  readonly selectedKey?: string;
}

interface LaidOutNode {
  readonly node: DecisionGraphNode;
  readonly x: number;
  readonly y: number;
  readonly ring: number;
}

interface LayoutResult {
  readonly positions: Map<string, LaidOutNode>;
  readonly viewBox: { readonly width: number; readonly height: number };
  readonly center: { readonly x: number; readonly y: number };
}

/**
 * Radial layout with two readability improvements:
 *
 *   1. The radius of each ring grows with the number of nodes it has to
 *      accommodate, so ring 1 does not stay at the fixed base gap when it
 *      needs to fit 8+ neighbours.
 *   2. Nodes on ring N are ordered by the average angle of their parents on
 *      ring N-1, so edges generally point outward instead of zig-zagging
 *      across the plane. This drastically reduces edge crossings without
 *      pulling in a full force-directed layout.
 *
 * The final viewBox is computed from the actual node positions so the SVG
 * never clips when a long label pushes a node off the edge.
 */
const layoutNodes = (
  rootKey: string,
  nodes: readonly DecisionGraphNode[],
  edges: readonly DecisionGraphEdge[]
): LayoutResult => {
  const byKey = new Map<string, DecisionGraphNode>();
  for (const node of nodes) {
    byKey.set(`${node.kind}:${node.id}`, node);
  }

  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) adjacency.set(`${node.kind}:${node.id}`, new Set());
  for (const edge of edges) {
    const a = `${edge.from_kind}:${edge.from_id}`;
    const b = `${edge.to_kind}:${edge.to_id}`;
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
  }

  const ringByKey = new Map<string, number>();
  ringByKey.set(rootKey, 0);
  const queue: string[] = [rootKey];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    const ring = ringByKey.get(cur) ?? 0;
    for (const neighbor of adjacency.get(cur) ?? []) {
      if (!ringByKey.has(neighbor)) {
        ringByKey.set(neighbor, ring + 1);
        queue.push(neighbor);
      }
    }
  }

  let maxRing = 0;
  ringByKey.forEach((r) => {
    if (r > maxRing) maxRing = r;
  });
  for (const node of nodes) {
    const key = `${node.kind}:${node.id}`;
    if (!ringByKey.has(key)) ringByKey.set(key, maxRing + 1);
  }
  maxRing = 0;
  ringByKey.forEach((r) => {
    if (r > maxRing) maxRing = r;
  });

  const ringBuckets = new Map<number, string[]>();
  ringByKey.forEach((ring, key) => {
    const bucket = ringBuckets.get(ring) ?? [];
    bucket.push(key);
    ringBuckets.set(ring, bucket);
  });

  const positions = new Map<string, LaidOutNode>();
  const rootNode = byKey.get(rootKey);
  if (rootNode) {
    positions.set(rootKey, { node: rootNode, x: 0, y: 0, ring: 0 });
  }

  let outerRadius = NODE_RADIUS_ROOT;
  for (let ring = 1; ring <= maxRing; ring += 1) {
    const ringKeys = ringBuckets.get(ring) ?? [];
    if (ringKeys.length === 0) break;

    const anchors = ringKeys.map((key) => {
      const parents = Array.from(adjacency.get(key) ?? [])
        .map((neighbor) => positions.get(neighbor))
        .filter((entry): entry is LaidOutNode => entry !== undefined && entry.ring === ring - 1);
      if (parents.length === 0) {
        return { key, angle: 0, anchored: false };
      }
      const sx = parents.reduce((acc, parent) => acc + parent.x, 0);
      const sy = parents.reduce((acc, parent) => acc + parent.y, 0);
      if (sx === 0 && sy === 0) {
        return { key, angle: 0, anchored: false };
      }
      return { key, angle: Math.atan2(sy, sx), anchored: true };
    });

    // Distribute un-anchored nodes (no parent on the previous ring, e.g.
    // edge-less neighbours of the root) evenly across the free gaps so the
    // sort order stays stable.
    const unanchored = anchors.filter((a) => !a.anchored);
    if (unanchored.length > 0) {
      unanchored.forEach((entry, idx) => {
        entry.angle = -Math.PI + (idx / Math.max(unanchored.length, 1)) * Math.PI * 2 * 0.98;
      });
    }

    anchors.sort((a, b) => a.angle - b.angle);
    const count = anchors.length;
    const minChord = 2 * (NODE_RADIUS_RING + MIN_NODE_ARC_GAP);
    const radiusByCount = (minChord * count) / (2 * Math.PI);
    const radius = Math.max(BASE_RING_RADIUS + (ring - 1) * (BASE_RING_RADIUS - 30), radiusByCount);

    // Centre the placement on the mean anchor angle so a tight cluster of
    // neighbours (e.g. all six rule-related nodes sitting "below" the root)
    // stays together instead of being flung around the circle.
    const meanAnchor = circularMean(anchors.map((a) => a.angle));
    anchors.forEach((entry, idx) => {
      const angle = meanAnchor - Math.PI + (idx / count) * Math.PI * 2;
      const node = byKey.get(entry.key);
      if (!node) return;
      positions.set(entry.key, {
        node,
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
        ring,
      });
    });

    outerRadius = Math.max(outerRadius, radius + NODE_RADIUS_RING);
  }

  const width = 2 * (outerRadius + VIEW_PADDING);
  const height = 2 * (outerRadius + VIEW_PADDING);
  return {
    positions,
    viewBox: { width, height },
    center: { x: width / 2, y: height / 2 },
  };
};

export const DecisionGraphSvg: React.FC<DecisionGraphSvgProps> = ({
  rootKind,
  rootId,
  nodes,
  edges,
  onSelectNode,
  selectedKey,
}) => {
  const rootKey = `${rootKind}:${rootId}`;
  const layout = useMemo(() => layoutNodes(rootKey, nodes, edges), [rootKey, nodes, edges]);
  const [hoveredKey, setHoveredKey] = useState<string | undefined>(undefined);

  const activeKey = hoveredKey ?? selectedKey;
  const neighborKeys = useMemo(() => {
    if (!activeKey) return undefined;
    const neighbors = new Set<string>([activeKey]);
    for (const edge of edges) {
      const a = `${edge.from_kind}:${edge.from_id}`;
      const b = `${edge.to_kind}:${edge.to_id}`;
      if (a === activeKey) neighbors.add(b);
      if (b === activeKey) neighbors.add(a);
    }
    return neighbors;
  }, [activeKey, edges]);

  const { viewBox, center, positions } = layout;

  return (
    <svg
      role="img"
      aria-label={i18n.translate(
        'securitySolutionPackages.argusConsole.decisionGraph.svgAriaLabel',
        { defaultMessage: 'ARGUS decision graph' }
      )}
      viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      data-test-subj="argusConsoleDecisionGraphSvg"
      style={{ background: '#FAFBFD', borderRadius: 6, maxHeight: '70vh' }}
    >
      <defs>
        <marker
          id="argus-dg-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,8 L8,4 z" fill="#98A2B3" />
        </marker>
        <marker
          id="argus-dg-arrow-active"
          markerWidth="10"
          markerHeight="10"
          refX="7"
          refY="5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,10 L10,5 z" fill="#3366CC" />
        </marker>
      </defs>

      {edges.map((edge) => {
        const fromKey = `${edge.from_kind}:${edge.from_id}`;
        const toKey = `${edge.to_kind}:${edge.to_id}`;
        const from = positions.get(fromKey);
        const to = positions.get(toKey);
        if (!from || !to) return null;
        const isConnectedToActive =
          activeKey && (fromKey === activeKey || toKey === activeKey) ? true : false;
        const dimmed = activeKey ? !isConnectedToActive : false;
        const baseOpacity = typeof edge.strength === 'number' ? 0.35 + edge.strength * 0.55 : 0.55;
        const opacity = dimmed
          ? 0.08
          : isConnectedToActive
          ? Math.min(1, baseOpacity + 0.25)
          : baseOpacity;
        const strokeWidth = isConnectedToActive
          ? typeof edge.strength === 'number'
            ? 1.4 + edge.strength * 2.4
            : 2.2
          : typeof edge.strength === 'number'
          ? 1 + edge.strength * 2
          : 1.25;
        const stroke = isConnectedToActive ? '#3366CC' : '#98A2B3';
        const marker = isConnectedToActive ? 'url(#argus-dg-arrow-active)' : 'url(#argus-dg-arrow)';
        return (
          <line
            key={edge.edge_id}
            x1={center.x + from.x}
            y1={center.y + from.y}
            x2={center.x + to.x}
            y2={center.y + to.y}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={opacity}
            markerEnd={marker}
          />
        );
      })}

      {Array.from(positions.values()).map(({ node, x, y, ring }) => {
        const key = `${node.kind}:${node.id}`;
        const color = KIND_COLORS[node.kind];
        const r = ring === 0 ? NODE_RADIUS_ROOT : NODE_RADIUS_RING;
        const isSelected = key === selectedKey;
        const isActive = key === activeKey;
        const isNeighbor = neighborKeys?.has(key) ?? true;
        const dimmed = activeKey ? !isNeighbor : false;
        const strokeWidth = isSelected ? 3.5 : isActive ? 3 : 2;
        const labelLines = wrapLabel(node.label, ring === 0 ? 16 : 14, 2);
        const labelOffset = -((labelLines.length - 1) * LABEL_LINE_HEIGHT) / 2;
        return (
          <g
            key={key}
            transform={`translate(${center.x + x}, ${center.y + y})`}
            style={{
              cursor: onSelectNode ? 'pointer' : 'default',
              opacity: dimmed ? 0.3 : 1,
              transition: 'opacity 120ms ease',
            }}
            onClick={onSelectNode ? () => onSelectNode(node) : undefined}
            onMouseEnter={() => setHoveredKey(key)}
            onMouseLeave={() => setHoveredKey((current) => (current === key ? undefined : current))}
            data-test-subj={`argusConsoleDecisionGraphNode-${node.kind}-${node.id}`}
          >
            <title>{`${node.kind} · ${node.label} (${node.id})`}</title>
            {isSelected ? (
              <circle
                r={r + 6}
                fill="none"
                stroke={color.stroke}
                strokeWidth={1.5}
                strokeOpacity={0.35}
              />
            ) : null}
            <circle r={r} fill={color.fill} stroke={color.stroke} strokeWidth={strokeWidth} />
            {labelLines.map((line, idx) => (
              <text
                key={idx}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={ring === 0 ? 12 : 11}
                fontWeight={ring === 0 ? 700 : 500}
                fill={color.text}
                y={labelOffset + idx * LABEL_LINE_HEIGHT}
              >
                {line}
              </text>
            ))}
            <text
              textAnchor="middle"
              dominantBaseline="hanging"
              fontSize={10}
              fontWeight={500}
              fill={color.text}
              y={r + KIND_LABEL_GAP - 8}
              opacity={0.85}
            >
              {node.kind}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/**
 * Wrap a label onto at most `maxLines` lines of `maxChars` characters each.
 * Prefers to break on natural separators (`-`, `.`, `_`, ` `, `/`) to keep
 * identifier segments intact; falls back to hard slicing when a single
 * segment is longer than the line budget. The final line is suffixed with
 * an ellipsis when the label still overflows.
 */
const wrapLabel = (value: string, maxChars: number, maxLines: number): string[] => {
  if (!value) return [''];
  if (value.length <= maxChars) return [value];

  const segments = value.split(/([\-._/\s])/);
  const lines: string[] = [];
  let current = '';

  const flush = () => {
    if (current.length > 0) {
      lines.push(current);
      current = '';
    }
  };

  for (const segment of segments) {
    if (segment === '') {
      // skip empty separator matches
    } else if ((current + segment).length <= maxChars) {
      current += segment;
    } else {
      if (current.length > 0) flush();
      if (segment.length > maxChars) {
        for (let i = 0; i < segment.length && lines.length < maxLines; i += maxChars) {
          lines.push(segment.slice(i, i + maxChars));
        }
        current = '';
      } else {
        current = segment;
      }
    }
    if (lines.length >= maxLines) break;
  }
  flush();

  if (lines.length === 0) return [value.slice(0, maxChars)];
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    kept[maxLines - 1] =
      last.length > maxChars - 1 ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
    return kept;
  }
  // Trim leading/trailing whitespace that came from separator segments.
  return lines.map((l) => l.replace(/^\s+|\s+$/g, '')).filter((l) => l.length > 0);
};

/**
 * Circular mean of angles (in radians). Avoids the wraparound bug a plain
 * arithmetic mean has when angles straddle ±π.
 */
const circularMean = (angles: readonly number[]): number => {
  if (angles.length === 0) return 0;
  let sx = 0;
  let sy = 0;
  for (const a of angles) {
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  if (sx === 0 && sy === 0) return 0;
  return Math.atan2(sy, sx);
};

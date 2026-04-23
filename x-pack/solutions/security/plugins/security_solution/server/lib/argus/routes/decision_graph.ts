/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import type { ElasticsearchClient } from '@kbn/core/server';

import {
  ARGUS_SOC_INDICES,
  DECISION_GRAPH_ROUTE,
  type DecisionGraphEdge,
  type DecisionGraphNode,
  type DecisionGraphNodeKind,
  type DecisionGraphResponse,
} from '@kbn/argus-console-common';

import type { ArgusRoutesDeps } from '../types';

/**
 * BFS is capped at this depth regardless of what the client asks for.
 * Deeper neighborhoods quickly produce unreadable graphs and blow the UI
 * renderer's per-frame budget, so we clamp on the server.
 */
const MAX_DEPTH = 3;

/**
 * Hard cap on nodes in a single response. If we hit this, we truncate and set
 * `truncated: true` so the UI can render a callout.
 */
const MAX_NODES = 200;

/**
 * How many edges we fetch per BFS frontier. 500 is enough for all realistic
 * demo neighborhoods and stays well below the ES default query limit.
 */
const FETCH_SIZE = 500;

const NODE_KINDS: readonly DecisionGraphNodeKind[] = [
  'advisory',
  'intent',
  'outcome',
  'rule',
  'actor',
  'technique',
  'reasoning',
  'audit',
  'observation',
] as const;

const querySchema = schema.object({
  root_kind: schema.oneOf([
    schema.literal('advisory'),
    schema.literal('intent'),
    schema.literal('outcome'),
    schema.literal('rule'),
    schema.literal('actor'),
    schema.literal('technique'),
    schema.literal('reasoning'),
    schema.literal('audit'),
    schema.literal('observation'),
  ]),
  root_id: schema.string({ minLength: 1, maxLength: 1024 }),
  depth: schema.maybe(schema.number({ min: 1, max: MAX_DEPTH })),
});

interface RawEdgeSource {
  readonly edge_id?: string;
  readonly relation?: string;
  readonly strength?: number;
  readonly evidence_ts?: string;
  readonly from_kind?: string;
  readonly from_id?: string;
  readonly from_label?: string;
  readonly to_kind?: string;
  readonly to_id?: string;
  readonly to_label?: string;
  readonly provenance?: {
    readonly source_index?: string;
    readonly source_doc_id?: string;
  };
}

const isNodeKind = (value: unknown): value is DecisionGraphNodeKind =>
  typeof value === 'string' && (NODE_KINDS as readonly string[]).includes(value);

export const registerDecisionGraphRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: DECISION_GRAPH_ROUTE,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution'],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: { request: { query: querySchema } },
      },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);
        try {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asCurrentUser;

          const rootKind = request.query.root_kind as DecisionGraphNodeKind;
          const rootId = request.query.root_id;
          const depth = Math.min(request.query.depth ?? 2, MAX_DEPTH);

          const payload = await buildDecisionGraph({
            esClient,
            rootKind,
            rootId,
            depth,
          });

          return response.ok({ body: payload });
        } catch (err) {
          const error = transformError(err);
          logger.error(`Argus decision_graph route failed: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};

/**
 * BFS over `.soc-decision-graph` starting at `(rootKind, rootId)`. Each BFS
 * frame issues a single ES query over the union `from_id OR to_id` against the
 * current frontier set, so depth=2 costs 2 ES round-trips regardless of node
 * count.
 *
 * Edges are de-duped by `edge_id`; nodes are de-duped by `kind:id`. Edge
 * directionality is preserved as it appears in the source doc.
 */
export const buildDecisionGraph = async (args: {
  esClient: ElasticsearchClient;
  rootKind: DecisionGraphNodeKind;
  rootId: string;
  depth: number;
}): Promise<DecisionGraphResponse> => {
  const { esClient, rootKind, rootId, depth } = args;

  const nodeKey = (kind: DecisionGraphNodeKind, id: string) => `${kind}:${id}`;

  const nodes = new Map<string, DecisionGraphNode>();
  const edges = new Map<string, DecisionGraphEdge>();
  let truncated = false;

  // Seed the root so a neighborhood with no outgoing edges still renders
  // something the user can see.
  nodes.set(nodeKey(rootKind, rootId), {
    kind: rootKind,
    id: rootId,
    label: rootId,
  });

  let frontier: Array<{ kind: DecisionGraphNodeKind; id: string }> = [
    { kind: rootKind, id: rootId },
  ];
  const visited = new Set<string>([nodeKey(rootKind, rootId)]);

  for (let level = 0; level < depth && frontier.length > 0; level++) {
    const raw = await fetchEdgesTouching(esClient, frontier);
    const nextFrontier: Array<{ kind: DecisionGraphNodeKind; id: string }> = [];

    for (const hit of raw) {
      if (nodes.size >= MAX_NODES) {
        truncated = true;
        break;
      }

      const edge = mapEdge(hit);
      if (edge && !edges.has(edge.edge_id)) {
        edges.set(edge.edge_id, edge);

        const fromLabel = hit.from_label || edge.from_id;
        const toLabel = hit.to_label || edge.to_id;

        const fromKey = nodeKey(edge.from_kind, edge.from_id);
        if (!nodes.has(fromKey)) {
          nodes.set(fromKey, {
            kind: edge.from_kind,
            id: edge.from_id,
            label: fromLabel,
            evidence_ts: edge.evidence_ts,
          });
        }
        const toKey = nodeKey(edge.to_kind, edge.to_id);
        if (!nodes.has(toKey)) {
          nodes.set(toKey, {
            kind: edge.to_kind,
            id: edge.to_id,
            label: toLabel,
            evidence_ts: edge.evidence_ts,
          });
        }

        if (!visited.has(fromKey)) {
          visited.add(fromKey);
          nextFrontier.push({ kind: edge.from_kind, id: edge.from_id });
        }
        if (!visited.has(toKey)) {
          visited.add(toKey);
          nextFrontier.push({ kind: edge.to_kind, id: edge.to_id });
        }
      }
    }

    if (nodes.size >= MAX_NODES) {
      truncated = true;
      break;
    }
    frontier = nextFrontier;
  }

  return {
    root: { kind: rootKind, id: rootId },
    depth,
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    truncated,
  };
};

const mapEdge = (hit: RawEdgeSource): DecisionGraphEdge | undefined => {
  if (
    !hit.edge_id ||
    !hit.relation ||
    !isNodeKind(hit.from_kind) ||
    !isNodeKind(hit.to_kind) ||
    !hit.from_id ||
    !hit.to_id
  ) {
    return undefined;
  }
  return {
    edge_id: hit.edge_id,
    relation: hit.relation,
    from_kind: hit.from_kind,
    from_id: hit.from_id,
    to_kind: hit.to_kind,
    to_id: hit.to_id,
    strength: typeof hit.strength === 'number' ? hit.strength : undefined,
    evidence_ts: hit.evidence_ts,
    provenance:
      hit.provenance?.source_index && hit.provenance?.source_doc_id
        ? {
            source_index: hit.provenance.source_index,
            source_doc_id: hit.provenance.source_doc_id,
          }
        : undefined,
  };
};

const fetchEdgesTouching = async (
  esClient: ElasticsearchClient,
  frontier: ReadonlyArray<{ kind: DecisionGraphNodeKind; id: string }>
): Promise<readonly RawEdgeSource[]> => {
  if (frontier.length === 0) return [];

  const idShoulds = frontier.flatMap((node) => [
    { bool: { must: [{ term: { from_kind: node.kind } }, { term: { from_id: node.id } }] } },
    { bool: { must: [{ term: { to_kind: node.kind } }, { term: { to_id: node.id } }] } },
  ]);

  const res = await esClient.search<RawEdgeSource>({
    index: ARGUS_SOC_INDICES.decisionGraph,
    ignore_unavailable: true,
    size: FETCH_SIZE,
    sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
    track_total_hits: false,
    query: {
      bool: {
        should: idShoulds,
        minimum_should_match: 1,
      },
    },
  });

  const out: RawEdgeSource[] = [];
  for (const hit of res.hits?.hits ?? []) {
    if (hit._source) out.push(hit._source);
  }
  return out;
};

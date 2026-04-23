/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';

/**
 * Shape of a single reasoning-trace span as stored in `.soc-reasoning-trace`.
 *
 * Only the fields the LLM-as-judge needs appear here. The template (see
 * `soc-simulation/setup/index_templates/soc-reasoning-trace.json`) is the
 * authoritative schema and can carry additional OTEL-GenAI envelope fields
 * (gen_ai.*); this loader is intentionally liberal in what it accepts so that
 * schema evolution does not require a code change.
 */
export interface ReasoningSpan {
  run_id: string;
  agent_id?: string;
  step_index: number;
  step_type: string;
  content: string;
  argus?: {
    decision?: {
      kind?: string;
      confidence?: number;
      door_class?: string;
      blast_tier?: string;
    };
  };
  '@timestamp': string;
}

export interface LoadReasoningTracesOptions {
  esClient: Client;
  /** Defaults to `.soc-reasoning-trace`. */
  index?: string;
  /** Elasticsearch relative time floor (e.g. `now-24h`). */
  since?: string;
  /** Max spans to pull per run. */
  maxSpans?: number;
  /** Optional run_id filter. When absent we sample the most recent runs. */
  runId?: string;
}

const DEFAULT_INDEX = '.soc-reasoning-trace';

export const loadReasoningTraces = async ({
  esClient,
  index = DEFAULT_INDEX,
  since = 'now-24h',
  maxSpans = 200,
  runId,
}: LoadReasoningTracesOptions): Promise<ReasoningSpan[]> => {
  const filter: Array<Record<string, unknown>> = [{ range: { '@timestamp': { gte: since } } }];
  if (runId) {
    filter.push({ term: { run_id: runId } });
  }

  const response = await esClient.search<ReasoningSpan>({
    index,
    size: maxSpans,
    sort: [{ '@timestamp': { order: 'desc' } }],
    query: { bool: { filter } },
  });

  const hits = response.hits?.hits ?? [];
  return hits.map((hit) => hit._source).filter((src): src is ReasoningSpan => Boolean(src));
};

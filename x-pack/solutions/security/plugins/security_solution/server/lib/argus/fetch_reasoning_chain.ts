/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import {
  ARGUS_SOC_INDICES,
  buildReasoningChainFromSpanDocs,
  type ReasoningChainBuildResult,
  type ReasoningChainSubject,
  type SpanDocInput,
} from '@kbn/argus-console-common';

const MAX_SPANS = 500;

/**
 * Best-effort lookup of the run_id tied to an alert. Demo-grade: we read the
 * alert's source document from the `.alerts-security.alerts-*` indices and
 * return the first non-empty `kibana.alert.argus.run_id` field we find.
 */
export const resolveRunIdForAlert = async (
  esClient: ElasticsearchClient,
  alertId: string
): Promise<string | undefined> => {
  try {
    const res = await esClient.search<{
      kibana?: { alert?: { argus?: { run_id?: string } } };
    }>({
      index: '.alerts-security.alerts-*',
      ignore_unavailable: true,
      size: 1,
      _source: ['kibana.alert.argus.run_id'],
      query: { ids: { values: [alertId] } },
    });
    const hit = res.hits?.hits?.[0];
    const runId = hit?._source?.kibana?.alert?.argus?.run_id;
    return typeof runId === 'string' && runId.length > 0 ? runId : undefined;
  } catch {
    return undefined;
  }
};

const fetchSpansForRun = async (
  esClient: ElasticsearchClient,
  runId: string
): Promise<SpanDocInput[]> => {
  const res = await esClient.search<SpanDocInput>({
    index: ARGUS_SOC_INDICES.reasoningTrace,
    ignore_unavailable: true,
    size: MAX_SPANS,
    sort: [{ step_index: { order: 'asc', unmapped_type: 'long' } }],
    query: { term: { run_id: runId } },
  });

  return (res.hits?.hits ?? [])
    .map((hit) => hit._source)
    .filter((doc): doc is SpanDocInput => Boolean(doc));
};

/**
 * Canonical Argus reasoning-chain fetch used by both the internal HTTP route
 * and the Agent Builder `security.argus.explain_decision` skill. Keeping a
 * single source of truth preserves agent-native parity — any user who can open
 * the Argus Console panel sees exactly the same payload the agent reasons over.
 */
export const fetchReasoningChain = async (
  esClient: ElasticsearchClient,
  subject: ReasoningChainSubject
): Promise<ReasoningChainBuildResult> => {
  const runId =
    subject.kind === 'run' ? subject.id : await resolveRunIdForAlert(esClient, subject.id);

  if (!runId) {
    return { subject, reason_code: 'no_trace' };
  }

  const docs = await fetchSpansForRun(esClient, runId);
  return buildReasoningChainFromSpanDocs(docs, subject);
};

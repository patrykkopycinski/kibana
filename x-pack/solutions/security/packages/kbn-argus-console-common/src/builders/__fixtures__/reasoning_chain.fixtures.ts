/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SpanDocInput } from '../reasoning_chain_builder';

export const HAPPY_PATH_SPANS: readonly SpanDocInput[] = [
  {
    run_id: 'run-7a3',
    step_index: 0,
    step_type: 'thought',
    '@timestamp': '2026-03-14T12:00:00.000Z',
    actor_id: 'm2.5-default',
    actor_trust_tier: 'trusted',
    confidence: 0.62,
    title: 'Ingest alert; assess novelty',
    body: 'Novel endpoint behavior detected; considering mutation synthesis path.',
  },
  {
    run_id: 'run-7a3',
    step_index: 1,
    step_type: 'tool_call',
    '@timestamp': '2026-03-14T12:00:02.100Z',
    actor_id: 'm2.5-default',
    actor_trust_tier: 'trusted',
    tool_name: 'exploit_probability.estimate',
    tool_args_ref: 'args:abc123',
    title: 'Estimate exploitation probability',
  },
  {
    run_id: 'run-7a3',
    step_index: 2,
    step_type: 'tool_result',
    '@timestamp': '2026-03-14T12:00:04.200Z',
    actor_id: 'exploit-probability',
    actor_trust_tier: 'system',
    confidence: 0.83,
    confidence_delta: 0.21,
    tool_name: 'exploit_probability.estimate',
    tool_result_ref: 'result:abc123',
    title: 'Exploit probability: 0.83',
    body: 'High exploitation probability; mutation recommended.',
  },
  {
    run_id: 'run-7a3',
    step_index: 3,
    step_type: 'decision',
    '@timestamp': '2026-03-14T12:00:05.500Z',
    actor_id: 'm2.5-default',
    actor_trust_tier: 'trusted',
    confidence: 0.88,
    confidence_delta: 0.05,
    title: 'Queue mutation intent for eval',
    source_doc_id: 'mut-intent-42',
    status: 'success',
  },
];

export const INJECTION_FLAGGED_SPANS: readonly SpanDocInput[] = [
  {
    run_id: 'run-9c1',
    step_index: 0,
    step_type: 'tool_result',
    '@timestamp': '2026-03-14T13:00:00.000Z',
    actor_id: 'external-ingest',
    actor_trust_tier: 'probationary',
    confidence: 0.71,
    title: 'External observation ingested',
    injection_surface_flags: [
      {
        code: 'suspicious_prompt_token',
        severity: 'warn',
        reason: 'ignore previous instructions',
      },
    ],
  },
  {
    run_id: 'run-9c1',
    step_index: 1,
    step_type: 'decision',
    '@timestamp': '2026-03-14T13:00:01.000Z',
    actor_id: 'm2.5-default',
    actor_trust_tier: 'trusted',
    confidence: 0.31,
    confidence_delta: -0.4,
    title: 'Reject observation; keep trust tier',
    status: 'success',
  },
];

export const EMPTY_SPANS: readonly SpanDocInput[] = [];

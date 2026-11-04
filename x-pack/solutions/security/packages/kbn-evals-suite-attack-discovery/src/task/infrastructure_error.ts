/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isTransportError } from '@kbn/evals';

/**
 * A task failure that happened before any model response could exist (transport failure, auth
 * or routing failure, throttling, upstream outage, Elasticsearch failure while fetching alerts).
 * `runAttackDiscovery` maps it to `errorKind: 'infrastructure'`, which the quality evaluators
 * score as N/A instead of 0.
 */
export class InfrastructureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'InfrastructureError';
  }
}

// HTTP statuses that mean the request never reached a usable model (auth, routing, throttling,
// upstream outage). Anything else, including 400 (provider refusal / content filter) and 500
// (token limit, context length exceeded, mid-stream provider errors), is the model's outcome.
export const INFRASTRUCTURE_HTTP_STATUSES: ReadonlySet<number> = new Set([
  401, 403, 404, 408, 429, 502, 503, 504,
]);

interface StatusCarrier {
  status?: unknown;
  statusCode?: unknown;
  meta?: { statusCode?: unknown };
}

// Inference errors carry `status`; Elasticsearch client errors carry `statusCode` and
// `meta.statusCode`.
const getNumericStatus = (error: unknown): number | undefined => {
  const carrier = error as StatusCarrier | null | undefined;
  const candidates = [carrier?.status, carrier?.statusCode, carrier?.meta?.statusCode];
  return candidates.find((candidate): candidate is number => typeof candidate === 'number');
};

const MAX_CAUSE_DEPTH = 5;

const isAbortError = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current; depth++) {
    if ((current as { name?: unknown }).name === 'AbortError') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

/**
 * True when a rejected `chatComplete` or alert-search call says nothing about the model: a status in
 * {@link INFRASTRUCTURE_HTTP_STATUSES}, or, when there is no HTTP status at all, only a real
 * transport failure (`isTransportError`, walks the `cause` chain) or an abort. Any other
 * status-less error (for example a `TypeError` from a harness bug) is not evidence about the
 * infrastructure and is scored like a model failure so it fails loudly.
 */
export const isInfrastructureInferenceError = (error: unknown): boolean => {
  const status = getNumericStatus(error);
  if (status !== undefined) return INFRASTRUCTURE_HTTP_STATUSES.has(status);
  return isTransportError(error) || isAbortError(error);
};

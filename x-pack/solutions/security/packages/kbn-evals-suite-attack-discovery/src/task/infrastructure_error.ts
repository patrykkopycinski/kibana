/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

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

const getNumericStatus = (error: unknown): number | undefined => {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return typeof status === 'number' ? status : undefined;
};

/**
 * True when a rejected `chatComplete` call says nothing about the model: no HTTP status at all
 * (transport failure or abort, mirroring `isTransportError` in `@kbn/evals`' kbn client
 * handler), or a status in {@link INFRASTRUCTURE_HTTP_STATUSES}.
 */
export const isInfrastructureInferenceError = (error: unknown): boolean => {
  const status = getNumericStatus(error);
  return status === undefined || INFRASTRUCTURE_HTTP_STATUSES.has(status);
};

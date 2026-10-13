/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator, EvaluationResult } from '@kbn/evals';
import type { ToolingLog } from '@kbn/tooling-log';

/**
 * Connection-level failures that carry no HTTP status: the socket closed before a
 * response arrived. Kibana's idle socket timeout (`server.socketTimeout`, 120s by
 * default) closes the connection under a judge call that waits longer than that for the
 * model, and undici reports it as `SocketError: other side closed` / `fetch failed`.
 */
const TRANSPORT_FAILURE =
  /other side closed|fetch failed|socket hang up|ECONNRESET|UND_ERR_SOCKET|EPIPE/i;

/**
 * Gateway statuses: a proxy in front of Kibana (the serverless project ingress) answered
 * because the backend did not. A remote run saw `502 {"message":"backend closed
 * connection"}` on `/internal/inference/prompt`. The judge request itself was valid, so
 * sending it again is safe.
 */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

const errorStatus = (err: unknown): unknown =>
  (err as { status?: unknown; statusCode?: unknown } | null)?.status ??
  (err as { statusCode?: unknown } | null)?.statusCode;

/**
 * True for transport failures with no HTTP status and for gateway statuses (502/503/504).
 * Any other HTTP status (4xx, 429, 500) is left to the existing retry layers.
 */
export const isTransportFailure = (err: unknown): boolean => {
  const status = errorStatus(err);
  if (typeof status === 'number') {
    return GATEWAY_STATUSES.has(status);
  }
  const cause = (err as { cause?: { code?: unknown; message?: unknown } } | null)?.cause;
  const text = [err instanceof Error ? err.message : String(err), cause?.code, cause?.message].join(
    ' '
  );
  return TRANSPORT_FAILURE.test(text);
};

export interface JudgeRetryOptions {
  log: Pick<ToolingLog, 'warning'>;
  /** Total tries including the first. Default 3. */
  maxAttempts?: number;
  /** Delay before the 2nd try; doubles each retry. Default 5000ms. */
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Retries an LLM-judge evaluator when its `/internal/inference/prompt` call loses the
 * connection or gets a gateway status. kbn-evals sends that call with `retries: 0` and
 * its own handler retries only on HTTP 429/503/504 when `KBN_EVALS_HTTP_RETRIES` is set,
 * so a single closed socket or 502 used to fail the whole spec. A judge call has no side
 * effects, so running it again is safe.
 *
 * When every attempt fails transiently, the judge returns `score: null` with label
 * `unavailable` instead of throwing: kbn-evals runs every evaluator of every run inside
 * one `Promise.all`, so a thrown judge error aborts the experiment and discards all the
 * runs still in flight. A null score is excluded from the judge's mean (it is not a 0
 * and not a pass) and is logged, so the missing judgement stays visible.
 * Non-transient errors (judge schema errors, 4xx) still throw.
 *
 * Code evaluators and the workflow-run POST are not wrapped: re-running the latter
 * would start a second workflow execution.
 */
export const withJudgeTransportRetry = (
  evaluator: Evaluator,
  { log, maxAttempts = 3, baseDelayMs = 5000, sleep = defaultSleep }: JudgeRetryOptions
): Evaluator => ({
  ...evaluator,
  evaluate: async (params): Promise<EvaluationResult> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await evaluator.evaluate(params);
      } catch (err) {
        if (!isTransportFailure(err)) {
          throw err;
        }
        if (attempt >= maxAttempts) {
          log.warning(
            `Evaluator "${evaluator.name}" failed transiently on all ${maxAttempts} attempts; ` +
              `recording score=null (unavailable): ${errorText(err)}`
          );
          return {
            score: null,
            label: 'unavailable',
            explanation: `Judge call failed transiently on all ${maxAttempts} attempts: ${errorText(
              err
            )}`,
            metadata: { judgeUnavailable: true, attempts: maxAttempts, status: errorStatus(err) },
          };
        }
        const delayMs = baseDelayMs * 2 ** (attempt - 1);
        log.warning(
          `Evaluator "${
            evaluator.name
          }" lost its connection (attempt ${attempt}/${maxAttempts}): ${errorText(
            err
          )}; retrying in ${delayMs}ms`
        );
        await sleep(delayMs);
      }
    }
  },
});

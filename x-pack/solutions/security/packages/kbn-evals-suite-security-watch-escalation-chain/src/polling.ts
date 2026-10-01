/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const defaultSleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });

export interface PollUntilOptions<T> {
  /** Reads the current value. */
  read: () => Promise<T>;
  /** True once the value is the one being waited for. */
  isSettled: (value: T) => boolean;
  /** What is being waited for, used in the failure message. */
  description: string;
  timeoutMs: number;
  intervalMs: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Waits for a condition that a downstream process settles asynchronously.
 *
 * A fixed sleep followed by a single read scores a slow fan-out as a missing
 * outcome: the assertion is about what the chain eventually writes, so the
 * wait is bounded and re-read rather than assumed.
 */
export const pollUntil = async <T>({
  read,
  isSettled,
  description,
  timeoutMs,
  intervalMs,
  sleep = defaultSleep,
}: PollUntilOptions<T>): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  let value = await read();

  while (!isSettled(value) && Date.now() < deadline) {
    await sleep(intervalMs);
    value = await read();
  }

  if (!isSettled(value)) {
    throw new Error(`${description} did not settle within ${timeoutMs}ms`);
  }

  return value;
};

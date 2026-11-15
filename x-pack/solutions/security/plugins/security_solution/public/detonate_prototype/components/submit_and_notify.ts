/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Awaits a submit request and hands its result to `onSubmitted`, swallowing only the request's
 * rejection (the mutation state already shows it) so a throw from `onSubmitted` is not hidden.
 */
export const submitAndNotify = async <T>(
  request: Promise<T> | undefined,
  onSubmitted: (task: T) => void
): Promise<void> => {
  const task = await request?.catch(() => undefined);
  if (task) {
    onSubmitted(task);
  }
};

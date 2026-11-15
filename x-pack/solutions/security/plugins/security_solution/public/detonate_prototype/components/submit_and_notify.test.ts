/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { submitAndNotify } from './submit_and_notify';

describe('submitAndNotify', () => {
  it('hands the resolved task to onSubmitted', async () => {
    const onSubmitted = jest.fn();

    await submitAndNotify(Promise.resolve({ id: 'task-1' }), onSubmitted);

    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(onSubmitted).toHaveBeenCalledWith({ id: 'task-1' });
  });

  it('rejects with the error when onSubmitted throws', async () => {
    const failure = new Error('onSubmitted blew up');
    const onSubmitted = jest.fn(() => {
      throw failure;
    });

    await expect(submitAndNotify(Promise.resolve({ id: 'task-1' }), onSubmitted)).rejects.toBe(
      failure
    );
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  it('resolves without calling onSubmitted when the request rejects', async () => {
    const onSubmitted = jest.fn();

    await expect(
      submitAndNotify(Promise.reject(new Error('mutation failed')), onSubmitted)
    ).resolves.toBeUndefined();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('is a no-op without a request', async () => {
    const onSubmitted = jest.fn();

    await expect(submitAndNotify(undefined, onSubmitted)).resolves.toBeUndefined();
    expect(onSubmitted).not.toHaveBeenCalled();
  });
});

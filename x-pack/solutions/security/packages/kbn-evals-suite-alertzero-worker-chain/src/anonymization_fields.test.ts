/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpHandler } from '@kbn/core/public';
import { seedAnonymizationFields } from './anonymization_fields';

describe('seedAnonymizationFields', () => {
  it('POSTs the internal update route with api version 1 in the default space', async () => {
    const fetch = jest.fn().mockResolvedValue({ success: true });

    await seedAnonymizationFields({ fetch: fetch as unknown as HttpHandler, spaceId: 'default' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/internal/elastic_assistant/update_anonymization_fields',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'elastic-api-version': '1' }),
      })
    );
  });

  it("targets the cell's own space for a non-default cell", async () => {
    const fetch = jest.fn().mockResolvedValue({ success: true });

    await seedAnonymizationFields({
      fetch: fetch as unknown as HttpHandler,
      spaceId: 'alertzero-g20',
    });

    expect(fetch.mock.calls[0][0]).toBe(
      '/s/alertzero-g20/internal/elastic_assistant/update_anonymization_fields'
    );
  });

  it('throws, naming the space and status, when the route fails', async () => {
    const fetch = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));

    await expect(
      seedAnonymizationFields({ fetch: fetch as unknown as HttpHandler, spaceId: 'alertzero-g20' })
    ).rejects.toThrow(/space "alertzero-g20".*403.*Forbidden/);
  });
});

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpFetchOptions } from '@kbn/core/public';
import { spacePath, type KbnRequestContext } from './worker_settings';

const UPDATE_ANONYMIZATION_FIELDS_URL = '/internal/elastic_assistant/update_anonymization_fields';

const statusOf = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;

/**
 * Attack Discovery's batched generation reads the space's anonymization-fields index. A fresh
 * space has none, so every `run_batch` fails with index_not_found_exception and the chain
 * produces no discovery (and no review). This installs the defaults in the cell's space.
 * Throws on any non-2xx: a space without them makes every later AD hop unmeasurable.
 */
export const seedAnonymizationFields = async ({ fetch, spaceId }: KbnRequestContext) => {
  const path = spacePath(spaceId, UPDATE_ANONYMIZATION_FIELDS_URL);
  try {
    await fetch(path, {
      method: 'POST',
      headers: { 'elastic-api-version': '1', 'kbn-xsrf': 'true' },
    } satisfies HttpFetchOptions);
  } catch (error) {
    const status = statusOf(error);
    throw new Error(
      `Could not seed anonymization fields in space "${spaceId}" (POST ${path}${
        status === undefined ? '' : ` -> ${String(status)}`
      }): ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

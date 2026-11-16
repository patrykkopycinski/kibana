/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';

/** SHA-256 first because the sample stores key on it; weaker digests are a fallback. */
const HASH_FIELDS = [
  'file.hash.sha256',
  'process.hash.sha256',
  'file.hash.sha1',
  'process.hash.sha1',
  'file.hash.md5',
  'process.hash.md5',
] as const;

/** First populated hash on the document, or undefined when it carries none. */
export const getDetonatableHash = (hit: DataTableRecord): string | undefined => {
  for (const field of HASH_FIELDS) {
    const value = getFieldValue(hit, field);
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
};

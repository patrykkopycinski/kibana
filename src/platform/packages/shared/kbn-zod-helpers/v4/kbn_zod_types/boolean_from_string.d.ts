/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod/v4';
import type { KbnZodType } from './kbn_zod_type';
/**
 * This is a helper schema to convert a boolean string ("true" or "false") to a
 * boolean. Useful for processing query params.
 *
 * Accepts "true" or "false" as strings, or a boolean.
 */
declare const _BooleanFromString: z.ZodUnion<
  readonly [
    z.ZodPipe<
      z.ZodEnum<{
        false: 'false';
        true: 'true';
      }>,
      z.ZodTransform<boolean, 'false' | 'true'>
    >,
    z.ZodBoolean
  ]
>;
export declare const BooleanFromString: typeof _BooleanFromString & KbnZodType;
export declare const isBooleanFromString: (val: unknown) => val is typeof BooleanFromString;
export {};

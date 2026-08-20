/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod';
export declare const serializedTimeRangeSchema: z.ZodObject<
  {
    time_range: z.ZodOptional<
      z.ZodObject<
        {
          from: z.ZodString;
          to: z.ZodString;
          mode: z.ZodOptional<
            z.ZodUnion<readonly [z.ZodLiteral<'absolute'>, z.ZodLiteral<'relative'>]>
          >;
        },
        z.core.$strict
      >
    >;
  },
  z.core.$strict
>;

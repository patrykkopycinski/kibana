/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod';
import type { Serializable } from '@kbn/utility-types';
import type { FilterStateStore } from '@kbn/es-query-constants';
export declare const filterStateStoreSchema: z.ZodUnion<
  readonly [z.ZodLiteral<FilterStateStore.APP_STATE>, z.ZodLiteral<FilterStateStore.GLOBAL_STATE>]
>;
export declare const storedFilterMetaSchema: z.ZodObject<
  {
    alias: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    disabled: z.ZodOptional<z.ZodBoolean>;
    negate: z.ZodOptional<z.ZodBoolean>;
    controlledBy: z.ZodOptional<z.ZodString>;
    group: z.ZodOptional<z.ZodString>;
    relation: z.ZodOptional<z.ZodString>;
    field: z.ZodOptional<z.ZodString>;
    index: z.ZodOptional<z.ZodString>;
    isMultiIndex: z.ZodOptional<z.ZodBoolean>;
    type: z.ZodOptional<z.ZodString>;
    key: z.ZodOptional<z.ZodString>;
    params: z.ZodOptional<z.ZodAny>;
    value: z.ZodOptional<z.ZodAny>;
  },
  z.core.$loose
>;
type StoredFilterMeta = z.output<typeof storedFilterMetaSchema> & {
  [key: string]: Serializable;
};
export declare const storedFilterSchema: z.ZodObject<
  {
    meta: z.ZodType<StoredFilterMeta>;
    query: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    $state: z.ZodOptional<
      z.ZodObject<
        {
          store: z.ZodUnion<
            readonly [
              z.ZodLiteral<FilterStateStore.APP_STATE>,
              z.ZodLiteral<FilterStateStore.GLOBAL_STATE>
            ]
          >;
        },
        z.core.$strict
      >
    >;
  },
  z.core.$strict
>;
export {};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod';
import type { ControlValuesSource } from '@kbn/controls-constants';
export declare const controlTitleSchema: z.ZodObject<
  {
    title: z.ZodOptional<z.ZodString>;
  },
  z.core.$strict
>;
/**
 * This uses a union with only one option so we can provide a default value for backwards compat
 */
export declare const dataControlFieldValuesSourceSchema: z.ZodDefault<
  z.ZodUnion<readonly [z.ZodLiteral<ControlValuesSource.FIELD>]>
>;
/**
 * Injects a default `values_source: 'field'` when the field is absent from the input.
 * Config-schema's discriminatedUnion applied field defaults before discriminating; Zod does not.
 * This preprocess step restores backward compatibility for legacy state without values_source.
 *
 * Ideally this logic is corrected in the future and removed.
 */
export declare const withFieldValuesSourceDefault: (val: unknown) => unknown;
export declare const dataControlFieldVariantSchema: z.ZodObject<
  {
    title: z.ZodOptional<z.ZodString>;
    use_global_filters: z.ZodDefault<z.ZodBoolean>;
    ignore_validations: z.ZodDefault<z.ZodBoolean>;
    values_source: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<ControlValuesSource.FIELD>]>>;
    data_view_id: z.ZodString;
    field_name: z.ZodString;
  },
  z.core.$strip
>;
export declare const dataControlEsqlVariantSchema: z.ZodObject<
  {
    title: z.ZodOptional<z.ZodString>;
    use_global_filters: z.ZodDefault<z.ZodBoolean>;
    ignore_validations: z.ZodDefault<z.ZodBoolean>;
    values_source: z.ZodLiteral<ControlValuesSource.ESQL>;
    esql_query: z.ZodString;
  },
  z.core.$strip
>;
export declare const dataControlSchema: z.ZodPreprocess<
  z.ZodDiscriminatedUnion<
    [
      z.ZodObject<
        {
          title: z.ZodOptional<z.ZodString>;
          use_global_filters: z.ZodDefault<z.ZodBoolean>;
          ignore_validations: z.ZodDefault<z.ZodBoolean>;
          values_source: z.ZodLiteral<ControlValuesSource.ESQL>;
          esql_query: z.ZodString;
        },
        z.core.$strip
      >,
      z.ZodObject<
        {
          title: z.ZodOptional<z.ZodString>;
          use_global_filters: z.ZodDefault<z.ZodBoolean>;
          ignore_validations: z.ZodDefault<z.ZodBoolean>;
          values_source: z.ZodDefault<
            z.ZodUnion<readonly [z.ZodLiteral<ControlValuesSource.FIELD>]>
          >;
          data_view_id: z.ZodString;
          field_name: z.ZodString;
        },
        z.core.$strip
      >
    ],
    'values_source'
  >
>;

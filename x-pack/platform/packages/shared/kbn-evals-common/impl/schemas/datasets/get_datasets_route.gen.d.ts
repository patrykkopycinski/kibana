/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod/v4';
export declare const DatasetSummary: z.ZodObject<
  {
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    maturity: z.ZodOptional<
      z.ZodEnum<{
        cleaned: 'cleaned';
        golden: 'golden';
        raw: 'raw';
      }>
    >;
    space_ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
    examples_count: z.ZodNumber;
    created_at: z.ZodString;
    updated_at: z.ZodString;
  },
  z.core.$strip
>;
export type DatasetSummary = z.infer<typeof DatasetSummary>;
export declare const GetEvaluationDatasetsRequestQuery: z.ZodObject<
  {
    page: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    per_page: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    search: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodPreprocess<z.ZodArray<z.ZodString>>>;
    maturity: z.ZodOptional<
      z.ZodPreprocess<
        z.ZodArray<
          z.ZodEnum<{
            cleaned: 'cleaned';
            golden: 'golden';
            raw: 'raw';
          }>
        >
      >
    >;
    sort_field: z.ZodDefault<
      z.ZodOptional<
        z.ZodEnum<{
          created_at: 'created_at';
          examples_count: 'examples_count';
          maturity: 'maturity';
          name: 'name';
          updated_at: 'updated_at';
        }>
      >
    >;
    sort_order: z.ZodDefault<
      z.ZodOptional<
        z.ZodEnum<{
          asc: 'asc';
          desc: 'desc';
        }>
      >
    >;
  },
  z.core.$strip
>;
export type GetEvaluationDatasetsRequestQuery = z.infer<typeof GetEvaluationDatasetsRequestQuery>;
export type GetEvaluationDatasetsRequestQueryInput = z.input<
  typeof GetEvaluationDatasetsRequestQuery
>;
export declare const GetEvaluationDatasetsResponse: z.ZodObject<
  {
    datasets: z.ZodArray<
      z.ZodObject<
        {
          id: z.ZodString;
          name: z.ZodString;
          description: z.ZodString;
          tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
          maturity: z.ZodOptional<
            z.ZodEnum<{
              cleaned: 'cleaned';
              golden: 'golden';
              raw: 'raw';
            }>
          >;
          space_ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
          examples_count: z.ZodNumber;
          created_at: z.ZodString;
          updated_at: z.ZodString;
        },
        z.core.$strip
      >
    >;
    total: z.ZodNumber;
    facets: z.ZodOptional<
      z.ZodObject<
        {
          tags: z.ZodArray<
            z.ZodObject<
              {
                value: z.ZodString;
                count: z.ZodNumber;
              },
              z.core.$strip
            >
          >;
          maturity: z.ZodArray<
            z.ZodObject<
              {
                value: z.ZodString;
                count: z.ZodNumber;
              },
              z.core.$strip
            >
          >;
        },
        z.core.$strip
      >
    >;
  },
  z.core.$strip
>;
export type GetEvaluationDatasetsResponse = z.infer<typeof GetEvaluationDatasetsResponse>;

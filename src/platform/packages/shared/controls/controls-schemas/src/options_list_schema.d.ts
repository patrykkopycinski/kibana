/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod';
export declare const optionsListDisplaySettingsSchema: z.ZodObject<
  {
    placeholder: z.ZodOptional<z.ZodString>;
    hide_action_bar: z.ZodOptional<z.ZodBoolean>;
    hide_exclude: z.ZodOptional<z.ZodBoolean>;
    hide_exists: z.ZodOptional<z.ZodBoolean>;
    hide_sort: z.ZodOptional<z.ZodBoolean>;
  },
  z.core.$strict
>;
export declare const optionsListSearchTechniqueSchema: z.ZodDefault<
  z.ZodUnion<readonly [z.ZodLiteral<'prefix'>, z.ZodLiteral<'wildcard'>, z.ZodLiteral<'exact'>]>
>;
export declare const optionsListSortSchema: z.ZodDefault<
  z.ZodObject<
    {
      by: z.ZodEnum<{
        _count: '_count';
        _key: '_key';
      }>;
      direction: z.ZodEnum<{
        asc: 'asc';
        desc: 'desc';
      }>;
    },
    z.core.$strict
  >
>;
export declare const optionsListSelectionSchema: z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>;
export declare const optionsListDSLControlSchema: z.ZodPreprocess<
  z.ZodDiscriminatedUnion<
    [
      z.ZodObject<
        {
          title: z.ZodOptional<z.ZodString>;
          use_global_filters: z.ZodDefault<z.ZodBoolean>;
          ignore_validations: z.ZodDefault<z.ZodBoolean>;
          values_source: z.ZodLiteral<import('@kbn/controls-constants').ControlValuesSource.ESQL>;
          esql_query: z.ZodString;
          display_settings: z.ZodOptional<
            z.ZodObject<
              {
                placeholder: z.ZodOptional<z.ZodString>;
                hide_action_bar: z.ZodOptional<z.ZodBoolean>;
                hide_exclude: z.ZodOptional<z.ZodBoolean>;
                hide_exists: z.ZodOptional<z.ZodBoolean>;
                hide_sort: z.ZodOptional<z.ZodBoolean>;
              },
              z.core.$strict
            >
          >;
          exclude: z.ZodDefault<z.ZodBoolean>;
          exists_selected: z.ZodDefault<z.ZodBoolean>;
          run_past_timeout: z.ZodDefault<z.ZodBoolean>;
          search_technique: z.ZodDefault<
            z.ZodUnion<
              readonly [z.ZodLiteral<'prefix'>, z.ZodLiteral<'wildcard'>, z.ZodLiteral<'exact'>]
            >
          >;
          selected_options: z.ZodDefault<
            z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>
          >;
          single_select: z.ZodDefault<z.ZodBoolean>;
          sort: z.ZodDefault<
            z.ZodObject<
              {
                by: z.ZodEnum<{
                  _count: '_count';
                  _key: '_key';
                }>;
                direction: z.ZodEnum<{
                  asc: 'asc';
                  desc: 'desc';
                }>;
              },
              z.core.$strict
            >
          >;
        },
        z.core.$strip
      >,
      z.ZodObject<
        {
          title: z.ZodOptional<z.ZodString>;
          use_global_filters: z.ZodDefault<z.ZodBoolean>;
          ignore_validations: z.ZodDefault<z.ZodBoolean>;
          values_source: z.ZodDefault<
            z.ZodUnion<
              readonly [z.ZodLiteral<import('@kbn/controls-constants').ControlValuesSource.FIELD>]
            >
          >;
          data_view_id: z.ZodString;
          field_name: z.ZodString;
          display_settings: z.ZodOptional<
            z.ZodObject<
              {
                placeholder: z.ZodOptional<z.ZodString>;
                hide_action_bar: z.ZodOptional<z.ZodBoolean>;
                hide_exclude: z.ZodOptional<z.ZodBoolean>;
                hide_exists: z.ZodOptional<z.ZodBoolean>;
                hide_sort: z.ZodOptional<z.ZodBoolean>;
              },
              z.core.$strict
            >
          >;
          exclude: z.ZodDefault<z.ZodBoolean>;
          exists_selected: z.ZodDefault<z.ZodBoolean>;
          run_past_timeout: z.ZodDefault<z.ZodBoolean>;
          search_technique: z.ZodDefault<
            z.ZodUnion<
              readonly [z.ZodLiteral<'prefix'>, z.ZodLiteral<'wildcard'>, z.ZodLiteral<'exact'>]
            >
          >;
          selected_options: z.ZodDefault<
            z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>
          >;
          single_select: z.ZodDefault<z.ZodBoolean>;
          sort: z.ZodDefault<
            z.ZodObject<
              {
                by: z.ZodEnum<{
                  _count: '_count';
                  _key: '_key';
                }>;
                direction: z.ZodEnum<{
                  asc: 'asc';
                  desc: 'desc';
                }>;
              },
              z.core.$strict
            >
          >;
        },
        z.core.$strip
      >
    ],
    'values_source'
  >
>;
export declare const optionsListESQLControlSchema: z.ZodDiscriminatedUnion<
  [
    z.ZodObject<
      {
        title: z.ZodOptional<z.ZodString>;
        display_settings: z.ZodOptional<
          z.ZodObject<
            {
              placeholder: z.ZodOptional<z.ZodString>;
              hide_action_bar: z.ZodOptional<z.ZodBoolean>;
              hide_exclude: z.ZodOptional<z.ZodBoolean>;
              hide_exists: z.ZodOptional<z.ZodBoolean>;
              hide_sort: z.ZodOptional<z.ZodBoolean>;
            },
            z.core.$strict
          >
        >;
        selected_options: z.ZodArray<z.ZodString>;
        single_select: z.ZodDefault<z.ZodBoolean>;
        variable_name: z.ZodString;
        variable_type: z.ZodUnion<
          readonly [
            z.ZodLiteral<'fields'>,
            z.ZodLiteral<'values'>,
            z.ZodLiteral<'functions'>,
            z.ZodLiteral<'time_literal'>,
            z.ZodLiteral<'multi_values'>
          ]
        >;
        control_type: z.ZodLiteral<'STATIC_VALUES'>;
        available_options: z.ZodArray<z.ZodString>;
      },
      z.core.$strip
    >,
    z.ZodObject<
      {
        title: z.ZodOptional<z.ZodString>;
        display_settings: z.ZodOptional<
          z.ZodObject<
            {
              placeholder: z.ZodOptional<z.ZodString>;
              hide_action_bar: z.ZodOptional<z.ZodBoolean>;
              hide_exclude: z.ZodOptional<z.ZodBoolean>;
              hide_exists: z.ZodOptional<z.ZodBoolean>;
              hide_sort: z.ZodOptional<z.ZodBoolean>;
            },
            z.core.$strict
          >
        >;
        selected_options: z.ZodArray<z.ZodString>;
        single_select: z.ZodDefault<z.ZodBoolean>;
        variable_name: z.ZodString;
        variable_type: z.ZodUnion<
          readonly [
            z.ZodLiteral<'fields'>,
            z.ZodLiteral<'values'>,
            z.ZodLiteral<'functions'>,
            z.ZodLiteral<'time_literal'>,
            z.ZodLiteral<'multi_values'>
          ]
        >;
        control_type: z.ZodLiteral<'VALUES_FROM_QUERY'>;
        esql_query: z.ZodString;
      },
      z.core.$strip
    >
  ],
  'control_type'
>;

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export declare const ESQL_CONTROL = 'esql_control';
export declare const OPTIONS_LIST_CONTROL = 'options_list_control';
export declare const RANGE_SLIDER_CONTROL = 'range_slider_control';
export declare const TIME_SLIDER_CONTROL = 'time_slider_control';
export declare const DEFAULT_DATA_CONTROL_STATE: {
  use_global_filters: boolean;
  ignore_validations: boolean;
};
export declare enum ControlValuesSource {
  FIELD = 'field',
  ESQL = 'esql',
}
export declare const DEFAULT_CONTROL_VALUES_SOURCE = ControlValuesSource.FIELD;
export declare const SELECTIONS_MAX = 10000;

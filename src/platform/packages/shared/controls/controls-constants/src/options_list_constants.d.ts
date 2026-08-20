/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ControlValuesSource } from './control_constants';
export declare const MAX_OPTIONS_LIST_REQUEST_SIZE = 1000;
export declare const DEFAULT_DSL_OPTIONS_LIST_STATE: {
  readonly use_global_filters: boolean;
  readonly ignore_validations: boolean;
  readonly values_source: ControlValuesSource.FIELD;
  readonly sort: {
    readonly by: '_count';
    readonly direction: 'desc';
  };
  readonly search_technique: 'wildcard';
  readonly single_select: false;
  readonly exclude: false;
  readonly exists_selected: false;
  readonly run_past_timeout: false;
  readonly selected_options: Array<string | number>;
};
export declare const DEFAULT_ESQL_OPTIONS_LIST_STATE: {
  readonly single_select: true;
  readonly selected_options: Array<string>;
};

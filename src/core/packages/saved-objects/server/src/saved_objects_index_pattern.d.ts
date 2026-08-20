/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Collect and centralize the names of the different saved object indices.
 * Note that all of them start with the '.kibana' prefix.
 * There are multiple places in the code that these indices have the form .kibana*.
 * However, beware that there are some system indices that have the same prefix
 * but are NOT used to store saved objects, e.g.: .kibana_security_session_1
 */
export declare const MAIN_SAVED_OBJECT_INDEX = '.kibana';
export declare const TASK_MANAGER_SAVED_OBJECT_INDEX = '.kibana_task_manager';
export declare const INGEST_SAVED_OBJECT_INDEX = '.kibana_ingest';
export declare const ALERTING_CASES_SAVED_OBJECT_INDEX = '.kibana_alerting_cases';
export declare const SECURITY_SOLUTION_SAVED_OBJECT_INDEX = '.kibana_security_solution';
export declare const ANALYTICS_SAVED_OBJECT_INDEX = '.kibana_analytics';
export declare const USAGE_COUNTERS_SAVED_OBJECT_INDEX = '.kibana_usage_counters';
export declare const SEARCH_SOLUTION_SAVED_OBJECT_INDEX = '.kibana_search_solution';
export declare const ALL_SAVED_OBJECT_INDICES: string[];

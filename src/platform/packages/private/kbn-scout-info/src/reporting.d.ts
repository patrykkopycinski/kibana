/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export declare const SCOUT_REPORTER_ENABLED: boolean;
export declare const SCOUT_REPORTER_ES_URL: string | undefined;
export declare const SCOUT_REPORTER_ES_API_KEY: string | undefined;
export declare const SCOUT_REPORTER_ES_VERIFY_CERTS: boolean;
export declare const SCOUT_TEST_EVENTS_TEMPLATE_NAME: string;
export declare const SCOUT_TEST_EVENTS_INDEX_PATTERN: string;
export declare const SCOUT_TEST_EVENTS_DATA_STREAM_NAME: string;
export declare const BROWSER_CONSOLE_ERRORS_ATTACHMENT = 'browser-console-errors';
export declare enum ScoutTestRunConfigCategory {
  UI_TEST = 'ui-test',
  API_TEST = 'api-test',
  UNIT_TEST = 'unit-test',
  UNIT_INTEGRATION_TEST = 'unit-integration-test',
  UNKNOWN = 'unknown',
}

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

const enabledActionTypes = [
  '.email',
  '.index',
  '.pagerduty',
  '.server-log',
  '.servicenow',
  '.slack',
  '.webhook',
  'test.authorization',
  'test.failing',
  'test.index-record',
  'test.noop',
  'test.rate-limit',
];

export interface ActionResult {
  id: string;
  actionTypeId: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: Record<string, any>;
}

export interface FindActionResult extends ActionResult {
  referencedByCount: number;
}

export interface FindResult {
  page: number;
  perPage: number;
  total: number;
  data: FindActionResult[];
}

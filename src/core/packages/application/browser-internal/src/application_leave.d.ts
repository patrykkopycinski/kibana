/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  type AppLeaveAction,
  type AppLeaveConfirmAction,
  type AppLeaveHandler,
} from '@kbn/core-application-browser';
export declare function isConfirmAction(action: AppLeaveAction): action is AppLeaveConfirmAction;
export declare function getLeaveAction(
  handler?: AppLeaveHandler,
  nextAppId?: string
): AppLeaveAction;

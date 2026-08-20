/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ESQLTimeSpanLiteral } from '@elastic/esql/types';
export declare function isTimespanString(str: string): boolean;
export declare function stringToTimespanLiteral(str: string): ESQLTimeSpanLiteral;

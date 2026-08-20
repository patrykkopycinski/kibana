/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod/v4';
import type { RefinementCtx } from '@kbn/zod/v4';
export declare function isNonEmptyString(input: string, ctx: RefinementCtx): void;
export declare const NonEmptyString: z.ZodString;
/**
 * Checks that the input is a string that is not empty while allowing whitespace.
 */
export declare function isNonEmptyOrWhitespace(input: string, ctx: RefinementCtx): void;
export declare const NonEmptyOrWhitespaceString: z.ZodString;

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RouteValidationFunction } from '@kbn/core-http-server';
interface ZodSafeParseable<Output = any> {
  safeParse(data: unknown):
    | {
        success: true;
        data: Output;
      }
    | {
        success: false;
        error: {
          issues: unknown[];
        };
      };
}
/**
 * Zod validation factory for Kibana route's request validation.
 * It allows to pass a Zod schema for parameters, query and/or body validation.
 *
 * Example:
 *
 * ```ts
 * router.versioned
 *   .post({
 *     access: 'public',
 *     path: MY_URL,
 *   })
 *   .addVersion(
 *     {
 *       version: 'my-version',
 *       validate: {
 *         request: {
 *           params: buildRouteValidationWithZod(MyRequestParamsZodSchema),
 *           query: buildRouteValidationWithZod(MyRequestQueryZodSchema),
 *           body: buildRouteValidationWithZod(MyRequestBodyZodSchema),
 *         },
 *       },
 *     },
 * ```
 */
export declare function buildRouteValidationWithZod<Output>(
  schema: ZodSafeParseable<Output>
): RouteValidationFunction<Output>;
export {};

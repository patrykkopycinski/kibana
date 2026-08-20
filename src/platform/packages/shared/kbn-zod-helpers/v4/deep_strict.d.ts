/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod/v4';
/**
 * Wraps a Zod schema to deeply reject any unrecognized keys in the input.
 *
 * This works by trial-parsing the input with the given schema, then comparing
 * the flattened keys of the raw input against the flattened keys of the parsed
 * output. Any excess keys in the input will cause validation to fail.
 *
 * The actual parsing is done by piping through the original schema, so all
 * schema-level errors are preserved.
 */
export declare function DeepStrict<TSchema extends z.ZodType>(
  schema: TSchema
): z.ZodPipe<
  z.ZodType<z.input<TSchema>, unknown, z.core.$ZodTypeInternals<z.input<TSchema>, unknown>>,
  z.ZodType<
    z.TypeOf<TSchema>,
    z.input<TSchema>,
    z.core.$ZodTypeInternals<z.TypeOf<TSchema>, z.input<TSchema>>
  >
>;

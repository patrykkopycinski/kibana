/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema, type TypeOf } from '@kbn/config-schema';

/**
 * Config schema for the Daybreak plugin (`xpack.daybreak`).
 *
 * `enabled` gates the entire daybreak plugin behind an experimental feature
 * flag, default off (FR-007, NFR-2).
 */
export const configSchema = schema.object({
  enabled: schema.boolean({ defaultValue: false }),
});

export type ConfigType = TypeOf<typeof configSchema>;

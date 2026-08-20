/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod';
export declare const ScoutTestChannelSchema: z.ZodEnum<{
  'ci-batch-3h': 'ci-batch-3h';
  'ci-batch-daily': 'ci-batch-daily';
  'ci-batch-weekly': 'ci-batch-weekly';
  'ci-on-commit': 'ci-on-commit';
}>;
export type ScoutTestChannel = z.infer<typeof ScoutTestChannelSchema>;
export type ScoutTestChannelsDefinition = ScoutTestChannel[];
export declare const testChannel: {
  fromString(raw: string): ScoutTestChannel;
};
export declare const testChannels: {
  all: ScoutTestChannel[];
  default: ScoutTestChannel[];
  match(pattern: RegExp): ScoutTestChannel[];
  current(): ScoutTestChannel[];
};

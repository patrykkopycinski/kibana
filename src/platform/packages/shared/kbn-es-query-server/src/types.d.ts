import type { z } from '@kbn/zod';
import type { timeRangeSchema, absoluteTimeRangeSchema, relativeTimeRangeSchema } from './time_range';
import type { aggregateQuerySchema, querySchema } from './query';
export type TimeRange = z.output<typeof timeRangeSchema>;
export type AbsoluteTimeRange = z.output<typeof absoluteTimeRangeSchema>;
export type RelativeTimeRange = z.output<typeof relativeTimeRangeSchema>;
export type Query = z.output<typeof querySchema>;
export type AggregateQuery = z.output<typeof aggregateQuerySchema>;

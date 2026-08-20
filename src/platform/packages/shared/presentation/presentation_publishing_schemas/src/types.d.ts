import type { z } from '@kbn/zod';
import type { serializedTitlesSchema } from './titles_schema';
import type { serializedTimeRangeSchema } from './time_range_schema';
export type SerializedTimeRange = z.output<typeof serializedTimeRangeSchema>;
export type SerializedTitles = z.output<typeof serializedTitlesSchema>;

import type { z } from '@kbn/zod';
export declare const querySchema: z.ZodObject<{
    query: z.ZodUnion<readonly [z.ZodString, z.ZodRecord<z.ZodString, z.ZodAny>]>;
    language: z.ZodString;
}, z.core.$strict>;
export declare const aggregateQuerySchema: z.ZodObject<{
    esql: z.ZodString;
}, z.core.$strict>;

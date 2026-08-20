import type { z } from '@kbn/zod';
export declare const serializedTimeRangeSchema: z.ZodObject<{
    time_range: z.ZodOptional<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        mode: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"absolute">, z.ZodLiteral<"relative">]>>;
    }, z.core.$strict>>;
}, z.core.$strict>;

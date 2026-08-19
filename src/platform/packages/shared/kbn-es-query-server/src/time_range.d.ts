import { z } from '@kbn/zod';
export declare const timeRangeSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    mode: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"absolute">, z.ZodLiteral<"relative">]>>;
}, z.core.$strict>;
export declare const absoluteTimeRangeSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    mode: z.ZodLiteral<"absolute">;
}, z.core.$strict>;
export declare const relativeTimeRangeSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    mode: z.ZodLiteral<"relative">;
}, z.core.$strict>;

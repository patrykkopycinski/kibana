import type { z } from '@kbn/zod';
export declare const serializedTitlesSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    hide_title: z.ZodOptional<z.ZodBoolean>;
    title: z.ZodOptional<z.ZodString>;
    hide_border: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;

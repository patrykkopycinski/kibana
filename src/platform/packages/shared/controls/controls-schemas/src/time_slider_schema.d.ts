import { z } from '@kbn/zod';
export declare const timeSliderControlSchema: z.ZodObject<{
    start_percentage_of_time_range: z.ZodDefault<z.ZodNumber>;
    end_percentage_of_time_range: z.ZodDefault<z.ZodNumber>;
    is_anchored: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;

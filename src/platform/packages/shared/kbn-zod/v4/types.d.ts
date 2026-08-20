import type { ZodType } from 'zod/v4';
/**
 * Some Zod object schema type
 *
 * This enforces only that the **output** of the schema is an object with unknown values,
 * not that it is of the type `ZodObject`.
 */
export type ZodObjectType = ZodType<Record<string, unknown>>;

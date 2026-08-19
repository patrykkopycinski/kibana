import { z } from '@kbn/zod/v4';
export declare const CreateEvaluationDatasetRequestBody: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    maturity: z.ZodOptional<z.ZodEnum<{
        cleaned: "cleaned";
        golden: "golden";
        raw: "raw";
    }>>;
    space_ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type CreateEvaluationDatasetRequestBody = z.infer<typeof CreateEvaluationDatasetRequestBody>;
export type CreateEvaluationDatasetRequestBodyInput = z.input<typeof CreateEvaluationDatasetRequestBody>;
export declare const CreateEvaluationDatasetResponse: z.ZodObject<{
    dataset_id: z.ZodString;
    name: z.ZodString;
}, z.core.$strip>;
export type CreateEvaluationDatasetResponse = z.infer<typeof CreateEvaluationDatasetResponse>;

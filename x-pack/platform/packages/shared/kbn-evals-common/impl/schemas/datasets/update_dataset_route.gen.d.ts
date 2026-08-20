import type { z } from '@kbn/zod/v4';
export declare const UpdateEvaluationDatasetRequestParams: z.ZodObject<{
    datasetId: z.ZodString;
}, z.core.$strip>;
export type UpdateEvaluationDatasetRequestParams = z.infer<typeof UpdateEvaluationDatasetRequestParams>;
export type UpdateEvaluationDatasetRequestParamsInput = z.input<typeof UpdateEvaluationDatasetRequestParams>;
/**
 * Only the supplied fields are changed; omitted fields keep their current value. Send an empty `tags` array or a null `maturity` to clear them.
 */
export declare const UpdateEvaluationDatasetRequestBody: z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    maturity: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        cleaned: "cleaned";
        golden: "golden";
        raw: "raw";
    }>>>;
    space_ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type UpdateEvaluationDatasetRequestBody = z.infer<typeof UpdateEvaluationDatasetRequestBody>;
export type UpdateEvaluationDatasetRequestBodyInput = z.input<typeof UpdateEvaluationDatasetRequestBody>;
export declare const UpdateEvaluationDatasetResponse: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    maturity: z.ZodOptional<z.ZodEnum<{
        cleaned: "cleaned";
        golden: "golden";
        raw: "raw";
    }>>;
    space_ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
export type UpdateEvaluationDatasetResponse = z.infer<typeof UpdateEvaluationDatasetResponse>;

import { z } from '@kbn/zod/v4';
export declare const ValidateRequestBody: z.ZodObject<{
    subject: z.ZodObject<{
        mode: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
            "multi-turn": "multi-turn";
            "single-turn": "single-turn";
        }>>>;
        traces: z.ZodArray<z.ZodObject<{
            trace_id: z.ZodString;
            reference_data: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        }, z.core.$strip>>;
        instrumentation: z.ZodOptional<z.ZodObject<{
            profile: z.ZodDefault<z.ZodEnum<{
                "claude-code": "claude-code";
                "elastic-inference": "elastic-inference";
                "otel-genai-attributes": "otel-genai-attributes";
                "otel-genai-events": "otel-genai-events";
            }>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    evaluators: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        version: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ValidateRequestBody = z.infer<typeof ValidateRequestBody>;
export type ValidateRequestBodyInput = z.input<typeof ValidateRequestBody>;
export declare const ValidateResponse: z.ZodObject<{
    evaluators: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
        ready: z.ZodBoolean;
        unmet: z.ZodArray<z.ZodString>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ValidateResponse = z.infer<typeof ValidateResponse>;

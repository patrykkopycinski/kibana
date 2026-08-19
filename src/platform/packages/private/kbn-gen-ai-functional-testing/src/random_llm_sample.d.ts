/**
 * Max number of LLMs (connectors / EIS models) to run per FTR suite when unset.
 * Override with {@link FTR_GEN_AI_LLM_SAMPLE_SIZE_ENV}.
 */
export declare const DEFAULT_FTR_GEN_AI_LLM_SAMPLE_SIZE = 1;
/**
 * Set to a positive integer to cap how many LLMs are exercised in each FTR run.
 * Set to `all` to run every discovered LLM (slower; useful for local debugging).
 */
export declare const FTR_GEN_AI_LLM_SAMPLE_SIZE_ENV = "FTR_GEN_AI_LLM_SAMPLE_SIZE";
export type FtrGenAiLlmSampleSize = number | 'all';
export declare function parseFtrGenAiLlmSampleSize(): FtrGenAiLlmSampleSize;
/**
 * Returns a random subset of `items` when the configured sample size is smaller
 * than the list length; otherwise returns the full list (copy).
 */
export declare function takeRandomLlmSample<T>(items: readonly T[]): T[];

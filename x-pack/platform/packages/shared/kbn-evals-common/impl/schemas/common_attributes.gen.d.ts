import { z } from '@kbn/zod/v4';
/**
 * Free-form labels used to organize datasets. Tags are lowercased and deduplicated on write, so `Golden` and `golden` are the same tag. Commas are not allowed because tag filters are comma-separated. Tags describe what a dataset is about; they never affect who can see it.
 */
export declare const DatasetTags: z.ZodArray<z.ZodString>;
export type DatasetTags = z.infer<typeof DatasetTags>;
/**
 * How curated the dataset is, from raw captures through cleaned data to "golden" reference datasets. Absent when a dataset has no maturity set.
 */
export declare const DatasetMaturity: z.ZodEnum<{
    cleaned: "cleaned";
    golden: "golden";
    raw: "raw";
}>;
export type DatasetMaturity = z.infer<typeof DatasetMaturity>;
export type DatasetMaturityEnum = typeof DatasetMaturity.enum;
export declare const DatasetMaturityEnum: {
    cleaned: "cleaned";
    golden: "golden";
    raw: "raw";
};
/**
 * Spaces the dataset is assigned to. Each id must name an existing space the caller can manage evaluations in; wildcards are not accepted, so every space is listed. Defaults to the space the request was made in, taken from the URL's `/s/` prefix and the default space without one. Absent in a response means the default space.
 */
export declare const SpaceIds: z.ZodArray<z.ZodString>;
export type SpaceIds = z.infer<typeof SpaceIds>;
/**
 * Spaces the dataset is assigned to, with each id the caller cannot access replaced by `?`, so the entries still count the spaces.
 */
export declare const RedactedSpaceIds: z.ZodArray<z.ZodString>;
export type RedactedSpaceIds = z.infer<typeof RedactedSpaceIds>;
export declare const DatasetFacetBucket: z.ZodObject<{
    value: z.ZodString;
    count: z.ZodNumber;
}, z.core.$strip>;
export type DatasetFacetBucket = z.infer<typeof DatasetFacetBucket>;
/**
 * Values available to filter on, with the number of datasets carrying each. Counts reflect the current search term but ignore the tag and maturity filters, so they stay stable while filters are toggled.
 */
export declare const DatasetFacets: z.ZodObject<{
    tags: z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>;
    maturity: z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type DatasetFacets = z.infer<typeof DatasetFacets>;
export declare const Model: z.ZodObject<{
    id: z.ZodString;
    family: z.ZodOptional<z.ZodString>;
    provider: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Model = z.infer<typeof Model>;
export declare const ExampleInfo: z.ZodObject<{
    id: z.ZodString;
    index: z.ZodNumber;
    input: z.ZodOptional<z.ZodNullable<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>>;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>>;
    dataset: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ExampleInfo = z.infer<typeof ExampleInfo>;
export declare const TaskInfo: z.ZodObject<{
    trace_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    repetition_index: z.ZodNumber;
    output: z.ZodOptional<z.ZodNullable<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>>;
    model: z.ZodObject<{
        id: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type TaskInfo = z.infer<typeof TaskInfo>;
export declare const EvaluatorInfo: z.ZodObject<{
    name: z.ZodString;
    score: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    label: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    explanation: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>>;
    trace_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    model: z.ZodObject<{
        id: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type EvaluatorInfo = z.infer<typeof EvaluatorInfo>;
export declare const BuildkiteMetadata: z.ZodObject<{
    build_id: z.ZodOptional<z.ZodString>;
    job_id: z.ZodOptional<z.ZodString>;
    build_url: z.ZodOptional<z.ZodString>;
    pipeline_slug: z.ZodOptional<z.ZodString>;
    pull_request: z.ZodOptional<z.ZodString>;
    branch: z.ZodOptional<z.ZodString>;
    commit: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type BuildkiteMetadata = z.infer<typeof BuildkiteMetadata>;
export declare const ScoreMetadata: z.ZodObject<{
    execution_id: z.ZodOptional<z.ZodString>;
    suite_id: z.ZodOptional<z.ZodString>;
    total_repetitions: z.ZodNumber;
    hostname: z.ZodOptional<z.ZodString>;
    git: z.ZodOptional<z.ZodObject<{
        branch: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        commit_sha: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
    ci: z.ZodOptional<z.ZodObject<{
        build_id: z.ZodOptional<z.ZodString>;
        job_id: z.ZodOptional<z.ZodString>;
        build_url: z.ZodOptional<z.ZodString>;
        pipeline_slug: z.ZodOptional<z.ZodString>;
        pull_request: z.ZodOptional<z.ZodString>;
        branch: z.ZodOptional<z.ZodString>;
        commit: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ScoreMetadata = z.infer<typeof ScoreMetadata>;
export declare const EvaluationScoreDocument: z.ZodObject<{
    '@timestamp': z.ZodString;
    experiment_id: z.ZodString;
    experiment_name: z.ZodOptional<z.ZodString>;
    space_ids: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString>>>;
    example: z.ZodObject<{
        id: z.ZodString;
        index: z.ZodNumber;
        input: z.ZodOptional<z.ZodNullable<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>>;
        metadata: z.ZodOptional<z.ZodNullable<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>>;
        dataset: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>;
    task: z.ZodObject<{
        trace_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        repetition_index: z.ZodNumber;
        output: z.ZodOptional<z.ZodNullable<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>>;
        model: z.ZodObject<{
            id: z.ZodString;
            family: z.ZodOptional<z.ZodString>;
            provider: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    evaluator: z.ZodObject<{
        name: z.ZodString;
        score: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        label: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        explanation: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        metadata: z.ZodOptional<z.ZodNullable<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>>;
        trace_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        model: z.ZodObject<{
            id: z.ZodString;
            family: z.ZodOptional<z.ZodString>;
            provider: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    metadata: z.ZodObject<{
        execution_id: z.ZodOptional<z.ZodString>;
        suite_id: z.ZodOptional<z.ZodString>;
        total_repetitions: z.ZodNumber;
        hostname: z.ZodOptional<z.ZodString>;
        git: z.ZodOptional<z.ZodObject<{
            branch: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            commit_sha: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>;
        ci: z.ZodOptional<z.ZodObject<{
            build_id: z.ZodOptional<z.ZodString>;
            job_id: z.ZodOptional<z.ZodString>;
            build_url: z.ZodOptional<z.ZodString>;
            pipeline_slug: z.ZodOptional<z.ZodString>;
            pull_request: z.ZodOptional<z.ZodString>;
            branch: z.ZodOptional<z.ZodString>;
            commit: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type EvaluationScoreDocument = z.infer<typeof EvaluationScoreDocument>;
export declare const EvaluatorStats: z.ZodObject<{
    dataset_id: z.ZodString;
    dataset_name: z.ZodString;
    evaluator_name: z.ZodString;
    example_count: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    stats: z.ZodObject<{
        mean: z.ZodNumber;
        median: z.ZodNumber;
        std_dev: z.ZodNumber;
        min: z.ZodNumber;
        max: z.ZodNumber;
        count: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type EvaluatorStats = z.infer<typeof EvaluatorStats>;
export declare const TraceSpan: z.ZodObject<{
    span_id: z.ZodString;
    trace_id: z.ZodString;
    parent_span_id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    kind: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    start_time: z.ZodString;
    end_time: z.ZodOptional<z.ZodString>;
    duration_ms: z.ZodNumber;
    attributes: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
}, z.core.$strip>;
export type TraceSpan = z.infer<typeof TraceSpan>;

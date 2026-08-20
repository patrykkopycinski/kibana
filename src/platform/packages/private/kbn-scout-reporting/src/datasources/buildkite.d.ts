/**
 * Buildkite info
 */
export interface BuildkiteMetadata {
    branch?: string;
    commit?: string;
    job_id?: string;
    retry_count?: number;
    message?: string;
    build: {
        id?: string;
        number?: string;
        url?: string;
    };
    pipeline: {
        id?: string;
        name?: string;
        slug?: string;
    };
    agent: {
        name?: string;
    };
    group: {
        id?: string;
        key?: string;
        label?: string;
    };
    step: {
        id?: string;
        key?: string;
        label?: string;
    };
    command?: string;
    triggered_from_build: {
        id?: string;
        number?: string;
        pipeline_slug?: string;
    };
}
/**
 * Buildkite information extracted from environment variables
 *
 * This object is empty if the process is not running in a Buildkite pipeline.
 */
export declare const buildkite: BuildkiteMetadata;

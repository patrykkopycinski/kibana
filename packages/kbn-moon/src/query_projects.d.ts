import { type ValidationDownstreamMode } from '@kbn/dev-utils';
export type MoonDownstreamMode = ValidationDownstreamMode;
/** Minimal Moon project metadata needed for affected-source resolution. */
export interface MoonProject {
    id: string;
    sourceRoot: string;
}
/** Derived summary of affected projects for root-project escalation handling. */
export interface MoonAffectedProjectSummary {
    sourceRoots: string[];
    isRootProjectAffected: boolean;
}
/** Resolved base revision metadata for Moon affected queries. */
export interface MoonAffectedBase {
    base: string;
    baseRef: string;
}
/** Options for resolving the affected base revision from git state. */
export interface ResolveMoonAffectedBaseOptions {
    headRef?: string;
}
export declare const ROOT_MOON_PROJECT_ID = "kibana";
/** Normalizes repository-relative paths to POSIX separators for stable matching. */
export declare const normalizeRepoRelativePath: (pathValue: string) => string;
/** Resolves the path to the Moon executable. */
export declare const getMoonExecutablePath: () => Promise<string>;
/** Resolves the base revision used for Moon affected comparisons. */
export declare const resolveMoonAffectedBase: ({ headRef, }?: ResolveMoonAffectedBaseOptions) => Promise<MoonAffectedBase>;
/**
 * Queries Moon for affected projects by piping pre-resolved changed files JSON
 * into `moon query projects --affected`.
 *
 * Use this when changed files have already been resolved to avoid duplicate Moon queries.
 */
export declare const getAffectedMoonProjectsFromChangedFiles: ({ changedFilesJson, downstream, }: {
    changedFilesJson: string;
    downstream?: MoonDownstreamMode;
}) => Promise<MoonProject[]>;
/** Summarizes affected Moon projects into non-root source roots and root-project flag. */
export declare const summarizeAffectedMoonProjects: (projects: MoonProject[]) => MoonAffectedProjectSummary;

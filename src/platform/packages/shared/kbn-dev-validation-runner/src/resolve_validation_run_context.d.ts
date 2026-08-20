import { type ResolvedValidationContract } from '@kbn/dev-utils';
import { type MoonAffectedBase } from '@kbn/moon';
/** Raw CLI flag inputs used to resolve a validation run contract. */
export interface ValidationRunFlagsInput {
    profile?: string;
    scope?: string;
    testMode?: string;
    downstream?: string;
    baseRef?: string;
    headRef?: string;
}
interface ValidationRunContextBase {
    contract: ResolvedValidationContract;
}
type ValidationRunSkipContext = ValidationRunContextBase & {
    kind: 'skip';
    reason: 'no_staged_changes';
};
type ValidationRunFullContext = ValidationRunContextBase & {
    kind: 'full';
    reason?: 'resolve_branch_scope_failed';
};
type ValidationRunAffectedContext = ValidationRunContextBase & {
    kind: 'affected';
    resolvedBase?: MoonAffectedBase;
    branchCommitCount?: number;
    changedFiles: string[];
};
export type ValidationRunContext = ValidationRunSkipContext | ValidationRunFullContext | ValidationRunAffectedContext;
export interface ValidationAffectedProjectsContext {
    affectedSourceRoots: string[];
    isRootProjectAffected: boolean;
}
/** Inputs for resolving a contract-driven validation run context. */
export interface ResolveValidationRunContextOptions {
    flags: ValidationRunFlagsInput;
    runnerDescription?: string;
    onWarning?: (message: string) => void;
}
export interface ResolveValidationAffectedProjectsOptions {
    changedFilesJson: string;
    downstream?: 'none' | 'direct' | 'deep';
}
/** Rejects validation-contract flags when a command is running in direct-target mode. */
export declare const assertNoValidationRunFlagsForDirectTarget: (flags: ValidationRunFlagsInput) => void;
/** Resolves a concrete validation run context from CLI flags, including changed-file scope data. */
export declare const resolveValidationRunContext: ({ flags, runnerDescription, onWarning, }: ResolveValidationRunContextOptions) => Promise<ValidationRunContext>;
/**
 * Resolves Moon-affected project roots from pre-resolved changed files.
 *
 * Accepts `changedFilesJson` (Moon JSON format) to pipe directly into
 * `moon query projects --affected`, avoiding duplicate Moon queries.
 */
export declare const resolveValidationAffectedProjects: ({ changedFilesJson, downstream, }: ResolveValidationAffectedProjectsOptions) => Promise<ValidationAffectedProjectsContext>;
export {};

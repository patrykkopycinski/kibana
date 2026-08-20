/**
 * Generic input artifact handed to Scout selective-testing logic by the
 * Buildkite layer. Contains everything Scout needs to make a selective-testing
 * decision without having to call git/repo tooling itself.
 */
export interface CodeChanges {
    /** Git ref the diff was computed against. */
    mergeBase: string;
    /** Repo-relative paths of files changed since `mergeBase`. */
    changedFiles: string[];
    /** @kbn/ module IDs identified as affected by the changed files (downstream-included). */
    affectedModules: string[];
}
/**
 * Read and validate a code-changes JSON file produced by the Buildkite Scout
 * resolver. Throws (via createFailError) on missing/invalid input — selective
 * testing must not silently fall back to a wrong mode.
 */
export declare const readCodeChanges: (filePath: string) => CodeChanges;

type ChangedFilesScope = 'local' | 'staged' | 'branch';
export interface GetMoonChangedFilesOptions {
    scope: ChangedFilesScope;
    base?: string;
    head?: string;
}
/** Builds CLI args for `moon query changed-files` based on scope. */
export declare const buildChangedFilesArgs: ({ scope, base, head }: GetMoonChangedFilesOptions) => string[];
/**
 * Queries Moon for changed files in the given scope.
 *
 * Returns repo-relative paths of files that exist on disk (deleted files are excluded).
 */
export declare const getMoonChangedFiles: ({ scope, base, head, }: GetMoonChangedFilesOptions) => Promise<string[]>;
export {};

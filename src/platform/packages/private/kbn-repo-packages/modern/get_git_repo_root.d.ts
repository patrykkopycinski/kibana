declare const _exports: {
    getGitRepoRootSync: typeof getGitRepoRootSync;
};
export = _exports;
/**
 * Synchronously get the git repo root for a given repoRoot and cache the result for the execution
 * @param {string} repoRoot
 * @returns {string | null}
 */
declare function getGitRepoRootSync(repoRoot: string): string | null;

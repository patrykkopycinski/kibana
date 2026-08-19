declare const _exports: {
    getRepoRels: typeof getRepoRels;
    getRepoRelsSync: typeof getRepoRelsSync;
};
export = _exports;
/**
 * List the files in the repo, only including files which are manged by version
 * control or "untracked" (new, not committed, and not ignored).
 * @param {string} repoRoot limit the list to specfic absolute paths
 * @param {string[] | undefined} include limit the list to specfic absolute paths
 * @param {string[] | undefined} exclude exclude specific absolute paths
 * @returns {Promise<Iterable<string>>}
 */
declare function getRepoRels(repoRoot: string, include?: string[] | undefined, exclude?: string[] | undefined): Promise<Iterable<string>>;
/**
 * Synchronously list the files in the repo, only including files which are manged by version
 * control or "untracked" (new, not committed, and not ignored).
 * @param {string} repoRoot limit the list to specfic absolute paths
 * @param {string[] | undefined} include limit the list to specfic absolute paths
 * @param {string[] | undefined} exclude exclude specific absolute paths
 * @returns {Iterable<string>}
 */
declare function getRepoRelsSync(repoRoot: string, include?: string[] | undefined, exclude?: string[] | undefined): Iterable<string>;

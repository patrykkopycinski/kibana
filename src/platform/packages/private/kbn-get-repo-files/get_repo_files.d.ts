import { RepoPath } from '@kbn/repo-path';
/**
 * List the files in the repo, only including files which are manged by version
 * control or "untracked" (new, not committed, and not ignored).
 * @param include limit the list to specfic absolute paths
 * @param exclude exclude specific absolute paths
 */
export declare function getRepoFiles(include?: string[], exclude?: string[]): Promise<RepoPath[]>;

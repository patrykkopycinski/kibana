declare const _exports: {
    REPO_ROOT: string;
    PKG_JSON: import("./types").KibanaPackageJson;
    kibanaPackageJson: import("./types").KibanaPackageJson;
    isKibanaDistributable: () => boolean;
    UPSTREAM_BRANCH: string;
    fromRoot: typeof fromRoot;
};
export = _exports;
export type KibanaPackageJson = import('./types').KibanaPackageJson;
/**
 * @param {string[]} paths
 */
declare const fromRoot: (...paths: string[]) => string;

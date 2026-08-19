declare const _exports: {
    readPackageManifest: typeof readPackageManifest;
};
export = _exports;
/**
 * Parse a kibana.jsonc file from the filesystem
 * @param {string} repoRoot
 * @param {string} path
 */
declare function readPackageManifest(repoRoot: string, path: string): import("./types").KibanaPackageManifest;

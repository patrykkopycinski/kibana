declare const _exports: {
    getPackages: typeof getPackages;
    getPkgDirMap: typeof getPkgDirMap;
    getPkgsById: typeof getPkgsById;
    updatePackageMap: typeof updatePackageMap;
    removePackagesFromPackageMap: typeof removePackagesFromPackageMap;
    findPackageForPath: typeof findPackageForPath;
    readPackageMap: typeof readPackageMap;
    readHashOfPackageMap: typeof readHashOfPackageMap;
};
export = _exports;
import { Package } from './package';
export type PkgDirMap = Map<string, import('./package').Package>;
export type PkgsById = Map<string, import('./package').Package>;
/**
 * Read the pkgmap from disk and parse it into a Map
 * @param {string=} packageMapPath
 * @returns {Map<string, string>}
 */
declare function readPackageMap(packageMapPath?: string | undefined): Map<string, string>;
/**
 * Removes packages from the package map
 * @param {string[]} names
 * @param {string=} packageMapPath
 */
declare function removePackagesFromPackageMap(names: string[], packageMapPath?: string | undefined): void;
/**
 * Get the hash of the pkgmap, used for populating some cache keys
 * @returns {string}
 */
declare function readHashOfPackageMap(): string;
/**
 * @param {string} repoRoot
 * @param {string[]} manifestPaths
 */
declare function updatePackageMap(repoRoot: string, manifestPaths: string[]): boolean;
/**
 * Resolves to an array of Package instances which parse the manifest files,
 * package.json files, and provide useful metadata about each package.
 * @param {string} repoRoot
 * @returns {Package[]}
 */
declare function getPackages(repoRoot: string): Package[];
/**
 * Get a map of repoRelative directories to packages
 * @param {string} repoRoot
 */
declare function getPkgDirMap(repoRoot: string): Map<string, Package>;
/**
 * Get a map of packages by id
 * @param {string} repoRoot
 * @returns {PkgsById}
 */
declare function getPkgsById(repoRoot: string): PkgsById;
/**
 * Find the package which contains this path, if one exists
 * @param {string} repoRoot
 * @param {string} path absolute path to a file
 */
declare function findPackageForPath(repoRoot: string, path: string): Package | undefined;

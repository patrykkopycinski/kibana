export { Package };
/**
 * Representation of a Package in the Kibana repository
 * @class
 */
declare class Package {
    /**
     * Absolute path to this package directory
     * @type {string}
     * @readonly
     */
    directory: string;
    /**
     * repo relative path to the root of the package
     * @type {string}
     * @readonly
     */
    normalizedRepoRelativeDir: string;
    /**
     * copy of the parsed kibana.jsonc manifest of the package
     *
     * @type {import('./types').KibanaPackageManifest}
     * @readonly
     * @deprecated rather than accessing this directly the necessary information about the package should be reflected on the Package class.
     */
    manifest: import('./types').KibanaPackageManifest;
    /**
     * copy of the parsed package.json file in the package
     * @type {import('./types').ParsedPackageJson | undefined}
     * @readonly
     * @deprecated rather than accessing this directly the necessary information about the package should be reflected on the Package class.
     */
    pkg: import('./types').ParsedPackageJson | undefined;
    /**
     * the name/import id of the package
     * @type {string}
     * @readonly
     */
    name: string;
    /**
     * the name/import id of the package
     * @type {string}
     * @readonly
     */
    id: string;
    /**
     * the group to which this package belongs
     * @type {import('@kbn/projects-solutions-groups').ModuleGroup}
     * @readonly
     */
    group: import('@kbn/projects-solutions-groups').ModuleGroup;
    /**
     * the visibility of this package, i.e. whether it can be accessed by everybody or only modules in the same group
     * @type {import('@kbn/projects-solutions-groups').ModuleVisibility}
     * @readonly
     */
    visibility: import('@kbn/projects-solutions-groups').ModuleVisibility;
    /**
     * Create a Package object from a package directory. Reads some files from the package and returns
     * a Promise for a Package instance.
     * @param {string} repoRoot
     * @param {string} path
     */
    static fromManifest(repoRoot: string, path: string): Package;
    /**
     * Sort an array of packages
     * @param {Package} a
     * @param {Package} b
     */
    static sorter(a: Package, b: Package): number;
    /**
     * @internal
     */
    constructor(
    /**
     * Absolute path to the root of the repository
     * @type {string}
     */
    repoRoot: string, 
    /**
     * Absolute path to the package directory
     * @type {string}
     */
    dir: string, 
    /**
     * Parsed kibana.jsonc manifest from the package
     * @type {import('./types').KibanaPackageManifest}
     */
    manifest: import('./types').KibanaPackageManifest, 
    /**
     * Parsed package.json file from the package
     * @type {import('./types').ParsedPackageJson | undefined}
     */
    pkg: import('./types').ParsedPackageJson | undefined);
    /**
     * Is this package highlighted as a "dev only" package? If so it will always
     * be listed in the devDependencies and will never end up in the build
     * @returns {boolean}
     */
    isDevOnly(): boolean;
    /**
     * Does this package expose a plugin, is it of one of the plugin types?
     * @returns {this is import('./types').PluginPackage}
     */
    isPlugin(): this is import('./types').PluginPackage;
    /**
     * Returns the group to which this package belongs
     * @returns {import('@kbn/projects-solutions-groups').ModuleGroup}
     */
    getGroup(): import('@kbn/projects-solutions-groups').ModuleGroup;
    /**
     * Returns the package visibility, i.e. whether it can be accessed by everybody or only packages in the same group
     * @returns {import('@kbn/projects-solutions-groups').ModuleVisibility}
     */
    getVisibility(): import('@kbn/projects-solutions-groups').ModuleVisibility;
    /**
     * Returns true if the package represents some type of plugin
     * @returns {import('./types').PluginCategoryInfo}
     */
    getPluginCategories(): import('./types').PluginCategoryInfo;
    determineGroupAndVisibility(): {
        group: import("@kbn/projects-solutions-groups").ModuleGroup;
        visibility: import("@kbn/projects-solutions-groups").ModuleVisibility;
    };
}

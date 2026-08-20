declare const _exports: {
    getPluginSearchPaths: typeof getPluginSearchPaths;
    getPluginPackagesFilter: typeof getPluginPackagesFilter;
};
export = _exports;
/**
 * @param {{ rootDir: string }} options
 * @returns {string[]}
 */
declare function getPluginSearchPaths({ rootDir }: {
    rootDir: string;
}): string[];
/**
 * @param {import('./types').PluginSelector} selector
 * @returns {(pkg: import('./package').Package) => pkg is import('./types').PluginPackage}
 */
declare function getPluginPackagesFilter(selector?: import('./types').PluginSelector): (pkg: import('./package').Package) => pkg is import('./types').PluginPackage;

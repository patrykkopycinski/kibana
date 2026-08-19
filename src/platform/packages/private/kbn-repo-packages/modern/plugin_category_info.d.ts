declare const _exports: {
    PLUGIN_CATEGORY: symbol;
    isValidPluginCategoryInfo: typeof isValidPluginCategoryInfo;
};
export = _exports;
/**
 *
 * @param {unknown} v
 * @returns {v is import('./types').PluginCategoryInfo}
 */
declare const isValidPluginCategoryInfo: (v: unknown) => v is import('./types').PluginCategoryInfo;

declare const _exports: {
    PACKAGE_TYPES: import("./types").KibanaPackageType[];
    isSomeString: typeof isSomeString;
    isObj: typeof isObj;
    isValidPluginId: typeof isValidPluginId;
    isValidPkgType: typeof isValidPkgType;
    isArrOfIds: typeof isArrOfIds;
    isArrOfStrings: typeof isArrOfStrings;
};
export = _exports;
/**
 * @param {unknown} v
 * @returns {v is string}
 */
declare function isSomeString(v: unknown): v is string;
/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
declare function isObj(v: unknown): v is Record<string, unknown>;
/**
 * @param {unknown} v
 * @returns {v is string}
 */
declare function isValidPluginId(v: unknown): v is string;
/**
 * @param {unknown} v
 * @returns {v is import('./types').KibanaPackageType}
 */
declare function isValidPkgType(v: unknown): v is import('./types').KibanaPackageType;
/**
 * @param {unknown} v
 * @returns {v is string[]}
 */
declare function isArrOfStrings(v: unknown): v is string[];
/**
 * @param {unknown} v
 * @returns {v is string[]}
 */
declare function isArrOfIds(v: unknown): v is string[];

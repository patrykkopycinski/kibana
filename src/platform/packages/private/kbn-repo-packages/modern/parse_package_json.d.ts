declare const _exports: {
    readPackageJson: typeof readPackageJson;
    validateParsedPackageJson: typeof validateParsedPackageJson;
};
export = _exports;
/**
 * Asserts that given value looks like a parsed package.json file
 * @param {unknown} v
 * @returns {asserts v is import('./types').ParsedPackageJson}
 */
declare function validateParsedPackageJson(v: unknown): asserts v is import('./types').ParsedPackageJson;
/**
 * Reads a given package.json file from disk and parses it
 * @param {string} path
 * @returns {import('./types').ParsedPackageJson | undefined}
 */
declare function readPackageJson(path: string): import('./types').ParsedPackageJson | undefined;

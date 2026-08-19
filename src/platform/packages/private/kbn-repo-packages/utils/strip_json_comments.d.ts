declare const _exports: {
    stripJsonComments: typeof stripJsonComments;
};
export = _exports;
/**
 * @param {string} jsonString
 * @param {{ whitespace?: boolean; trailingCommas?: boolean }} options
 */
declare function stripJsonComments(jsonString: string, { whitespace, trailingCommas }?: {
    whitespace?: boolean;
    trailingCommas?: boolean;
}): string;

/**
 * @param {import('../lifecycle').Lifecycle} lifecycle
 * @param {any} context
 * @param {{ rootTags?: string[], hookTimeout?: number, testTimeout?: number }} options
 */
export declare function decorateMochaUi(lifecycle: import('../lifecycle').Lifecycle, context: any, { rootTags, hookTimeout, testTimeout }: {
    rootTags?: string[];
    hookTimeout?: number;
    testTimeout?: number;
}): any;

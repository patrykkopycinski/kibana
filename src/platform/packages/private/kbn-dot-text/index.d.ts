declare const _exports: {
    getJsSource: typeof getJsSource;
    getJsSourceSync: typeof getJsSourceSync;
};
export = _exports;
/**
 *
 * @param {import('./types').Options} options
 * @returns {Promise<import('./types').Result>}
 */
declare function getJsSource(options: import('./types').Options): Promise<import('./types').Result>;
/**
 * @param {import('./types').SyncOptions} options
 * @returns
 */
declare function getJsSourceSync(options: import('./types').SyncOptions): {
    source: string;
};

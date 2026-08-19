declare const _exports: {
    /**
     * Absolute path to the distributable directory
     */
    distDir: string;
    /**
     * Path to dll manifest of modules included in this bundle
     */
    dllManifestPath: string;
    /**
     * Filename of the main bundle file in the distributable directory
     */
    dllFilename: string;
    /**
     * Webpack loader for configuring the public path lookup from `window.__kbnPublicPath__`.
     */
    publicPathLoader: string;
};
export = _exports;
export type ThemeVersion = 'v8';

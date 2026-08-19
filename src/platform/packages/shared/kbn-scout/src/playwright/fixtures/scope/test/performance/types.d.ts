export interface BundleInfo {
    url: string;
    name: string;
    plugin: string;
    transferredSize: number;
    headersSize: number;
}
export interface PluginInfo {
    count: number;
    totalSize: number;
    bundles: Array<{
        name: string;
        transferredSize: number;
    }>;
}
export interface PageInfo {
    bundleCount: number;
    totalSize: number;
    pluginCount: number;
    plugins: Array<{
        name: string;
        bundlesCount: number;
        totalSize: number;
        bundles: Array<{
            name: string;
            transferredSize: number;
        }>;
    }>;
}
export interface PerformanceMetrics {
    jsHeapUsedSize?: number;
    jsHeapTotalSize?: number;
    cpuTime?: number;
    scriptTime?: number;
    layoutTime?: number;
    fps?: number;
    nodesCount?: number;
    documentsCount?: number;
    layoutCount?: number;
    styleRecalcCount?: number;
}

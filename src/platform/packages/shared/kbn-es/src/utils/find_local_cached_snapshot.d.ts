export declare function shouldPreferCachedSnapshot(useCached?: boolean): boolean;
export declare function getSnapshotPlatformArch(): {
    platform: string;
    arch: string;
    ext: string;
};
export declare function getSnapshotCacheFilename(version: string): string;
export declare function findLocalCachedSnapshot(basePath: string, version: string): string | undefined;

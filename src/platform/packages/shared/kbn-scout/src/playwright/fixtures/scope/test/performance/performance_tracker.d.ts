import type { CDPSession, TestInfo } from '@playwright/test';
import type { BundleInfo, PageInfo, PerformanceMetrics } from './types';
export declare class PerformanceTracker {
    private testInfo;
    private bundleResponses;
    constructor(testInfo: TestInfo);
    private getRequestData;
    captureBundleResponses(cdp: CDPSession): void;
    waitForJsLoad(cdp: CDPSession, timeout?: number): Promise<void>;
    computeBundleStats(bundleResponses: Map<string, BundleInfo>): PageInfo;
    collectJsBundleStats(url: string): PageInfo;
    capturePagePerformanceMetrics(cdp: CDPSession): Promise<{
        jsHeapUsedSize: number | undefined;
        jsHeapTotalSize: number | undefined;
        cpuTime: number | undefined;
        scriptTime: number | undefined;
        layoutTime: number | undefined;
        fps: number | undefined;
        nodesCount: number | undefined;
        documentsCount: number | undefined;
        layoutCount: number | undefined;
        styleRecalcCount: number | undefined;
    }>;
    private comparePerformanceMetrics;
    collectPagePerformanceStats: (url: string, before: PerformanceMetrics, after: PerformanceMetrics) => Record<string, {
        before: number;
        after: number;
        diff: number;
        percentage: string;
    }>;
}

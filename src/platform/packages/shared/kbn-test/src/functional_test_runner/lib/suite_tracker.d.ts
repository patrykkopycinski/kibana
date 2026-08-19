import type { Lifecycle } from './lifecycle';
export interface SuiteInProgress {
    startTime?: Date;
    endTime?: Date;
    success?: boolean;
}
export interface SuiteWithMetadata {
    config: string;
    file: string;
    tag: string;
    title: string;
    startTime: Date;
    endTime: Date;
    duration: number;
    success: boolean;
    hasTests: boolean;
}
export declare class SuiteTracker {
    finishedSuitesByConfig: Record<string, Record<string, SuiteWithMetadata>>;
    inProgressSuites: Map<object, SuiteInProgress>;
    static startTracking(lifecycle: Lifecycle, configPath: string): SuiteTracker;
    getTracked(suite: object): SuiteInProgress;
    constructor(lifecycle: Lifecycle, configPathAbsolute: string);
    getAllFinishedSuites(): SuiteWithMetadata[];
}

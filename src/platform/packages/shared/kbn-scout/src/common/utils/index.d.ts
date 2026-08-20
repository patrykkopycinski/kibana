import type { ToolingLog } from '@kbn/tooling-log';
export declare function silence(log: ToolingLog, milliseconds: number): Promise<void>;
/**
 * Measure the performance of a sync function
 */
export declare const measurePerformance: <T>(log: ToolingLog, label: string, fn: () => T) => T;
/**
 * Measure the performance of an async function
 */
export declare const measurePerformanceAsync: <T>(log: ToolingLog, label: string, fn: () => Promise<T>) => Promise<T>;
export { validateAndProcessTestFiles, type TestFilesValidationResult } from './test_files';

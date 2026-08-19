import { exec } from 'child_process';
import { type ScoutTestTarget } from '@kbn/scout-info';
export declare const execPromise: typeof exec.__promisify__;
/**
 * Returns a new env object with `--require=@kbn/swc-register/install` appended
 * to `NODE_OPTIONS`, so that Playwright (spawned as a binary) and any worker
 * processes it forks internally use Kibana's SWC transpilation for CommonJS
 * imports. Idempotent when the flag is already present.
 */
export declare function withKibanaSwcRegister(env?: Record<string, string | undefined>): Record<string, string | undefined>;
export declare const isValidUTCDate: (date: string) => boolean;
export declare function formatTime(date: string, fmt?: string): string;
export declare const getPlaywrightGrepTag: (testTarget: ScoutTestTarget) => string;

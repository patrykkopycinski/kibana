import type { ToolingLog } from '@kbn/tooling-log';
import type { ScoutPlaywrightProjects } from '../types';
import type { RunTestsOptions } from './flags';
export declare const getPlaywrightProject: (testTarget: RunTestsOptions['testTarget']) => ScoutPlaywrightProjects;
export declare function hasTestsInPlaywrightConfig(log: ToolingLog, cmd: string, cmdArgs: string[], configPath: string): Promise<number>;
export declare function runTests(log: ToolingLog, options: RunTestsOptions): Promise<void>;
export declare function runPlaywrightTestCheck(log: ToolingLog): Promise<void>;

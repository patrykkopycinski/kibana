import type { PlaywrightTestConfig, PlaywrightTestOptions } from 'playwright/test';
import type { ScoutTestChannel } from '@kbn/scout-info';
export type Protocol = 'http' | 'https';
export declare const VALID_CONFIG_MARKER: unique symbol;
export type ScoutPlaywrightProjects = 'local' | 'ech' | 'mki';
export type ScoutConfigName = 'local' | 'cloud_ech' | 'cloud_mki';
export interface ScoutTestOptions extends PlaywrightTestOptions {
    serversConfigDir: string;
    configName: ScoutConfigName;
    [VALID_CONFIG_MARKER]: boolean;
    runGlobalSetup?: boolean;
}
export interface ScoutPlaywrightOptions extends Pick<PlaywrightTestConfig, 'testDir' | 'workers'> {
    testDir: string;
    workers?: 1 | 2 | 3;
    /**
     * When true, runs global.setup.ts as a pre-step before running tests.
     * Defaults to false.
     */
    runGlobalSetup?: boolean;
    metadata?: {
        scout?: {
            testChannels?: ScoutTestChannel[];
        };
        [key: string]: unknown;
    };
}
export type { ScoutTestChannel, ScoutTestChannelsDefinition } from '@kbn/scout-info';

import type { Command } from '@kbn/dev-cli-runner';
import type { ToolingLog } from '@kbn/tooling-log';
export declare function generateScoutConfigManifest(configPath: string, log?: ToolingLog): Promise<import("../playwright/cli_wrapper/common").PlaywrightCLIResult>;
export declare function updateScoutConfigManifests(onlyOutdated: boolean, removeDangling: boolean, reload: boolean, concurrencyLimit: number, log: ToolingLog): Promise<string[]>;
export declare const updateTestConfigManifests: Command<void>;

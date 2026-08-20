import type { ToolingLog } from '@kbn/tooling-log';
import type { Command } from '@kbn/dev-cli-runner';
import type { ScoutTestChannel } from '@kbn/scout-info';
import type { ScoutTestTarget } from '@kbn/scout-info';
import type { ScoutTestConfigStats } from '@kbn/scout-reporting';
import { type ScoutTestConfig } from '@kbn/scout-reporting';
import type { TestTrack } from '../execution/test_track';
/**
 * Selects which Scout test configs are eligible for distribution into lanes.
 *
 * - `kind: 'modules'` → keep configs whose owning @kbn/ module ID is in `ids`
 * - `kind: 'configs'` → keep configs whose repo-relative path is in `paths`
 * - `kind: 'channels'` → keep configs that match any of the test channels in `channels`
 */
export type TestLoadFilter = {
    kind: 'modules';
    ids: ReadonlySet<string>;
} | {
    kind: 'configs';
    paths: ReadonlySet<string>;
} | {
    kind: 'channels';
    channels: ReadonlySet<ScoutTestChannel>;
};
export interface ScoutCIConfig {
    plugins: {
        enabled: string[];
        disabled: string[];
    };
    packages: {
        enabled: string[];
        disabled: string[];
    };
    excluded_configs: string[];
}
export interface ScoutCITestLoad {
    config: ScoutTestConfig;
    enabled: boolean;
    stats?: ScoutTestConfigStats['data']['configs'][0];
}
export declare function identifyTestLoads(scoutCIConfig: ScoutCIConfig, testConfigStats: ScoutTestConfigStats, testTarget: ScoutTestTarget, testLoadFilters: TestLoadFilter[], log: ToolingLog): ScoutCITestLoad[];
export declare function buildTrack(runtimeTarget: number, estimatedLaneSetupDuration: number, testTarget: ScoutTestTarget, testLoads: ScoutCITestLoad[], log: ToolingLog): TestTrack;
export declare function msToHuman(ms: number): string;
export declare const createTestTracks: Command<void>;

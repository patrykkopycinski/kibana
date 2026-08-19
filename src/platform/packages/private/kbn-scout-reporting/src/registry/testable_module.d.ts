export interface ScoutTestableModule {
    name: string;
    group: string;
    type: 'plugin' | 'package';
    visibility: 'shared' | 'private';
    root: string;
}
export interface ScoutTestableModuleWithConfigs extends ScoutTestableModule {
    configs: Omit<ScoutTestConfig, 'module'>[];
}
import { type ScoutTestConfig } from './test_config';
export declare const testableModules: {
    readonly all: ScoutTestableModule[];
    readonly allIncludingConfigs: ScoutTestableModuleWithConfigs[];
    ofType(moduleType: ScoutTestableModule['type']): ScoutTestableModule[];
    readonly plugins: ScoutTestableModule[];
    readonly packages: ScoutTestableModule[];
};

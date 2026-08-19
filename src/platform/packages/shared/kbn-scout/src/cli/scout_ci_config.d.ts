export type ScoutCiConfigModuleKind = 'plugins' | 'packages';
export interface ScoutCiConfigModule {
    kind: ScoutCiConfigModuleKind;
    name: string;
}
export declare const getScoutCiConfigModuleFromPath: (relativePath: string) => ScoutCiConfigModule;
export interface UpsertScoutCiConfigModuleResult {
    updatedYml: string;
    didChange: boolean;
    wasAlreadyEnabled: boolean;
    movedFromDisabled: boolean;
}
export declare const upsertEnabledModuleInScoutCiConfigYml: (yml: string, module: ScoutCiConfigModule) => UpsertScoutCiConfigModuleResult;

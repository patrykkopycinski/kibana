import type { ToolingLog } from '@kbn/tooling-log';
import type { FlattenedConfigGroup, ModuleDiscoveryInfo } from './types';
export declare const saveModuleDiscoveryInfo: (modules: ModuleDiscoveryInfo[], log: ToolingLog) => void;
export declare const saveFlattenedConfigGroups: (flattenedConfigs: FlattenedConfigGroup[], log: ToolingLog) => void;

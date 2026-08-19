import type { ToolingLog } from '@kbn/tooling-log';
import type { FtrConfigProvider, GenericFtrProviderContext } from '../../public_types';
import { Config } from './config';
import type { EsVersion } from '../es_version';
interface Journey {
    config: {
        isSkipped(): boolean;
    };
    testProvider(ctx: GenericFtrProviderContext<any, any>): void;
}
export type ConfigModule = {
    type: 'config';
    path: string;
    provider: FtrConfigProvider;
} | {
    type: 'journey';
    path: string;
    provider: FtrConfigProvider;
    journey: Journey;
};
export declare function readConfigFile(log: ToolingLog, esVersion: EsVersion, path: string, settingOverrides?: any, extendSettings?: (vars: any) => any): Promise<Config>;
export {};

import { type EsClientForTestingOptions } from '@kbn/test-es-server';
import type { Config } from './functional_test_runner';
export type { EsClientForTestingOptions };
export declare function createRemoteEsClientForFtrConfig(config: Config, overrides?: Omit<EsClientForTestingOptions, 'esUrl'>): import("@elastic/elasticsearch").Client;
export declare function createEsClientForFtrConfig(config: Config, overrides?: Omit<EsClientForTestingOptions, 'esUrl'>): import("@elastic/elasticsearch").Client;

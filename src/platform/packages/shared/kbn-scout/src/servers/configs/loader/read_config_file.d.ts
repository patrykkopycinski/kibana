import type { ScoutServerConfig } from '../../../types';
import type { Config } from '../config';
/**
 * Dynamically loads the raw server configuration object from a config file.
 * @param configPath Path to the configuration file to be loaded.
 * @returns Raw ScoutServerConfig object before validation
 */
export declare const loadRawServerConfig: (configPath: string) => Promise<ScoutServerConfig>;
/**
 * Dynamically loads server configuration file in the "kbn-scout" framework. It reads
 * and validates the configuration file, ensuring the presence of essential servers
 * information required to initialize the testing environment.
 * @param configPath Path to the configuration file to be loaded.
 * @returns Config instance that is used to start local servers
 */
export declare const readConfigFile: (configPath: string) => Promise<Config>;

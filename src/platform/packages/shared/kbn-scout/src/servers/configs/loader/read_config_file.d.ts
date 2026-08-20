/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

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

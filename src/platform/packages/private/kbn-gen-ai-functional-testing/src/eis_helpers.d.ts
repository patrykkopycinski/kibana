/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
export interface DiscoveredModel {
  inferenceId: string;
  modelId: string;
  metadata?: {
    heuristics?: {
      properties?: string[];
    };
  };
}
export declare const getPreDiscoveredEisModels: () => DiscoveredModel[];
/**
 * Builds preconfigured connectors for EIS models.
 * These connectors reference EIS inference endpoints that will exist once CCM is enabled.
 */
export declare const buildEisPreconfiguredConnectors: () => Record<string, unknown>;
/**
 * Enables Cloud Connected Mode (CCM) for EIS and waits for endpoints to be available.
 * Once CCM is enabled, EIS auto-provisions inference endpoints that preconfigured connectors reference.
 */
export declare const enableCcm: (es: Client, apiKey: string, log: ToolingLog) => Promise<void>;

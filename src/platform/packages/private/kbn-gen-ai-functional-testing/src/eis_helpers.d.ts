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

/** Map of config relative path -> number of shards */
export type ShardMap = Record<string, number>;
export interface ShardAnnotation {
    /** The config path (without annotation) */
    config: string;
    /** The shard string, e.g. "1/2", or undefined if no annotation */
    shard?: string;
}
/**
 * Reads and caches the shard configuration from `.buildkite/sharded_jest_configs.json`.
 * Returns an empty map if the file does not exist or cannot be parsed.
 */
export declare function loadShardConfig(): ShardMap;
/**
 * Resets the cached shard map (useful for testing).
 */
export declare function resetShardConfigCache(): void;
/**
 * Parses a shard annotation from a config name string.
 *
 * @example
 *   parseShardAnnotation('path/jest.config.js||shard=1/2')
 *   // => { config: 'path/jest.config.js', shard: '1/2' }
 *
 *   parseShardAnnotation('path/jest.config.js')
 *   // => { config: 'path/jest.config.js' }
 */
export declare function parseShardAnnotation(name: string): ShardAnnotation;
/**
 * Annotates a config name with a shard value, producing a string like
 * `config.js||shard=1/2`.
 */
export declare function annotateConfigWithShard(config: string, shard: string): string;
/**
 * Expands a list of config names using a shard map. Configs that appear in the
 * shard map are replaced with N shard-annotated entries. Configs not in the map
 * (or already annotated) are passed through unchanged.
 *
 * @param configs - Array of config paths (relative to repo root)
 * @param shardMap - Map of config path -> shard count
 * @returns Expanded array with shard-annotated entries
 */
export declare function expandShardedConfigs(configs: string[], shardMap: ShardMap): string[];
/**
 * Looks up the shard count for a given config path (absolute or relative).
 * Returns the shard count if found, or undefined if the config is not sharded.
 */
export declare function getShardCountForConfig(configPath: string): number | undefined;

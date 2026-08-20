import type { ClientOptions as ESClientOptions } from '@elastic/elasticsearch/lib/client';
import type { Client as ESClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
/**
 * Get an Elasticsearch client for which connectivity has been validated
 *
 * @param esClientOptions Elasticsearch client options
 * @param helperSettings Settings for this helper
 * @param helperSettings.log Logger instance
 * @param helperSettings.cli Set to `true` when invoked from a CLI context
 * @throws FailError if cluster information cannot be read from the target Elasticsearch instance
 */
export declare function getValidatedESClient(esClientOptions: ESClientOptions, helperSettings: {
    log?: ToolingLog;
    cli?: boolean;
}): Promise<ESClient>;

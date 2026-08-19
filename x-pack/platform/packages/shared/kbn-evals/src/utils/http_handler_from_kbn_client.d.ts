import type { HttpHandler } from '@kbn/core/public';
import type { KbnClient } from '@kbn/kbn-client';
import type { ToolingLog } from '@kbn/tooling-log';
/**
 * Creates a function that matches the HttpHandler interface from Core's
 * API, using the KbnClient from @kbn/kbn-client
 */
export declare function httpHandlerFromKbnClient({ kbnClient, log, getExecutionId, getExperimentId, }: {
    kbnClient: KbnClient;
    log: ToolingLog;
    getExecutionId?: () => string | undefined;
    getExperimentId?: () => string | undefined;
}): HttpHandler;

import type { ScoutServerConfig } from '../../../types';
/**
 * Transforms a Scout server config to enable HTTP/2 with TLS.
 * Mutates `kbnTestServer.serverArgs` and `esTestCluster.serverArgs` in-place
 * and returns the modified config.
 *
 * Aligned with FTR's `configureHTTP2` in `src/platform/test/common/configure_http2.ts`.
 */
export declare const configureHTTP2: (config: ScoutServerConfig) => ScoutServerConfig;

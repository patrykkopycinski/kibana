import type { EnvironmentMode, PackageInfo } from '@kbn/config';
import type { LoggerFactory } from '@kbn/logging';
import type { CoreId } from '@kbn/core-base-common-internal';
/** @internal */
export interface CoreContext {
    coreId: CoreId;
    logger: LoggerFactory;
    env: CoreEnv;
}
/** @internal */
export interface CoreEnv {
    mode: Readonly<EnvironmentMode>;
    packageInfo: Readonly<PackageInfo>;
    airgapped: boolean;
    isCoreRenderingInReactConcurrentMode: boolean;
    /**
     * When `true`, browser core exposes an inert `window.__kbnNavDependencies__()`
     * bridge reporting cross-plugin navigation dependencies. Enabled only via the
     * internal `plugins.exposeNavDependencies` config (off by default).
     */
    exposeNavDependencies?: boolean;
}
